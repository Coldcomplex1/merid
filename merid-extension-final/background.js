// =============================================================
// Merid - background service worker (LOCAL-ONLY)
//
// Responsibilities:
//   - Load & cache the vocabulary datasets (CSV files bundled in the extension).
//   - Answer settings / vocabulary / dataset requests from the popup, options
//     page and content script.
//
// The core experience is fully local: vocabulary datasets are bundled CSV
// files read via chrome.runtime.getURL(). Optionally, when Firebase is
// configured (lib/firebase-config.js) AND the user signs in (on merid.site or
// in the options page), the saved deck syncs to their own Firestore account
// (lib/sync.js). No page content is ever sent anywhere.
// =============================================================

importScripts('lib/vocab-core.js', 'lib/firebase-config.js', 'lib/firebase-rest.js', 'lib/sync.js');
const C = self.VMCore;
const Sync = self.VMSync;
const FB = self.VMFirebase;
const FBConfig = self.VMFirebaseConfig || {};

// ---- In-memory state (rehydrated on SW wake) ----
let vocabulary = [];

// =============================================================
// Vocabulary loading (bundled CSV datasets - local only)
// =============================================================
async function loadVocabulary(datasetKey) {
    const key = datasetKey || 'sat';
    const files = C.getDatasetFiles(key);
    const byWord = new Map(); // dedupe by normalized English word

    for (const file of files) {
        try {
            const resp = await fetch(chrome.runtime.getURL(file));
            const text = await resp.text();
            const rows = C.parseCSV(text);
            for (const row of rows) {
                if (!C.validateEntry(row)) continue;
                const entry = C.normalizeEntry(row, key);
                const wordKey = entry.word.toLowerCase();
                if (wordKey && !byWord.has(wordKey)) byWord.set(wordKey, entry);
            }
            console.log(`[VM] Loaded ${rows.length} rows from ${file}`);
        } catch (err) {
            console.error(`[VM] Failed to load ${file}:`, err.message);
        }
    }

    vocabulary = Array.from(byWord.values());
    // Persist so a SW restart can rehydrate without re-parsing on the hot path.
    chrome.storage.local.set({ vm_vocab_cache: { key, count: vocabulary.length, data: vocabulary } });
    console.log(`[VM] Total vocabulary (${key}):`, vocabulary.length);
    return vocabulary;
}

function initVocabulary() {
    return new Promise(resolve => {
        chrome.storage.sync.get(['datasetKey'], async result => {
            const key = result.datasetKey || 'sat';
            // Try the persisted cache first for a fast wake.
            chrome.storage.local.get(['vm_vocab_cache'], async cache => {
                const c = cache.vm_vocab_cache;
                if (c && c.key === key && Array.isArray(c.data) && c.data.length) {
                    vocabulary = c.data;
                    console.log(`[VM] Rehydrated ${vocabulary.length} words from cache (${key})`);
                    resolve(vocabulary);
                } else {
                    await loadVocabulary(key);
                    resolve(vocabulary);
                }
            });
        });
    });
}

// =============================================================
// Lifecycle
// =============================================================
chrome.runtime.onInstalled.addListener(() => { console.log('[VM] Installed/updated.'); initVocabulary(); Sync.kick(); });
chrome.runtime.onStartup.addListener(() => { console.log('[VM] Startup.'); initVocabulary(); Sync.kick(); });
initVocabulary();
Sync.kick(); // resume any sync interrupted by a service-worker teardown

// =============================================================
// Cloud deck sync: mirror local deck changes to Firestore (lib/sync.js).
// No-op unless Firebase is configured and the user signed in.
// =============================================================
chrome.storage.onChanged.addListener((changes, area) => {
    try { Sync.onStorageChanged(changes, area); } catch (e) { /* sync must never break the extension */ }
});

// =============================================================
// Passwordless email-link sign-in (Firebase Auth "Email link").
// The options page asks us to email a one-time sign-in link; the user pastes
// the link back and we exchange its oobCode for a session, which is adopted
// through the same validated path merid.site single sign-on uses.
// =============================================================
async function sendSignInLink(email) {
    if (!FB || !FB.configured()) return { ok: false, code: 'NOT_CONFIGURED' };
    try {
        await FB.sendSignInLink(String(email || '').trim(), FBConfig.webDeckUrl || 'https://merid.site');
        return { ok: true };
    } catch (e) {
        return { ok: false, code: e.code || 'UNKNOWN' };
    }
}

async function signInWithEmailLink(email, link) {
    if (!FB || !FB.configured()) return { ok: false, code: 'NOT_CONFIGURED' };
    // Works with the raw link from the email OR the redirected URL - the
    // one-time code is an oobCode query param either way.
    const m = String(link || '').match(/[?&]oobCode=([^&#]+)/);
    if (!m) return { ok: false, code: 'BAD_LINK' };
    try {
        const r = await FB.signInWithEmailLink(String(email || '').trim(), decodeURIComponent(m[1]));
        return await Sync.adoptSession(r.refreshToken, r.email || String(email || '').trim());
    } catch (e) {
        return { ok: false, code: e.code || 'UNKNOWN' };
    }
}

// =============================================================
// AI context check (optional, OFF by default).
// Uses the user's OWN Gemini API key (entered on the options page, stored in
// chrome.storage.local - never synced). One batched request per page, capped
// at 20 items, asking only for a compact JSON array of 0/1 verdicts to keep
// token usage minimal. Any failure returns { ok:false } and the extension
// behaves exactly as if the feature were off.
// =============================================================
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const AI_CHECK_MAX_ITEMS = 20;

async function callGemini(apiKey, prompt, maxOutputTokens) {
    const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens }
        })
    });
    if (!resp.ok) return { ok: false, status: resp.status };
    const data = await resp.json();
    const text = ((((data.candidates || [])[0] || {}).content || {}).parts || [])
        .map(p => p.text || '').join('');
    return { ok: true, text };
}

async function aiCheckContext(items) {
    const sync = await chrome.storage.sync.get(['aiCheckEnabled']);
    const local = await chrome.storage.local.get(['geminiApiKey']);
    if (!sync.aiCheckEnabled || !local.geminiApiKey) return { ok: false, disabled: true };
    if (!Array.isArray(items) || items.length === 0) return { ok: true, verdicts: [] };

    const capped = items.slice(0, AI_CHECK_MAX_ITEMS).map(it => ({
        word: String(it && it.word || '').slice(0, 60),
        original: String(it && it.original || '').slice(0, 60),
        sentence: String(it && it.sentence || '').slice(0, 180)
    }));
    const list = capped.map((it, i) =>
        `${i + 1}. english="${it.word}" replaced_vietnamese="${it.original}" sentence="${it.sentence}"`).join('\n');
    const prompt =
        'In each sentence below, one Vietnamese word/phrase was replaced by an English word. ' +
        'For each item answer 1 if the English word correctly expresses the replaced Vietnamese meaning in that sentence context, otherwise 0. ' +
        'Reply with ONLY a JSON array of 0/1 (one per item), nothing else.\n' + list;

    try {
        const res = await callGemini(local.geminiApiKey, prompt, 200);
        if (!res.ok) return res;
        const m = (res.text || '').match(/\[[\s\S]*?\]/);
        if (!m) return { ok: false, reason: 'bad-response' };
        const verdicts = JSON.parse(m[0]).map(v => (v ? 1 : 0));
        return { ok: true, verdicts };
    } catch (e) {
        return { ok: false, reason: 'network' };
    }
}

async function aiTestKey(key) {
    const k = String(key || '').trim();
    if (!k) return { ok: false, reason: 'no-key' };
    try {
        const res = await callGemini(k, 'Reply with OK', 10);
        return { ok: res.ok, status: res.status };
    } catch (e) {
        return { ok: false, reason: 'network' };
    }
}

// =============================================================
// Messaging (from popup / options / content script)
// =============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ---- Cloud sync protocol (options page / merid.site bridge <-> SW) ----
    if (request && request.type) {
        switch (request.type) {
            case 'MERID_SYNC_SIGN_IN': {
                Sync.signIn(request.email, request.password, !!request.isNewAccount)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false, code: 'UNKNOWN' }));
                return true;
            }
            case 'MERID_SYNC_SIGN_OUT': {
                Sync.signOut().then(sendResponse).catch(() => sendResponse({ ok: false }));
                return true;
            }
            // Single sign-on relayed from merid.site by content-bridge.js.
            case 'MERID_ADOPT_SESSION': {
                Sync.adoptSession(request.refreshToken, request.email)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false }));
                return true;
            }
            case 'MERID_WEB_SIGNOUT': {
                Sync.signOut().then(sendResponse).catch(() => sendResponse({ ok: false }));
                return true;
            }
            // ---- Passwordless email-link sign-in (options page) ----
            case 'MERID_SYNC_SEND_LINK': {
                sendSignInLink(request.email)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false, code: 'UNKNOWN' }));
                return true;
            }
            case 'MERID_SYNC_LINK_SIGNIN': {
                signInWithEmailLink(request.email, request.link)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false, code: 'UNKNOWN' }));
                return true;
            }

            // ---- AI context check (content script / options page) ----
            case 'MERID_AI_CHECK': {
                aiCheckContext(request.items)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false }));
                return true;
            }
            case 'MERID_AI_TEST_KEY': {
                aiTestKey(request.key)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false }));
                return true;
            }

            case 'MERID_SYNC_STATUS': {
                Sync.getStatus().then(sendResponse).catch(() => sendResponse({ state: 'error' }));
                return true;
            }
            default:
                return false;
        }
    }

    switch (request.action) {
        case 'setDataset': {
            const key = request.datasetKey || 'sat';
            chrome.storage.sync.set({ datasetKey: key }, () => {
                loadVocabulary(key).then(() => sendResponse({ success: true, count: vocabulary.length }));
            });
            return true;
        }

        case 'getVocabulary': {
            if (vocabulary.length === 0) {
                initVocabulary().then(() => sendResponse({ vocabulary }));
                return true;
            }
            sendResponse({ vocabulary });
            return false;
        }

        case 'getSettings': {
            chrome.storage.sync.get(
                ['frequency', 'replacementMode', 'vieEngMode', 'engEngMode', 'extensionEnabled', 'datasetKey'],
                settings => sendResponse(C.withDefaults(settings)));
            return true;
        }

        case 'getStatus': {
            // Used by the options page to show how many words are loaded.
            chrome.storage.sync.get(['extensionEnabled', 'datasetKey'], s => {
                sendResponse({
                    enabled: s.extensionEnabled !== false,
                    datasetKey: s.datasetKey || 'sat',
                    vocabCount: vocabulary.length
                });
            });
            return true;
        }

        default:
            return false;
    }
});
