// =============================================================
// Merid - background deck sync (chrome.storage.local -> Firestore).
//
// Mirrors the local deck (savedWords + knownWords) into
// users/{uid}/words/{word} using the REST client in firebase-rest.js.
//
// Design:
//   - Diff-based: a persisted snapshot (vm_sync_snapshot) remembers what the
//     cloud already has; each run only sends what changed. Interrupted runs
//     (service worker teardown, lost network) resume from the snapshot.
//   - Atomic rate-limit compliance: every CREATE commits the word together
//     with the owner's daily counter bump in one Firestore commit, exactly as
//     firestore.rules demands (A04).
//   - Fail-soft everywhere: a lost connection queues work for the next wake;
//     nothing here can crash the extension (every entry point catches).
//   - Quiet logs (A09): only console.warn with coarse error codes - never
//     tokens, emails, words or payloads.
// =============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(root.VMFirebase);
    else root.VMSync = factory(root.VMFirebase);
})(typeof self !== 'undefined' ? self : globalThis, function (FB) {
    'use strict';

    const AUTH_KEY = 'vm_auth';            // { uid, email, refreshToken }
    const SNAPSHOT_KEY = 'vm_sync_snapshot'; // { [word]: contentHash }
    const STATUS_KEY = 'vm_sync_status';   // { state, pending, lastSyncAt, errorCode }

    const DAILY_LIMIT = 200;               // must match firestore.rules dailyLimit()
    const MAX_BACKOFF_MS = 5 * 60 * 1000;

    // How often the deck may be read back down. Listing the collection costs a
    // read per word, and runSync is kicked on every change to the local deck -
    // without a floor, saving five words in a row would list the whole thing
    // five times. Five minutes is well inside the patience of someone who has
    // just marked a word learned on the website and switched back to a tab.
    const PULL_INTERVAL_MS = 5 * 60 * 1000;

    // Matches the word regex in firestore.rules; anything else is skipped.
    const WORD_RE = /^[a-z](?:[a-z '-]*[a-z])?$/;

    // ---- In-memory (per service-worker life) ----
    let token = null;                      // { idToken, expiresAt, uid }
    let syncing = false;
    let dirty = false;                     // a change arrived while syncing
    let backoffMs = 0;
    let retryTimer = null;
    let lastPullAt = 0;                    // per service-worker life; see pullKnown

    // ---------------------------------------------------------
    // Small storage helpers
    // ---------------------------------------------------------
    function storeGet(keys) {
        return new Promise(resolve => chrome.storage.local.get(keys, resolve));
    }
    function storeSet(obj) {
        return new Promise(resolve => chrome.storage.local.set(obj, resolve));
    }
    function storeRemove(keys) {
        return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
    }

    async function setStatus(patch) {
        const cur = (await storeGet([STATUS_KEY]))[STATUS_KEY] || {};
        await storeSet({ [STATUS_KEY]: Object.assign({}, cur, patch) });
    }

    // ---------------------------------------------------------
    // Session management (called from the options page via messages)
    // ---------------------------------------------------------
    async function signIn(email, password, isNewAccount) {
        if (!FB.configured()) return { ok: false, code: 'NOT_CONFIGURED' };
        try {
            const r = isNewAccount ? await FB.signUp(email, password) : await FB.signIn(email, password);
            token = { idToken: r.idToken, uid: r.uid, expiresAt: Date.now() + (r.expiresIn - 60) * 1000 };
            await storeSet({ [AUTH_KEY]: { uid: r.uid, email, refreshToken: r.refreshToken } });
            // Fresh session: forget the snapshot so the whole local deck is
            // pushed (merged) into this account, and drop the read-back
            // throttle so this account's "learned" marks arrive at once rather
            // than up to five minutes later.
            await storeRemove([SNAPSHOT_KEY]);
            lastPullAt = 0;
            await setStatus({ state: 'idle', errorCode: null });
            kick();
            reconcileAiKey();  // fire-and-forget: restore/back up the Gemini key
            reconcileProfile(); // fire-and-forget: merge the learned profile
            return { ok: true, email };
        } catch (e) {
            return { ok: false, code: e.code || 'UNKNOWN' };
        }
    }

    async function signOut() {
        token = null;
        lastPullAt = 0;
        await storeRemove([AUTH_KEY, SNAPSHOT_KEY]);
        await setStatus({ state: 'signed-out', pending: 0, errorCode: null });
        return { ok: true };
    }

    /** Adopt a session handed over by merid.site (single sign-on). The token
     *  is validated against Google before anything is stored - a forged
     *  message can't plant a session. */
    async function adoptSession(refreshToken, email) {
        if (!FB.configured() || typeof refreshToken !== 'string' || !refreshToken) return { ok: false };
        try {
            const r = await FB.refresh(refreshToken);
            const cur = (await storeGet([AUTH_KEY]))[AUTH_KEY];
            token = { idToken: r.idToken, uid: r.uid, expiresAt: Date.now() + (r.expiresIn - 60) * 1000 };
            await storeSet({ [AUTH_KEY]: { uid: r.uid, email, refreshToken: r.refreshToken || refreshToken } });
            // New/different account: push the whole local deck up (merge), and
            // read its "learned" marks back down without waiting on the throttle.
            if (!cur || cur.uid !== r.uid) {
                await storeRemove([SNAPSHOT_KEY]);
                lastPullAt = 0;
            }
            await setStatus({ state: 'idle', errorCode: null });
            kick();
            reconcileAiKey();  // fire-and-forget: restore/back up the Gemini key
            reconcileProfile(); // fire-and-forget: merge the learned profile
            return { ok: true };
        } catch (e) {
            return { ok: false, code: e.code || 'UNKNOWN' };
        }
    }

    async function getStatus() {
        const r = await storeGet([AUTH_KEY, STATUS_KEY]);
        const auth = r[AUTH_KEY];
        const status = r[STATUS_KEY] || {};
        if (!FB.configured()) return { state: 'disabled' };
        if (!auth) return { state: 'signed-out' };
        return Object.assign({ state: 'idle' }, status, { email: auth.email });
    }

    // ---------------------------------------------------------
    // Gemini API key backup (users/{uid}/settings/ai).
    //
    // Security model: the key is the user's OWN Google AI Studio key. It is
    // stored only (a) in chrome.storage.local on this device and (b) in the
    // signed-in user's private Firestore doc, which firestore.rules restrict
    // to request.auth.uid == uid (A01) with a strict schema (A03). It is never
    // written to chrome.storage.sync, never logged, and only ever sent to
    // Google endpoints over TLS.
    // ---------------------------------------------------------
    const AI_KEY_DOC = 'settings/ai';

    function aiKeyPath(uid) { return 'users/' + uid + '/' + AI_KEY_DOC; }

    /** Push (or, with an empty key, remove) the Gemini key for the signed-in
     *  account. No-op when signed out - the local copy still works. */
    async function pushAiKey(key) {
        const auth = (await storeGet([AUTH_KEY]))[AUTH_KEY];
        if (!FB.configured() || !auth) return { ok: false, code: 'SIGNED_OUT' };
        try {
            const idToken = await getIdToken(auth);
            if (key) {
                await FB.commit(idToken, [FB.setWrite(aiKeyPath(auth.uid), { geminiKey: String(key) }, ['updatedAt'])]);
            } else {
                await FB.commit(idToken, [FB.deleteWrite(aiKeyPath(auth.uid))]);
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, code: e.code || 'UNKNOWN' };
        }
    }

    /** After sign-in: the account's stored key wins (restores the AI check on
     *  a new device); if the account has none but this device does, back the
     *  local key up. Fail-soft - sign-in never breaks on a key hiccup. */
    async function reconcileAiKey() {
        try {
            const r = await storeGet([AUTH_KEY, 'geminiApiKey']);
            const auth = r[AUTH_KEY];
            if (!FB.configured() || !auth) return;
            const idToken = await getIdToken(auth);
            const cloud = await FB.getDoc(idToken, aiKeyPath(auth.uid));
            const cloudKey = cloud && typeof cloud.geminiKey === 'string' ? cloud.geminiKey : '';
            const localKey = typeof r.geminiApiKey === 'string' ? r.geminiApiKey : '';
            if (cloudKey && cloudKey !== localKey) {
                await storeSet({ geminiApiKey: cloudKey });
            } else if (!cloudKey && localKey) {
                await pushAiKey(localKey);
            }
        } catch (e) {
            console.warn('[VM] ai-key sync skipped: ' + (e.code || 'UNKNOWN'));
        }
    }

    // ---------------------------------------------------------
    // Personalization profile backup (users/{uid}/profile/state).
    //
    // Stored as one JSON string rather than a nested map: the profile's shape
    // is owned by lib/profile.js and evolves with the ranker, and encoding it
    // as a string keeps firestore.rules validating a size and a type instead
    // of chasing that shape. Contains only aggregate counts about vocabulary -
    // no page content, no URLs, no identifiers.
    // ---------------------------------------------------------
    const PROFILE_DOC = 'profile/state';
    const PROFILE_KEY = 'vm_profile';
    const PROFILE_MAX_CHARS = 200000; // matches the rules cap

    function profilePath(uid) { return 'users/' + uid + '/' + PROFILE_DOC; }

    /** Back up this device's profile. No-op when signed out. */
    async function pushProfile() {
        const r = await storeGet([AUTH_KEY, PROFILE_KEY]);
        const auth = r[AUTH_KEY];
        if (!FB.configured() || !auth) return { ok: false, code: 'SIGNED_OUT' };
        const local = r[PROFILE_KEY];
        if (!local) return { ok: false, code: 'NO_PROFILE' };
        try {
            const state = JSON.stringify(local);
            // Oversized payloads would be rejected by the rules anyway; skip
            // quietly rather than retrying a write that can never succeed.
            if (state.length > PROFILE_MAX_CHARS) return { ok: false, code: 'TOO_LARGE' };
            const idToken = await getIdToken(auth);
            await FB.commit(idToken, [FB.setWrite(profilePath(auth.uid), { state }, ['updatedAt'])]);
            return { ok: true };
        } catch (e) {
            return { ok: false, code: e.code || 'UNKNOWN' };
        }
    }

    // The profile is rewritten on every flush of interaction events, which is
    // often. Coalesce those into one upload per quiet period so a long reading
    // session costs a single Firestore write instead of dozens.
    const PROFILE_PUSH_DEBOUNCE_MS = 60 * 1000;
    let profilePushTimer = null;

    function scheduleProfilePush() {
        if (profilePushTimer) clearTimeout(profilePushTimer);
        profilePushTimer = setTimeout(() => {
            profilePushTimer = null;
            pushProfile().catch(() => { /* retried on the next change */ });
        }, PROFILE_PUSH_DEBOUNCE_MS);
    }

    /**
     * After sign-in: merge the account's profile into this device's rather than
     * picking a winner. Both sides recorded genuine interactions, so summing
     * them is the only answer that does not silently discard a device's
     * history. Fail-soft - sign-in never breaks on a profile hiccup.
     */
    async function reconcileProfile() {
        try {
            const r = await storeGet([AUTH_KEY, PROFILE_KEY]);
            const auth = r[AUTH_KEY];
            if (!FB.configured() || !auth) return;
            const Prof = self.VMProfile;
            if (!Prof) return;

            const idToken = await getIdToken(auth);
            const doc = await FB.getDoc(idToken, profilePath(auth.uid));
            let cloud = null;
            if (doc && typeof doc.state === 'string' && doc.state) {
                try { cloud = JSON.parse(doc.state); } catch (e) { cloud = null; } // corrupt: start over
            }
            const local = r[PROFILE_KEY] || null;
            if (!cloud && !local) return;

            const merged = Prof.mergeProfiles(local, cloud);
            await storeSet({ [PROFILE_KEY]: merged });
            await pushProfile();
        } catch (e) {
            console.warn('[VM] profile sync skipped: ' + (e.code || 'UNKNOWN'));
        }
    }

    /** Valid ID token from cache or via the refresh token. */
    async function getIdToken(auth) {
        if (token && token.uid === auth.uid && Date.now() < token.expiresAt) return token.idToken;
        const r = await FB.refresh(auth.refreshToken);
        token = { idToken: r.idToken, uid: r.uid, expiresAt: Date.now() + (r.expiresIn - 60) * 1000 };
        if (r.refreshToken && r.refreshToken !== auth.refreshToken) {
            await storeSet({ [AUTH_KEY]: Object.assign({}, auth, { refreshToken: r.refreshToken }) });
        }
        return token.idToken;
    }

    // ---------------------------------------------------------
    // Desired cloud state from the local deck
    // ---------------------------------------------------------
    function clip(s, max) {
        // NFC: composed Unicode so Vietnamese diacritics render correctly everywhere.
        return String(s == null ? '' : s).normalize('NFC').slice(0, max);
    }

    function normalizeWord(w) {
        return String(w || '').toLowerCase().trim().replace(/\s+/g, ' ');
    }

    /** savedWords + knownWords -> Map(word -> payload matching firestore.rules). */
    function desiredState(savedWords, knownWords) {
        const map = new Map();
        for (const e of Array.isArray(savedWords) ? savedWords : []) {
            const word = normalizeWord(e && e.word ? e.word : e);
            if (!WORD_RE.test(word) || word.length > 64) continue; // rules would reject: skip
            map.set(word, {
                word,
                vietnamese: clip(e && e.vietnamese, 128),
                definition: clip(e && e.definition, 512),
                example: clip(e && e.example, 1024),
                pos: clip(e && e.type, 32),
                status: 'saved'
            });
        }
        for (const k of Array.isArray(knownWords) ? knownWords : []) {
            const word = normalizeWord(k);
            if (!WORD_RE.test(word) || word.length > 64) continue;
            const existing = map.get(word);
            if (existing) existing.status = 'known';
            else map.set(word, { word, vietnamese: '', definition: '', example: '', pos: '', status: 'known' });
        }
        return map;
    }

    function hashPayload(p) {
        return [p.word, p.vietnamese, p.definition, p.example, p.pos, p.status].join('\u0001');
    }

    /** The status inside a stored snapshot hash, or '' if it cannot be read.
     *  Reading it back out is what lets a run tell "I am changing this status"
     *  apart from "I am touching this word for some other reason", which is the
     *  difference between keeping and destroying a mark made on the website. */
    function statusFromHash(h) {
        const parts = String(h == null ? '' : h).split('\u0001');
        return parts.length === 6 ? parts[5] : '';
    }

    // ---------------------------------------------------------
    // Commit builders (counter protocol shared with the web app)
    // ---------------------------------------------------------
    function userPath(uid) { return 'users/' + uid; }
    // Raw (unencoded) - write paths are sent inside the commit JSON body, so
    // the document ID must stay byte-identical to what the web SDK would use.
    function wordPath(uid, word) { return 'users/' + uid + '/words/' + word; }

    async function createWordCommit(idToken, uid, payload, counter) {
        const writes = [];
        if (!counter.exists) {
            writes.push(FB.createWrite(userPath(uid), { wordCountToday: 1, countDay: counter.today }, ['createdAt']));
        } else {
            writes.push(FB.updateWrite(userPath(uid), {
                wordCountToday: counter.sameDay ? counter.count + 1 : 1,
                countDay: counter.today
            }));
        }
        writes.push(FB.createWrite(wordPath(uid, payload.word), payload, ['createdAt', 'updatedAt']));
        await FB.commit(idToken, writes);
    }

    /**
     * Masked update of one word.
     *
     * `includeStatus` is the whole point of this signature. saved/known is not
     * the extension's alone to decide - /my-deck writes it too - and this deck
     * only ever syncs upwards, so a status pushed from here can only ever
     * overwrite, never merge. The caller passes false whenever this run is not
     * the thing that changed the status, and the cloud value is left alone.
     */
    function updateWordCommit(idToken, uid, payload, includeStatus) {
        const data = {
            vietnamese: payload.vietnamese,
            definition: payload.definition,
            example: payload.example,
            pos: payload.pos
        };
        if (includeStatus) data.status = payload.status;
        return FB.commit(idToken, [FB.updateWrite(wordPath(uid, payload.word), data, ['updatedAt'])]);
    }

    function deleteWordCommit(idToken, uid, word) {
        return FB.commit(idToken, [FB.deleteWrite(wordPath(uid, word))]);
    }

    // ---------------------------------------------------------
    // The sync run
    // ---------------------------------------------------------
    async function kick() {
        if (syncing) { dirty = true; return; }
        if (!FB.configured()) return;
        syncing = true;
        try {
            await runSync();
            backoffMs = 0;
        } catch (e) {
            // Transient failure (offline, 5xx, auth hiccup): retry with backoff.
            console.warn('[VM] sync deferred: ' + (e.code || e.name || 'UNKNOWN'));
            await setStatus({ state: 'error', errorCode: e.code || 'UNKNOWN' });
            scheduleRetry();
        } finally {
            syncing = false;
            if (dirty) { dirty = false; kick(); }
        }
    }

    function scheduleRetry() {
        backoffMs = Math.min(backoffMs ? backoffMs * 2 : 5000, MAX_BACKOFF_MS);
        if (retryTimer) clearTimeout(retryTimer);
        // Best-effort: if the SW is torn down first, the next wake-up
        // (storage change / startup) resumes from the snapshot anyway.
        retryTimer = setTimeout(kick, backoffMs);
    }

    /**
     * Bring "learned" back down from the account.
     *
     * This deck has always synced one way. That was defensible while the deck
     * was only ever a record - but the focus list (lib/focus.js) makes marking
     * a word learned the way a reader frees a slot in it, and /my-deck is one
     * of the two places they can do that. Without a download, marking a word
     * learned on the website changed nothing in the browser they read in: the
     * word kept appearing and the list stayed full.
     *
     * Deliberately narrow, in three ways, because a two-way sync built on a
     * one-way history is where data goes missing:
     *
     *   - Only `known`, never `saved`. Pulling saved words down would import
     *     the reader's whole website deck into the extension's savedWords,
     *     changing what the card shows and what the review schedule resurfaces.
     *     That is a different feature and nobody asked for it.
     *   - Only additive. A local known word is never un-known because the cloud
     *     calls it saved. Monotone means this can never fight the upload, which
     *     is the failure mode that would be worst and hardest to see.
     *   - Only when it changes something. A no-op write would fire
     *     storage.onChanged -> kick() -> runSync() -> pullKnown() forever.
     *
     * Never throws out of the sync run: a deck that could not be read back is
     * a slot freed a few minutes later, not a failed sync.
     */
    async function pullKnown(auth, force) {
        const now = Date.now();
        if (!force && now - lastPullAt < PULL_INTERVAL_MS) return;
        if (typeof FB.listDocs !== 'function') return;   // older rest client
        lastPullAt = now;
        try {
            // The token is fetched in here, not by the caller. A run with
            // nothing to push used to make no network request at all; if that
            // refresh failed offline and threw out of runSync, the account
            // panel would show an error for a read nothing was waiting on.
            const idToken = await getIdToken(auth);
            const uid = auth.uid;
            const cloudKnown = [];
            let pageToken = '';
            do {
                const page = await FB.listDocs(idToken, 'users/' + uid + '/words', {
                    pageSize: 300, pageToken, mask: ['word', 'status']
                });
                for (const doc of page.documents) {
                    if (doc.fields.status !== 'known') continue;
                    const w = normalizeWord(doc.fields.word || doc.id);
                    if (w) cloudKnown.push(w);
                }
                pageToken = page.nextPageToken;
            } while (pageToken);

            if (!cloudKnown.length) return;
            const local = (await storeGet(['knownWords']))['knownWords'];
            const have = new Set((Array.isArray(local) ? local : []).map(normalizeWord));
            const added = cloudKnown.filter(w => !have.has(w));
            if (!added.length) return;      // the loop guard: no change, no write
            await storeSet({ knownWords: Array.from(have).concat(added) });
        } catch (e) {
            console.warn('[VM] deck read-back deferred: ' + (e.code || e.name || 'UNKNOWN'));
        }
    }

    async function runSync() {
        const stored = await storeGet([AUTH_KEY, SNAPSHOT_KEY, 'savedWords']);
        const auth = stored[AUTH_KEY];
        if (!auth) return;

        // Read the account's "learned" marks back down first, so a word the
        // reader learned on the website is already in knownWords by the time
        // the upload delta below is worked out. Doing it after would push the
        // stale local status back up and undo their edit.
        await pullKnown(auth, false);
        // Re-read: the pull may have just added to it.
        const fresh = await storeGet(['knownWords']);

        const snapshot = stored[SNAPSHOT_KEY] || {};
        const desired = desiredState(stored.savedWords, fresh.knownWords);

        // Work out the delta.
        const upserts = [];
        for (const [word, payload] of desired) {
            if (snapshot[word] !== hashPayload(payload)) upserts.push(payload);
        }
        const deletions = Object.keys(snapshot).filter(w => !desired.has(w));
        if (!upserts.length && !deletions.length) {
            await setStatus({ state: 'idle', pending: 0, errorCode: null });
            return;
        }

        await setStatus({ state: 'syncing', pending: upserts.length + deletions.length });
        const idToken = await getIdToken(auth);

        // Counter state drives create commits; read it once per run.
        const today = Math.floor(Date.now() / 86400000);
        const userDoc = await FB.getDoc(idToken, userPath(auth.uid));
        const counter = {
            exists: !!userDoc,
            sameDay: !!userDoc && userDoc.countDay === today,
            count: userDoc && userDoc.countDay === today ? (userDoc.wordCountToday || 0) : 0,
            today
        };

        let rateLimited = false;

        for (const word of deletions) {
            await deleteWordCommit(idToken, auth.uid, word);
            delete snapshot[word];
            await storeSet({ [SNAPSHOT_KEY]: snapshot });
        }

        for (const payload of upserts) {
            const knownToCloud = Object.prototype.hasOwnProperty.call(snapshot, payload.word);
            // Push a status only when this run is the one changing it: the word
            // is one we have pushed before AND its status has moved since. A
            // word with no snapshot entry is one we are meeting for the first
            // time - on a fresh install, or after signing in, which wipes the
            // snapshot on purpose (see refresh()) - and "first time" is exactly
            // when the local deck's 'saved' is least likely to be the truth.
            const ownsStatus = knownToCloud && statusFromHash(snapshot[payload.word]) !== payload.status;
            try {
                if (knownToCloud) {
                    await updateWordCommit(idToken, auth.uid, payload, ownsStatus);
                } else {
                    if (counter.count >= DAILY_LIMIT) { rateLimited = true; continue; }
                    await createWordCommit(idToken, auth.uid, payload, counter);
                    counter.count = counter.sameDay || counter.exists ? counter.count + 1 : 1;
                    counter.exists = true;
                    counter.sameDay = true;
                }
            } catch (e) {
                if (e.code === 'ALREADY_EXISTS') {
                    // The document is already up there and this install did not
                    // put it there - a second device, a reinstall, or the sign-in
                    // that cleared the snapshot. Its saved/known state belongs to
                    // whoever wrote it; adopt the document and leave the status.
                    await updateWordCommit(idToken, auth.uid, payload, false);
                } else if (e.code === 'NOT_FOUND') {
                    // Deleted from the web app - recreate.
                    if (counter.count >= DAILY_LIMIT) { rateLimited = true; continue; }
                    await createWordCommit(idToken, auth.uid, payload, counter);
                    counter.count += 1;
                    counter.exists = true;
                    counter.sameDay = true;
                } else {
                    throw e;
                }
            }
            snapshot[payload.word] = hashPayload(payload);
            await storeSet({ [SNAPSHOT_KEY]: snapshot });
        }

        await setStatus({
            state: rateLimited ? 'rate-limited' : 'idle',
            pending: rateLimited ? upserts.filter(p => !Object.prototype.hasOwnProperty.call(snapshot, p.word)).length : 0,
            lastSyncAt: Date.now(),
            errorCode: rateLimited ? 'DAILY_LIMIT' : null
        });
    }

    // ---------------------------------------------------------
    // Wiring (called by background.js)
    // ---------------------------------------------------------
    function onStorageChanged(changes, area) {
        if (area !== 'local') return;
        if (changes.savedWords || changes.knownWords) kick();
        // The profile is rewritten in bursts as the user reads; debounce the
        // upload so a reading session costs one write, not one per rating.
        if (changes.vm_profile) scheduleProfilePush();
    }

    return { kick, onStorageChanged, signIn, signOut, adoptSession, getStatus, pushAiKey, reconcileAiKey, pushProfile, reconcileProfile };
});
