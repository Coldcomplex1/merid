// =============================================================
// Merid - background service worker
//
// Responsibilities:
//   - Load & cache the vocabulary datasets (CSV files bundled in the extension).
//   - Answer settings / vocabulary / dataset requests from the popup, options
//     page and content script.
//
// The core experience is fully local: vocabulary datasets are bundled CSV
// files read via chrome.runtime.getURL(). Two features touch the network:
// deck sync to the user's own Firestore account after sign-in (lib/sync.js,
// off until they sign in), and the AI context check, which sends short
// sentence snippets to Gemini - either through Merid's own metered endpoint
// (lib/ai-proxy.js) or, if the user saved a personal API key, straight from
// their browser to Google. Page content goes nowhere else.
// =============================================================

importScripts('lib/vocab-core.js', 'lib/profile.js', 'lib/custom-datasets.js', 'lib/firebase-config.js', 'lib/firebase-rest.js', 'lib/ai-proxy.js', 'lib/sync.js');

// Release builds keep the console quiet; flip DEBUG on while developing.
// console.warn/error still fire (failures only), routine logs go through log().
const DEBUG = false;
const log = DEBUG ? console.log.bind(console) : () => { };

const C = self.VMCore;
const Prof = self.VMProfile;
const Custom = self.VMCustom;
const Sync = self.VMSync;
const FB = self.VMFirebase;
const AiProxy = self.VMAiProxy;
const FBConfig = self.VMFirebaseConfig || {};

// ---- In-memory state (rehydrated on SW wake) ----
let vocabulary = [];

// =============================================================
// Vocabulary loading (bundled CSV datasets - local only)
// =============================================================
async function loadVocabulary(datasetKey) {
    const key = datasetKey || C.DEFAULT_DATASET_KEY;

    // Custom datasets load their pre-validated entries from
    // chrome.storage.local instead of bundled files. A missing dataset
    // (deleted here, or the setting synced to a device that never had the
    // file) falls back to the built-in default with a one-shot notice.
    if (C.isCustomKey(key)) {
        const entries = await Custom.getEntries(C.customIdFromKey(key));
        if (!entries || !entries.length) return fallbackToDefault();
        vocabulary = entries;
        chrome.storage.local.set({ vm_vocab_cache: { key, count: vocabulary.length, data: vocabulary } });
        log(`[VM] Loaded custom dataset (${key}):`, vocabulary.length);
        return vocabulary;
    }

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
            log(`[VM] Loaded ${rows.length} rows from ${file}`);
        } catch (err) {
            console.error(`[VM] Failed to load ${file}:`, err.message);
        }
    }

    vocabulary = Array.from(byWord.values());
    // Persist so a SW restart can rehydrate without re-parsing on the hot path.
    chrome.storage.local.set({ vm_vocab_cache: { key, count: vocabulary.length, data: vocabulary } });
    log(`[VM] Total vocabulary (${key}):`, vocabulary.length);
    return vocabulary;
}

// =============================================================
// Visual index (bundled JSON - local only)
//
// Which entries have a bundled picture, and which concept glyph the rest wear.
// Read here rather than in every content script for the same reason the
// vocabulary is: one parse serves every tab, and a woken worker rehydrates
// from storage instead of re-reading the file.
//
// Only the index passes through here. The images themselves never do - a
// content script builds `chrome.runtime.getURL('vis/<slug>.avif')` and lets the
// browser fetch it off disk. Routing bytes through the worker would be slower
// and, in MV3, impossible to finish: URL.createObjectURL does not exist in a
// service worker, and a blob URL made anywhere else is locked to the origin
// that made it.
// =============================================================
// Bumped when the index format changes, so a cached copy written by an older
// build is re-read rather than trusted.
const VISUAL_INDEX_VERSION = 1;
const VISUAL_INDEX_KEY = 'vm_visual_index';
let visualIndex = null;

async function loadVisualIndex() {
    if (visualIndex) return visualIndex;
    try {
        const cached = await chrome.storage.local.get([VISUAL_INDEX_KEY]);
        const hit = cached[VISUAL_INDEX_KEY];
        if (hit && typeof hit === 'object' && hit.v === VISUAL_INDEX_VERSION) {
            visualIndex = hit;
            return visualIndex;
        }
    } catch (e) { /* unreadable cache is a slow path, not a failure */ }

    try {
        const resp = await fetch(chrome.runtime.getURL('visual-index.json'));
        visualIndex = await resp.json();
    } catch (e) {
        // No index shipped yet (it arrives with the artwork, on its own
        // schedule) or the file is unreadable. An empty index is a valid
        // answer: every entry falls through to a generated glyph.
        visualIndex = { v: VISUAL_INDEX_VERSION, fmt: 'avif', photo: [], icon: {} };
    }
    try { await chrome.storage.local.set({ [VISUAL_INDEX_KEY]: visualIndex }); } catch (e) { /* quota */ }
    return visualIndex;
}


function initVocabulary() {
    return new Promise(resolve => {
        chrome.storage.sync.get(['datasetKey'], async result => {
            const key = result.datasetKey || C.DEFAULT_DATASET_KEY;
            // Try the persisted cache first for a fast wake.
            chrome.storage.local.get(['vm_vocab_cache'], async cache => {
                const c = cache.vm_vocab_cache;
                if (c && c.key === key && Array.isArray(c.data) && c.data.length) {
                    vocabulary = c.data;
                    log(`[VM] Rehydrated ${vocabulary.length} words from cache (${key})`);
                    resolve(vocabulary);
                } else {
                    await loadVocabulary(key);
                    resolve(vocabulary);
                }
            });
        });
    });
}

// The selected custom dataset is gone. Switch back to the built-in default
// (the sync write makes every open tab revert + re-scan) and leave a one-shot
// notice that the popup/options page shows once and clears.
async function fallbackToDefault() {
    chrome.storage.sync.set({ datasetKey: C.DEFAULT_DATASET_KEY });
    chrome.storage.local.set({ vm_dataset_notice: { code: 'CUSTOM_MISSING', at: Date.now() } });
    return loadVocabulary(C.DEFAULT_DATASET_KEY);
}

// =============================================================
// Custom datasets (user-uploaded CSVs). Validation runs here so the stored
// entries are exactly what the report said; the options page runs the same
// validateDatasetCsv beforehand purely as a preview. Nothing in this section
// touches the network - datasets stay in chrome.storage.local.
// =============================================================

/** Strip the (potentially large) entries array before answering the UI. */
function publicReport(report) {
    return {
        ok: report.ok,
        errorCode: report.errorCode,
        missingColumns: report.missingColumns,
        stats: report.stats,
        errors: report.errors,
        duplicates: report.duplicates,
        warnings: report.warnings
    };
}

async function importCustomDataset(name, csvText) {
    const cleanName = C.sanitizeDatasetName(name);
    if (!cleanName) return { ok: false, code: 'BAD_NAME' };
    const index = await Custom.list();
    if (index.length >= C.CUSTOM_LIMITS.MAX_DATASETS) return { ok: false, code: 'LIMIT_DATASETS' };
    const report = C.validateDatasetCsv(csvText);
    if (!report.ok) return { ok: false, code: 'INVALID_CSV', report: publicReport(report) };
    const id = Custom.newId();
    const entries = report.entries.map(e => C.normalizeCustomEntry(e, id));
    try {
        const meta = await Custom.create(id, cleanName, entries);
        return { ok: true, id: meta.id, name: meta.name, count: meta.count, report: publicReport(report) };
    } catch (e) {
        return { ok: false, code: e.code === 'STORAGE_FULL' ? 'STORAGE_FULL' : 'UNKNOWN' };
    }
}

async function replaceCustomDataset(id, csvText) {
    const meta = await Custom.getMeta(id);
    if (!meta) return { ok: false, code: 'NOT_FOUND' };
    const report = C.validateDatasetCsv(csvText);
    if (!report.ok) return { ok: false, code: 'INVALID_CSV', report: publicReport(report) };
    const entries = report.entries.map(e => C.normalizeCustomEntry(e, id));
    try {
        await Custom.replace(id, entries);
    } catch (e) {
        return { ok: false, code: e.code === 'STORAGE_FULL' ? 'STORAGE_FULL' : 'UNKNOWN' };
    }
    // If this dataset is active, reload it and bump datasetRev so open tabs
    // re-scan (datasetKey itself did not change, so the usual trigger is silent).
    const s = await chrome.storage.sync.get(['datasetKey']);
    if (s.datasetKey === C.customKeyFor(id)) {
        await loadVocabulary(s.datasetKey);
        chrome.storage.sync.set({ datasetRev: Date.now() });
    }
    return { ok: true, count: entries.length, report: publicReport(report) };
}

async function renameCustomDataset(id, name) {
    const cleanName = C.sanitizeDatasetName(name);
    if (!cleanName) return { ok: false, code: 'BAD_NAME' };
    const meta = await Custom.rename(id, cleanName);
    return meta ? { ok: true, name: meta.name } : { ok: false, code: 'NOT_FOUND' };
}

async function deleteCustomDataset(id) {
    await Custom.remove(id);
    const s = await chrome.storage.sync.get(['datasetKey']);
    const wasActive = s.datasetKey === C.customKeyFor(id);
    if (wasActive) {
        // Deliberate user action: switch back without the "missing" notice
        // (the options UI already spelled out the consequence in its confirm).
        chrome.storage.sync.set({ datasetKey: C.DEFAULT_DATASET_KEY });
        await loadVocabulary(C.DEFAULT_DATASET_KEY);
    }
    return { ok: true, wasActive };
}

/** Registry label for bundled keys, the user's name for custom keys. */
async function resolveDatasetLabel(key) {
    if (C.isCustomKey(key)) {
        const meta = await Custom.getMeta(C.customIdFromKey(key));
        return meta ? meta.name : 'Custom (missing)';
    }
    return (C.DATASET_REGISTRY[key] || {}).label || key;
}

// =============================================================
// Lifecycle
// =============================================================
chrome.runtime.onInstalled.addListener((details) => {
    log('[VM] Installed/updated.');
    initVocabulary();
    Sync.kick();
    // First-run onboarding: the four-step wizard - hello, which vocabulary,
    // how the words should appear, done. Fresh installs only, never on updates.
    //
    // Nothing is opened here. The wizard belongs over the page the reader is
    // already on, and at this moment there is no such page: the tab in front of
    // them is the Web Store or a new tab, and neither runs a content script for
    // an overlay to live in. Opening a tab of our own instead was worse than
    // waiting - it threw away the context they were in to ask two questions.
    //
    // So the install is recorded and onboarding.js picks it up on the first
    // ordinary page they visit, which is exactly where the answers will matter.
    if (details && details.reason === 'install') {
        chrome.storage.sync.set({ onboardingPending: true });
    }
});
chrome.runtime.onStartup.addListener(() => { log('[VM] Startup.'); initVocabulary(); Sync.kick(); });
initVocabulary();
Sync.kick(); // resume any sync interrupted by a service-worker teardown

// Exit survey - the cheapest signal for why users leave. No data is attached
// to the URL; it is a plain page on merid.site.
if (chrome.runtime.setUninstallURL && FBConfig.webUninstallUrl) {
    chrome.runtime.setUninstallURL(FBConfig.webUninstallUrl);
}

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
// One-click "Sign in with Google" (the account picker).
// DORMANT in store builds: it needs BOTH googleClientId in
// lib/firebase-config.js AND the "identity" permission restored in
// manifest.json (removed while unused so the store review sees no unused
// permission). Until then the options page hides the button and users sign in
// with Google on merid.site instead (SSO carries the session over).
// chrome.identity.launchWebAuthFlow opens Google's own chooser; we ask for an
// OpenID Connect id_token only (implicit flow, minimal "openid email" scope)
// and trade it for a Firebase session via accounts:signInWithIdp.
//
// Security (A01/A07):
//   - `state` must round-trip unchanged (CSRF protection) and the `nonce` we
//     sent must appear inside the SIGNED token (replay protection).
//   - The token's signature/audience/expiry are verified by Google when we
//     exchange it - a forged or expired token cannot mint a session.
//   - The session is adopted through Sync.adoptSession, the same validated
//     path merid.site single sign-on uses. Nothing here logs tokens.
// =============================================================
function base64UrlDecode(s) {
    return atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
}

function jwtClaim(jwt, claim) {
    try { return JSON.parse(base64UrlDecode(jwt.split('.')[1]))[claim]; }
    catch (e) { return null; }
}

function launchAuthFlow(url) {
    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
            if (chrome.runtime.lastError || !responseUrl) reject(new Error('canceled'));
            else resolve(responseUrl);
        });
    });
}

async function googleSignIn() {
    if (!FB || !FB.configured()) return { ok: false, code: 'NOT_CONFIGURED' };
    if (!FBConfig.googleClientId) return { ok: false, code: 'GOOGLE_NOT_CONFIGURED' };
    if (!chrome.identity || !chrome.identity.launchWebAuthFlow) return { ok: false, code: 'GOOGLE_NOT_CONFIGURED' };

    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const url = 'https://accounts.google.com/o/oauth2/v2/auth' +
        '?client_id=' + encodeURIComponent(FBConfig.googleClientId) +
        '&response_type=id_token' +
        '&redirect_uri=' + encodeURIComponent(chrome.identity.getRedirectURL()) +
        '&scope=' + encodeURIComponent('openid email') +
        '&state=' + state +
        '&nonce=' + nonce +
        '&prompt=select_account';

    let responseUrl;
    try {
        responseUrl = await launchAuthFlow(url);
    } catch (e) {
        return { ok: false, code: 'GOOGLE_CANCELLED' };
    }

    const params = new URLSearchParams(String(responseUrl).split('#')[1] || '');
    const idToken = params.get('id_token');
    if (!idToken || params.get('state') !== state || jwtClaim(idToken, 'nonce') !== nonce) {
        return { ok: false, code: 'GOOGLE_BAD_RESPONSE' };
    }

    try {
        const r = await FB.signInWithGoogleIdToken(idToken);
        const adopted = await Sync.adoptSession(r.refreshToken, r.email || '');
        return adopted.ok ? { ok: true, email: r.email } : adopted;
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
// Tried in order until one works for the user's key: the "-latest" aliases
// always point to the newest generally-available model (Google retires fixed
// model names for new users over time). The first working model is cached in
// storage.local and re-resolved automatically if it ever starts 404ing.
const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const AI_CHECK_MAX_ITEMS = 20;

// Structured-output schema for the context check. Asking for the item index
// alongside each verdict (rather than a bare positional array) means a model
// that drops, merges or reorders an item can no longer shift every following
// verdict onto the wrong word - a mis-parse now loses one item instead of
// silently corrupting the whole batch.
// `better` is free-form: the model does not know our datasets, so it proposes
// whatever English word actually fits. The content script then looks that word
// up in the loaded vocabulary and only swaps when it finds a real entry -
// otherwise it falls back to reverting. That keeps a hallucinated suggestion
// from ever reaching the page, and guarantees every displayed word still has a
// definition, IPA and example behind it.
const AI_VERDICT_SCHEMA = {
    type: 'ARRAY',
    items: {
        type: 'OBJECT',
        properties: {
            i: { type: 'INTEGER' },
            ok: { type: 'BOOLEAN' },
            better: { type: 'STRING' }
        },
        required: ['i', 'ok']
    }
};

async function callGeminiModel(apiKey, model, prompt, maxOutputTokens, schema) {
    const generationConfig = { temperature: 0, maxOutputTokens };
    // Native JSON mode: Gemini constrains decoding to the schema, so the reply
    // is always parseable. Replaces regex-scraping a JSON array out of prose.
    if (schema) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseSchema = schema;
    }
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig
        })
    });
    if (!resp.ok) {
        // Surface Google's own error message so the options page can show
        // the real cause instead of a generic failure.
        let detail = '';
        try {
            const err = await resp.json();
            detail = String((err && err.error && err.error.message) || '').slice(0, 200);
        } catch (e) { /* non-JSON error body */ }
        return { ok: false, status: resp.status, detail };
    }
    const data = await resp.json();
    const text = ((((data.candidates || [])[0] || {}).content || {}).parts || [])
        .map(p => p.text || '').join('');
    return { ok: true, text };
}

// Statuses where a DIFFERENT model on the SAME key is worth trying:
//   404 - this model does not exist for this key/project
//   429 - rate limited. Gemini's free-tier quotas are per model, so a sibling
//         model usually still has budget; this is the common case for a heavy
//         reader on a free key
//   500/503 - that model is overloaded or erroring on Google's side
// Everything else (400/401/403 - malformed or rejected key) is about the key
// itself, and retrying other models would only burn time and quota.
const GEMINI_RETRY_STATUSES = new Set([404, 429, 500, 503]);

// A model that just rate-limited stays skipped for this long, so the next page
// does not spend a wasted round trip rediscovering the same 429 before falling
// through to a model that works.
const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const MODEL_COOLDOWN_KEY = 'vm_ai_model_cooldown';

async function callGemini(apiKey, prompt, maxOutputTokens, schema) {
    const store = await chrome.storage.local.get(['vm_ai_model', MODEL_COOLDOWN_KEY]);
    const vm_ai_model = store.vm_ai_model;
    const cooldown = store[MODEL_COOLDOWN_KEY] || {};
    const now = Date.now();

    const ordered = vm_ai_model
        ? [vm_ai_model, ...GEMINI_MODELS.filter(m => m !== vm_ai_model)]
        : GEMINI_MODELS.slice();

    // Cooling-down models go last rather than being dropped: if every model is
    // cooling down we still try them all instead of failing without a request.
    const hot = ordered.filter(m => !(cooldown[m] > now));
    const cool = ordered.filter(m => cooldown[m] > now);
    const models = hot.concat(cool);

    let last = null;
    const nextCooldown = Object.assign({}, cooldown);
    let cooldownChanged = false;

    for (const model of models) {
        const res = await callGeminiModel(apiKey, model, prompt, maxOutputTokens, schema);
        if (res.ok) {
            if (model !== vm_ai_model) chrome.storage.local.set({ vm_ai_model: model });
            if (nextCooldown[model]) { delete nextCooldown[model]; cooldownChanged = true; }
            if (cooldownChanged) chrome.storage.local.set({ [MODEL_COOLDOWN_KEY]: nextCooldown });
            return Object.assign(res, { model, triedModels: models.indexOf(model) + 1 });
        }
        last = Object.assign(res, { model });
        if (res.status === 429) { nextCooldown[model] = now + MODEL_COOLDOWN_MS; cooldownChanged = true; }
        if (!GEMINI_RETRY_STATUSES.has(res.status)) break;
    }

    if (cooldownChanged) chrome.storage.local.set({ [MODEL_COOLDOWN_KEY]: nextCooldown });
    return last;
}

// ---- Verdict cache -------------------------------------------------------
// A verdict depends on the (word, sentence) PAIR, so that is the cache key.
// Re-reading a page, revisiting it tomorrow, or meeting the same boilerplate
// sentence on another page of the same site all become free. Entries are
// evicted oldest-first once the table is full.
const AI_CACHE_KEY = 'vm_ai_cache';
const AI_CACHE_MAX = 2000;
const AI_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Stable short key for one (word, sentence) pair. */
function aiCacheKey(word, sentence) {
    const norm = String(sentence || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const w = String(word || '').toLowerCase().trim();
    // Two independent hashes over differently-salted inputs: a 32-bit hash
    // alone collides often enough at 2000 entries to matter (birthday bound),
    // and a collision would apply one word's verdict to an unrelated one.
    const a = C.hashToInt(w + ' ' + norm).toString(36);
    const b = C.hashToInt(norm + '' + w + '|' + norm.length).toString(36);
    return a + '.' + b;
}

async function readAiCache() {
    try {
        const r = await chrome.storage.local.get([AI_CACHE_KEY]);
        const c = r[AI_CACHE_KEY];
        return (c && typeof c === 'object') ? c : {};
    } catch (e) {
        return {};
    }
}

/** Merge fresh verdicts in, drop expired ones, then trim to the size cap. */
async function writeAiCache(cache, additions, now) {
    const merged = Object.assign({}, cache, additions);
    const cutoff = now - AI_CACHE_TTL_MS;
    for (const k of Object.keys(merged)) {
        const e = merged[k];
        if (!Array.isArray(e) || !(Number(e[1]) > cutoff)) delete merged[k];
    }
    const keys = Object.keys(merged);
    if (keys.length > AI_CACHE_MAX) {
        keys.sort((x, y) => merged[y][1] - merged[x][1]); // newest first
        const trimmed = {};
        for (let i = 0; i < AI_CACHE_MAX; i++) trimmed[keys[i]] = merged[keys[i]];
        try { await chrome.storage.local.set({ [AI_CACHE_KEY]: trimmed }); } catch (e) { /* quota */ }
        return;
    }
    try { await chrome.storage.local.set({ [AI_CACHE_KEY]: merged }); } catch (e) { /* quota */ }
}

/**
 * Verify a batch of replacements against their sentence context.
 *
 * Returns `verdicts` positionally aligned with the input `items`: 1 = the
 * English word fits, 0 = it does not. Cached pairs are answered without a
 * network call; only the remainder is sent to Gemini. When the model omits an
 * item, that item defaults to 1 (keep) - a missing answer must never silently
 * revert a word the model never judged.
 */
async function aiCheckContext(items) {
    // Through withDefaults: a raw read returns undefined for anyone who has
    // never touched the toggle, and undefined is falsy - which would leave the
    // check off for every existing user no matter what the default says.
    const sync = C.withDefaults(await chrome.storage.sync.get(['aiCheckEnabled']));
    const local = await chrome.storage.local.get(['geminiApiKey']);

    // Two ways to reach Gemini, in this order:
    //   1. The reader's OWN key, if they saved one. It goes straight from their
    //      browser to Google, has no daily cap from us, and never touches a
    //      Merid server. Power users and anyone uncomfortable with (2) can opt
    //      into it from Settings.
    //   2. Merid's hosted endpoint, which holds the keys and the per-user
    //      counter server-side. This is what everyone else gets, with no setup.
    const ownKey = local.geminiApiKey;
    const hosted = !ownKey && AiProxy && AiProxy.available();
    if (!sync.aiCheckEnabled || (!ownKey && !hosted)) return { ok: false, disabled: true };
    if (!Array.isArray(items) || items.length === 0) return { ok: true, verdicts: [], cached: 0 };

    const capped = items.slice(0, AI_CHECK_MAX_ITEMS).map(it => ({
        word: String(it && it.word || '').slice(0, 60),
        original: String(it && it.original || '').slice(0, 60),
        sentence: String(it && it.sentence || '').slice(0, 180)
    }));

    const now = Date.now();
    const cache = await readAiCache();
    const cutoff = now - AI_CACHE_TTL_MS;
    const verdicts = new Array(capped.length).fill(1);
    const betters = new Array(capped.length).fill('');
    const askIdx = [];          // positions still needing an answer
    const keys = capped.map(it => aiCacheKey(it.word, it.sentence));

    capped.forEach((it, i) => {
        const hit = cache[keys[i]];
        if (Array.isArray(hit) && Number(hit[1]) > cutoff) {
            verdicts[i] = hit[0] ? 1 : 0;
            betters[i] = typeof hit[2] === 'string' ? hit[2] : ''; // absent in pre-suggestion entries
        } else {
            askIdx.push(i);
        }
    });

    const cachedCount = capped.length - askIdx.length;
    if (!askIdx.length) {
        log('[VM] AI check: all', cachedCount, 'items served from cache (0 API calls)');
        return { ok: true, verdicts, betters, cached: cachedCount, asked: 0 };
    }

    const ask = askIdx.map(i => capped[i]);
    const list = ask.map((it, n) =>
        `${n + 1}. english="${it.word}" replaced_vietnamese="${it.original}" sentence="${it.sentence}"`
    ).join('\n');

    // Personalization: a compact, aggregate description of this reader's taste.
    // Contains no page content and no identifiers - only preferences learned
    // from their own ratings - and is empty for a user with no history, so a
    // new user's prompt is byte-for-byte what it was before.
    const profile = await getProfile();
    const who = Prof.describeProfile(profile);
    const persona = who ? `The reader ${who}. Prefer suggestions that suit them.\n` : '';

    // ---- Hosted path: the server holds the keys, picks the model and meters
    // the reader. It returns the same shape as the direct path below, so the
    // caching and merging underneath are identical either way.
    if (hosted) {
        const res = await AiProxy.check(ask, who);
        if (!res.ok) {
            log('[VM] AI check via proxy failed:', res.reason || '', res.status || '');
            return { ok: false, reason: res.reason, status: res.status, quota: res.reason === 'quota' };
        }
        const additions = {};
        res.verdicts.forEach((v, n) => {
            const srcIdx = askIdx[n];
            if (srcIdx === undefined) return;
            const better = res.betters[n] || '';
            verdicts[srcIdx] = v;
            betters[srcIdx] = better;
            additions[keys[srcIdx]] = better ? [v, now, better] : [v, now];
        });
        await writeAiCache(cache, additions, now);
        log('[VM] AI check (hosted):', cachedCount, 'cached,', ask.length, 'asked');
        return { ok: true, verdicts, betters, cached: cachedCount, asked: ask.length, model: res.model, hosted: true };
    }

    const prompt =
        'In each sentence below, one Vietnamese word/phrase was replaced by an English word. ' +
        'For each item decide whether the English word correctly expresses the replaced Vietnamese meaning in that sentence context. ' +
        'Return one object per item with "i" set to the item number shown and "ok" true when the word fits, false when it does not. ' +
        'When "ok" is false, set "better" to a single English word of similar or higher CEFR level that does fit; ' +
        'leave "better" empty when the word already fits or when no good replacement exists.\n' +
        persona + list;

    try {
        // Room for the suggestion field on top of each verdict.
        const res = await callGemini(ownKey, prompt, 60 + ask.length * 28, AI_VERDICT_SCHEMA);
        if (!res.ok) return res;

        let parsed;
        try {
            parsed = JSON.parse(res.text || '');
        } catch (e) {
            return { ok: false, reason: 'bad-response' };
        }
        if (!Array.isArray(parsed)) return { ok: false, reason: 'bad-response' };

        const additions = {};
        let answered = 0;
        for (const row of parsed) {
            if (!row || typeof row !== 'object') continue;
            const n = Number(row.i);
            if (!Number.isInteger(n) || n < 1 || n > ask.length) continue;
            const srcIdx = askIdx[n - 1];
            const v = row.ok ? 1 : 0;
            // A suggestion is only meaningful for a rejected word, and only as
            // a single word - anything longer is the model explaining itself.
            const better = (!v && typeof row.better === 'string')
                ? row.better.trim().split(/\s+/)[0].replace(/[^A-Za-z'-]/g, '').slice(0, 40)
                : '';
            verdicts[srcIdx] = v;
            betters[srcIdx] = better;
            additions[keys[srcIdx]] = better ? [v, now, better] : [v, now];
            answered++;
        }

        await writeAiCache(cache, additions, now);
        log('[VM] AI check:', cachedCount, 'cached,', askIdx.length, 'asked,', answered, 'answered');
        return { ok: true, verdicts, betters, cached: cachedCount, asked: askIdx.length, model: res.model };
    } catch (e) {
        return { ok: false, reason: 'network' };
    }
}

// =============================================================
// Personalization profile (local, private).
//
// The content script streams interaction events here; this is the only writer,
// so concurrent tabs cannot clobber each other's updates mid-read. Everything
// stays in chrome.storage.local - the profile is mirrored to the user's own
// Firestore account only if they opt into deck sync.
// =============================================================
const PROFILE_KEY = 'vm_profile';
const PROFILE_EVENTS_MAX = 200;

// Serializes read-modify-write cycles: two tabs flushing at once would
// otherwise both read the same profile and the later write would win outright,
// silently discarding the other tab's events.
let profileWriteChain = Promise.resolve();

function applyProfileEvents(events) {
    if (!Array.isArray(events) || !events.length) return Promise.resolve({ ok: true, applied: 0 });
    const batch = events.slice(0, PROFILE_EVENTS_MAX);
    profileWriteChain = profileWriteChain.then(async () => {
        const r = await chrome.storage.local.get([PROFILE_KEY]);
        let profile = Prof.withDefaults(r[PROFILE_KEY]);
        for (const ev of batch) {
            if (!ev || typeof ev !== 'object') continue;
            profile = Prof.recordEvent(profile, ev);
        }
        await chrome.storage.local.set({ [PROFILE_KEY]: profile });
        log('[VM] profile: applied', batch.length, 'events;', Object.keys(profile.words).length, 'words tracked');
        return { ok: true, applied: batch.length };
    }).catch(e => {
        console.warn('[VM] profile update failed:', e && e.message);
        return { ok: false };
    });
    return profileWriteChain;
}

async function getProfile() {
    const r = await chrome.storage.local.get([PROFILE_KEY]);
    return Prof.withDefaults(r[PROFILE_KEY]);
}

/**
 * Forget everything learned, without touching the deck or the settings.
 *
 * Goes through the same write chain as applyProfileEvents: a tab closing at
 * that moment flushes its queued events, and a delete that raced ahead of that
 * flush would be undone by it - the user would press Forget, see the panel
 * empty, and find a profile again seconds later.
 */
function resetProfile() {
    profileWriteChain = profileWriteChain.then(async () => {
        await chrome.storage.local.remove([PROFILE_KEY]);
        return { ok: true };
    }).catch(e => {
        console.warn('[VM] profile reset failed:', e && e.message);
        return { ok: false };
    });
    return profileWriteChain;
}


/**
 * Run one real check and report which link in the chain is broken.
 *
 * "The AI is not working" has at least six unrelated causes - the toggle, the
 * Firebase project, the endpoint, its environment variables, its quota store,
 * and the Gemini keys themselves - and they are indistinguishable from the
 * page. This walks the same path a real check takes and names the one that
 * failed, so nobody has to guess whether it is "the key" or "the extension".
 *
 * @returns {Promise<{ok:boolean, stage:string, message:string, detail?:string}>}
 */
async function aiDiagnose() {
    const sync = C.withDefaults(await chrome.storage.sync.get(['aiCheckEnabled']));
    const local = await chrome.storage.local.get(['geminiApiKey']);

    if (!sync.aiCheckEnabled) {
        return { ok: false, stage: 'off', message: 'The AI context check is switched off. Turn it on above.' };
    }

    // A saved personal key takes priority, so that is the path to test.
    if (local.geminiApiKey) {
        const res = await aiTestKey(local.geminiApiKey);
        if (res.ok) {
            return { ok: true, stage: 'own-key', message: `Working, using your own API key (model: ${res.model}).` };
        }
        return {
            ok: false, stage: 'own-key',
            message: 'Your own API key was rejected by Google. Clear it below to fall back to Merid\'s.',
            detail: res.detail || ('HTTP ' + (res.status || res.reason || '?'))
        };
    }

    if (!AiProxy || !AiProxy.available()) {
        return {
            ok: false, stage: 'config',
            message: 'This build has no AI endpoint configured (aiProxyUrl or the Firebase project is empty).'
        };
    }

    // One real, minimal check. It spends one unit of the daily allowance,
    // which is the price of an answer that is actually true.
    const probe = [{ word: 'candid', original: 'thẳng thắn', sentence: 'Anh ấy rất candid khi nói chuyện.' }];
    const res = await AiProxy.check(probe, '');

    if (res.ok) {
        const q = await AiProxy.getQuota();
        const left = q && typeof q.limit === 'number' ? Math.max(0, q.limit - (q.used || 0)) : null;
        const allowance = (q && q.unlimited)
            ? ' No daily limit at the moment.'
            : (left === null ? '' : ` ${left} of ${q.limit} checks left today.`);
        return {
            ok: true, stage: 'hosted',
            message: `Working (model: ${res.model || 'unknown'}).` + allowance
        };
    }

    if (res.reason === 'auth') {
        return {
            ok: false, stage: 'auth',
            message: 'Could not create an account for this device. Anonymous sign-in is probably not enabled in the Firebase project.',
            detail: res.code || res.detail || ''
        };
    }
    if (res.reason === 'network') {
        return {
            ok: false, stage: 'network',
            message: 'Could not reach the Merid AI endpoint. Check your connection, or the endpoint is not deployed.'
        };
    }
    if (res.reason === 'quota') {
        return {
            ok: true, stage: 'quota',
            message: 'Working, but today\'s allowance is used up. It resets at midnight UTC.' +
                (res.anonymous ? ' Signing in raises the limit.' : '')
        };
    }

    // Everything else is the server telling us what it could not do.
    const byCode = {
        'server-misconfigured': 'The endpoint is deployed but missing its environment variables (Gemini keys, Upstash, or the Firebase project id).',
        'quota-unavailable': 'The endpoint cannot reach its quota store, so it is refusing to serve unmetered. Check the Upstash credentials.',
        'upstream': 'The endpoint reached Google but every Gemini key failed - out of quota, or the keys are wrong.',
        'bad-response': 'Gemini answered, but not in the expected format. Usually transient.',
        'unauthorized': 'The endpoint rejected this device\'s token. Its FIREBASE_PROJECT_ID probably does not match this extension\'s Firebase project.'
    };
    return {
        ok: false, stage: 'server',
        message: byCode[res.code] || `The endpoint returned HTTP ${res.status || '?'}.`,
        detail: res.code || ''
    };
}

async function aiTestKey(key) {
    const k = String(key || '').trim();
    if (!k) return { ok: false, reason: 'no-key' };
    try {
        const res = await callGemini(k, 'Reply with OK', 10);
        if (res.ok) return { ok: true, model: res.model };
        return { ok: false, status: res.status, detail: res.detail, model: res.model };
    } catch (e) {
        // fetch threw before getting a response: offline, DNS, or the request
        // was blocked (e.g. the extension still runs an old manifest whose CSP
        // doesn't allow generativelanguage.googleapis.com).
        return { ok: false, reason: 'network', detail: String((e && e.message) || '').slice(0, 200) };
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
            // The site's VI/EN toggle. Remembered, not obeyed on the spot: a
            // reader who has set a language in Settings keeps it, and this is
            // only what 'auto' falls back to (see lib/i18n.js).
            case 'MERID_WEB_LANG': {
                const lang = request.lang === 'vi' || request.lang === 'en' ? request.lang : '';
                if (!lang) { sendResponse({ ok: false }); return false; }
                chrome.storage.sync.set({ siteLang: lang }, () => {
                    void chrome.runtime.lastError;
                    sendResponse({ ok: true });
                });
                return true;
            }
            // ---- One-click Google sign-in (options page) ----
            case 'MERID_SYNC_GOOGLE_SIGNIN': {
                googleSignIn()
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false, code: 'UNKNOWN' }));
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
            // Save the user's Gemini key: always locally; additionally backed
            // up to the signed-in account's private Firestore doc so it
            // follows them across devices. An empty key removes both copies.
            case 'MERID_AI_SAVE_KEY': {
                const key = String(request.key || '').trim();
                chrome.storage.local.set({ geminiApiKey: key }, () => {
                    Sync.pushAiKey(key)
                        .then(cloud => sendResponse({ ok: true, cloud }))
                        .catch(() => sendResponse({ ok: true, cloud: { ok: false, code: 'UNKNOWN' } }));
                });
                return true;
            }
            case 'MERID_AI_CHECK': {
                aiCheckContext(request.items)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false }));
                return true;
            }
            case 'MERID_AI_DIAGNOSE': {
                aiDiagnose()
                    .then(sendResponse)
                    .catch(e => sendResponse({ ok: false, stage: 'unknown', message: 'Diagnosis failed.', detail: String((e && e.message) || '') }));
                return true;
            }
            case 'MERID_AI_TEST_KEY': {
                aiTestKey(request.key)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false }));
                return true;
            }

            // ---- Personalization (content script / options page) ----
            case 'MERID_PROFILE_EVENTS': {
                applyProfileEvents(request.events)
                    .then(sendResponse)
                    .catch(() => sendResponse({ ok: false }));
                return true;
            }
            case 'MERID_PROFILE_GET': {
                getProfile()
                    .then(profile => sendResponse({ ok: true, profile }))
                    .catch(() => sendResponse({ ok: false }));
                return true;
            }
            case 'MERID_PROFILE_RESET': {
                resetProfile()
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
            const key = request.datasetKey || C.DEFAULT_DATASET_KEY;
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

        // The content script asks once per page, in parallel with getVocabulary.
        case 'getVisualIndex': {
            loadVisualIndex().then(index => sendResponse({ index }));
            return true;
        }

        case 'getSettings': {
            chrome.storage.sync.get(
                // aiCheckEnabled matters to the content script now: it decides
                // whether to replace spare candidates for the check to prune.
                // Left out of this list it always read as the default (on), so
                // a reader who switched the check off still got the spares and
                // nothing ever came back to remove them.
                ['frequency', 'replacementMode', 'vieEngMode', 'engEngMode', 'extensionEnabled',
                    'datasetKey', 'disabledSites', 'allowedSites', 'aiCheckEnabled', 'cardTheme',
                    // visualsEnabled is read by the content script when it draws
                    // the card. Leaving a key out of this list is not a missing
                    // feature, it is a setting that silently ignores the reader:
                    // withDefaults fills the gap with the default, so the toggle
                    // appears to work in the open tab (storage.onChanged updates
                    // it live) and comes back on in the next one.
                    'visualsEnabled'],
                settings => sendResponse(C.withDefaults(settings)));
            return true;
        }

        case 'getStatus': {
            // Used by the options page to show how many words are loaded.
            chrome.storage.sync.get(['extensionEnabled', 'datasetKey'], async s => {
                const key = s.datasetKey || C.DEFAULT_DATASET_KEY;
                sendResponse({
                    enabled: s.extensionEnabled !== false,
                    datasetKey: key,
                    vocabCount: vocabulary.length,
                    datasetLabel: await resolveDatasetLabel(key)
                });
            });
            return true;
        }

        // ---- Custom datasets (options page + popup) ----
        case 'listCustomDatasets': {
            (async () => {
                const datasets = await Custom.list();
                const s = await chrome.storage.sync.get(['datasetKey']);
                sendResponse({ ok: true, datasets, activeKey: s.datasetKey || C.DEFAULT_DATASET_KEY });
            })().catch(() => sendResponse({ ok: false }));
            return true;
        }

        case 'importCustomDataset': {
            importCustomDataset(request.name, request.csvText)
                .then(sendResponse)
                .catch(() => sendResponse({ ok: false, code: 'UNKNOWN' }));
            return true;
        }

        case 'replaceCustomDataset': {
            replaceCustomDataset(request.id, request.csvText)
                .then(sendResponse)
                .catch(() => sendResponse({ ok: false, code: 'UNKNOWN' }));
            return true;
        }

        case 'renameCustomDataset': {
            renameCustomDataset(request.id, request.name)
                .then(sendResponse)
                .catch(() => sendResponse({ ok: false, code: 'UNKNOWN' }));
            return true;
        }

        case 'deleteCustomDataset': {
            deleteCustomDataset(request.id)
                .then(sendResponse)
                .catch(() => sendResponse({ ok: false, code: 'UNKNOWN' }));
            return true;
        }

        default:
            return false;
    }
});
