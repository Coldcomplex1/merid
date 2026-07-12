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
