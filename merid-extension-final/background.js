// =============================================================
// Merid - background service worker (LOCAL-ONLY)
//
// Responsibilities:
//   - Load & cache the vocabulary datasets (CSV files bundled in the extension).
//   - Answer settings / vocabulary / dataset requests from the popup, options
//     page and content script.
//
// This extension is fully local: there are NO API keys, NO backend, and NO
// network requests to any external server. The only fetches here read the
// extension's own bundled CSV files via chrome.runtime.getURL().
// =============================================================

importScripts('lib/vocab-core.js');
const C = self.VMCore;

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
chrome.runtime.onInstalled.addListener(() => { console.log('[VM] Installed/updated.'); initVocabulary(); });
chrome.runtime.onStartup.addListener(() => { console.log('[VM] Startup.'); initVocabulary(); });
initVocabulary();

// =============================================================
// Messaging (from popup / options / content script)
// =============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
