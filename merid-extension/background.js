// =============================================================
// Merid - background service worker (LOCAL-ONLY, activeTab-only)
//
// Responsibilities:
//   - Load & cache the vocabulary datasets (CSV files bundled in the extension).
//   - Answer settings / vocabulary / dataset requests from the popup, options
//     page and content script.
//   - Own the per-page activation flow: a keyboard command (or the popup)
//     injects Merid into the *current* tab using the temporary activeTab grant,
//     then toggles it on/off. Merid is NEVER injected automatically - there is
//     no all-URLs content script and no host permissions.
//
// The core experience is fully local: vocabulary datasets are bundled CSV
// files read via chrome.runtime.getURL(). Optionally, when Firebase is
// configured (lib/firebase-config.js) AND the user signs in from the options
// page, the saved deck syncs to their own Firestore account (lib/sync.js).
// No page content is ever sent anywhere.
// =============================================================

importScripts('lib/vocab-core.js', 'lib/firebase-config.js', 'lib/firebase-rest.js', 'lib/sync.js');
const C = self.VMCore;
const Sync = self.VMSync;

// The command id declared in manifest.json ("commands").
const TOGGLE_COMMAND = 'toggle-merid-current-page';

// The exact files injected on demand (must match the packaged paths).
const MERID_CSS_FILES = ['content.css'];
const MERID_JS_FILES = ['lib/vocab-core.js', 'content.js'];

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
// No-op unless Firebase is configured and the user signed in via options.
// =============================================================
chrome.storage.onChanged.addListener((changes, area) => {
    try { Sync.onStorageChanged(changes, area); } catch (e) { /* sync must never break the extension */ }
});

// =============================================================
// Per-tab badge feedback (per-tab, so it never leaks across pages)
// =============================================================
async function setBadgeActive(tabId, active) {
    if (tabId == null) return;
    try {
        await chrome.action.setBadgeBackgroundColor({ tabId, color: active ? '#16a34a' : '#64748b' });
        await chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' });
    } catch (e) { /* tab closed / not addressable */ }
}

async function flashBadgeError(tabId) {
    if (tabId == null) return;
    try {
        await chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' });
        await chrome.action.setBadgeText({ tabId, text: '!' });
        // Best-effort clear. If the SW is torn down before this fires the badge
        // simply lingers until the next activation - harmless.
        setTimeout(() => { chrome.action.setBadgeText({ tabId, text: '' }).catch(() => { }); }, 2000);
    } catch (e) { /* tab closed / not addressable */ }
}

// =============================================================
// Restricted-page detection - pages Chrome forbids script injection on.
// Unknown/empty URLs are NOT pre-judged: we attempt injection and let the
// scripting API reject it, which we handle gracefully.
// =============================================================
function isRestrictedUrl(url) {
    if (!url) return false;
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    const scheme = u.protocol.replace(':', '').toLowerCase();
    if (['chrome', 'edge', 'about', 'chrome-extension', 'moz-extension', 'extension',
        'view-source', 'devtools', 'chrome-search', 'chrome-native', 'data'].includes(scheme)) {
        return true;
    }
    const host = u.hostname.toLowerCase();
    if (host === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return true;
    if (host === 'chromewebstore.google.com') return true;
    return false;
}

// =============================================================
// Shared activation flow (used by BOTH the keyboard command and the popup)
// =============================================================

/** Ask an existing Merid content script for its status. A missing receiver is
 *  the normal "not injected yet" case, not an error. */
async function getTabStatus(tabId) {
    try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'MERID_GET_STATUS' });
        if (resp && resp.injected) return { injected: true, active: !!resp.active };
    } catch (e) {
        // No content script in this tab yet (or page forbids messaging).
    }
    return { injected: false, active: false };
}

/** Inject Merid's CSS then its packaged content script. Returns true on success. */
async function injectMerid(tabId) {
    try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: MERID_CSS_FILES });
        await chrome.scripting.executeScript({ target: { tabId }, files: MERID_JS_FILES });
        return true;
    } catch (e) {
        console.warn('[VM] Injection failed:', e && e.message);
        return false;
    }
}

async function sendToTab(tabId, message) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
        return null;
    }
}

/**
 * Toggle Merid on a single tab. This is the ONE shared function the keyboard
 * shortcut and the popup both funnel through, so their state can never diverge.
 *
 * @returns {{ok:boolean, active?:boolean, injected?:boolean, restricted?:boolean, reason?:string}}
 */
async function toggleMeridOnTab(tab) {
    const tabId = tab && tab.id;
    if (tabId == null) {
        return { ok: false, reason: 'no-tab' };
    }
    if (isRestrictedUrl(tab.url)) {
        await flashBadgeError(tabId);
        return { ok: false, restricted: true, reason: 'restricted' };
    }

    const status = await getTabStatus(tabId);

    // --- Case 1: never injected -> inject, then enable + scan.
    if (!status.injected) {
        const ok = await injectMerid(tabId);
        if (!ok) {
            await flashBadgeError(tabId);
            return { ok: false, restricted: true, reason: 'inject-failed' };
        }
        const resp = await sendToTab(tabId, { type: 'MERID_ENABLE' });
        const active = !resp || resp.active !== false; // default to active on success
        await setBadgeActive(tabId, active);
        return { ok: true, injected: true, active };
    }

    // --- Case 2: injected AND active -> disable + revert.
    if (status.active) {
        await sendToTab(tabId, { type: 'MERID_DISABLE' });
        await setBadgeActive(tabId, false);
        return { ok: true, injected: true, active: false };
    }

    // --- Case 3: injected but disabled -> reuse the runtime, re-enable + rescan.
    await sendToTab(tabId, { type: 'MERID_ENABLE' });
    await setBadgeActive(tabId, true);
    return { ok: true, injected: true, active: true };
}

/** Read-only status for the popup: is Merid usable / injected / active here? */
async function queryActiveTab(tab) {
    const tabId = tab && tab.id;
    if (tabId == null) return { ok: false, reason: 'no-tab' };
    if (isRestrictedUrl(tab.url)) return { ok: true, restricted: true, injected: false, active: false };
    const status = await getTabStatus(tabId);
    return { ok: true, restricted: false, injected: status.injected, active: status.active };
}

function getActiveTab() {
    return new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            resolve(tabs && tabs[0] ? tabs[0] : null);
        });
    });
}

// =============================================================
// Keyboard command -> shared toggle. Prefer the tab supplied by the event so we
// don't have to query every browser tab.
// =============================================================
chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command !== TOGGLE_COMMAND) return;
    try {
        const target = tab && tab.id != null ? tab : await getActiveTab();
        await toggleMeridOnTab(target || {});
    } catch (e) {
        console.warn('[VM] Command handling failed:', e && e.message);
    }
});

// Keep the badge honest: clear it if a Merid-touched tab navigates away/reloads.
// (Activation is intentionally NOT restored - the user must invoke Merid again.)
chrome.tabs.onRemoved.addListener(() => { /* per-tab badges are cleaned up by Chrome */ });

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
    // ---- New activeTab activation protocol (popup <-> service worker) ----
    if (request && request.type) {
        switch (request.type) {
            case 'MERID_TOGGLE_ACTIVE_TAB': {
                getActiveTab().then(tab => toggleMeridOnTab(tab || {})).then(sendResponse);
                return true;
            }
            case 'MERID_QUERY_ACTIVE_TAB': {
                getActiveTab().then(tab => queryActiveTab(tab || {})).then(sendResponse);
                return true;
            }
            case 'MERID_GET_COMMAND': {
                chrome.commands.getAll(cmds => {
                    const cmd = (cmds || []).find(c => c.name === TOGGLE_COMMAND);
                    sendResponse({ name: TOGGLE_COMMAND, shortcut: (cmd && cmd.shortcut) || '' });
                });
                return true;
            }

            // ---- Cloud sync protocol (options page <-> service worker) ----
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

    // ---- Existing settings / vocabulary protocol (action-keyed) ----
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
