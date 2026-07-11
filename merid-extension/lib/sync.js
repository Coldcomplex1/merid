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

    // Matches the word regex in firestore.rules; anything else is skipped.
    const WORD_RE = /^[a-z](?:[a-z '-]*[a-z])?$/;

    // ---- In-memory (per service-worker life) ----
    let token = null;                      // { idToken, expiresAt, uid }
    let syncing = false;
    let dirty = false;                     // a change arrived while syncing
    let backoffMs = 0;
    let retryTimer = null;

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
            // pushed (merged) into this account.
            await storeRemove([SNAPSHOT_KEY]);
            await setStatus({ state: 'idle', errorCode: null });
            kick();
            return { ok: true, email };
        } catch (e) {
            return { ok: false, code: e.code || 'UNKNOWN' };
        }
    }

    async function signOut() {
        token = null;
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
            // New/different account: push the whole local deck up (merge).
            if (!cur || cur.uid !== r.uid) await storeRemove([SNAPSHOT_KEY]);
            await setStatus({ state: 'idle', errorCode: null });
            kick();
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
        return String(s == null ? '' : s).slice(0, max);
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

    function updateWordCommit(idToken, uid, payload) {
        const data = {
            vietnamese: payload.vietnamese,
            definition: payload.definition,
            example: payload.example,
            pos: payload.pos,
            status: payload.status
        };
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

    async function runSync() {
        const stored = await storeGet([AUTH_KEY, SNAPSHOT_KEY, 'savedWords', 'knownWords']);
        const auth = stored[AUTH_KEY];
        if (!auth) return;

        const snapshot = stored[SNAPSHOT_KEY] || {};
        const desired = desiredState(stored.savedWords, stored.knownWords);

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
            try {
                if (knownToCloud) {
                    await updateWordCommit(idToken, auth.uid, payload);
                } else {
                    if (counter.count >= DAILY_LIMIT) { rateLimited = true; continue; }
                    await createWordCommit(idToken, auth.uid, payload, counter);
                    counter.count = counter.sameDay || counter.exists ? counter.count + 1 : 1;
                    counter.exists = true;
                    counter.sameDay = true;
                }
            } catch (e) {
                if (e.code === 'ALREADY_EXISTS') {
                    // The web app created it first - fall back to an update.
                    await updateWordCommit(idToken, auth.uid, payload);
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
    }

    return { kick, onStorageChanged, signIn, signOut, adoptSession, getStatus };
});
