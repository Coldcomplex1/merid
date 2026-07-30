// =============================================================
// Merid - content script (LOCAL-ONLY)
// Replaces Vietnamese vocabulary on the page with the English equivalent from
// the selected local dataset(s) and shows a learning card on hover.
//
// Matching/normalization is pure and local (lib/vocab-core.js, VMCore). The
// user's deck ("Save to Deck") and known words ("I know this") are stored
// locally in chrome.storage.local. The only network use is the optional AI
// context check, routed through the background worker and OFF by default.
// =============================================================

const C = window.VMCore;
const P = window.VMProfile;

// Release builds stay silent on users' pages; flip DEBUG on while developing.
// console.warn/error still fire (failures only), routine logs go through log().
const DEBUG = false;
const log = DEBUG ? console.log.bind(console) : () => { };

// UI strings via chrome.i18n (_locales/en + _locales/vi), with English
// fallbacks so a missing message can never blank the tooltip.
function t(key, fallback) {
    try {
        const msg = chrome.i18n.getMessage(key);
        if (msg) return msg;
    } catch (e) { /* i18n unavailable (e.g. harness) */ }
    return fallback;
}

let settings = {};
let vocabulary = [];
let tooltipElement = null;
let currentObserver = null;
let replacedCount = 0;

// User's local lists (lowercased headwords / saved-word keys).
let knownSet = new Set();
let savedSet = new Set();

// Learned personalization profile, snapshotted once per scan (null = none yet).
let profile = null;

const MAX_REPLACEMENTS_PER_PAGE = 800;   // safety cap to protect big pages
const MUTATION_DEBOUNCE_MS = 300;

// Text nodes we've already looked at (avoids MutationObserver reprocessing loops).
// Reset on every init() so a settings change re-evaluates the whole page.
let processedNodes = new WeakSet();

// Per-"post" (feed item / article / text block) scan stats:
// { seen: words scanned so far, used: translations made so far }. The budget
// scales with `seen` (VMCore.postWordBudget - roughly frequency/15 words per
// 100 words of text), so long articles get translations spread all the way
// through instead of only in the opening paragraph. Reset on every init().
let postWordCounts = new WeakMap();

const FORBIDDEN_TAGS = new Set([
    'script', 'style', 'textarea', 'input', 'select', 'noscript', 'code', 'pre',
    'kbd', 'samp', 'var', 'option', 'button', 'svg', 'math', 'canvas', 'iframe',
    'audio', 'video'
]);
const SKIP_ANCESTOR_SELECTOR =
    'nav, [role="button"], [role="menu"], [role="menubar"], [role="tab"], ' +
    '[contenteditable=""], [contenteditable="true"], [aria-hidden="true"], ' +
    '.vocab-master-highlight, .vocab-master-tooltip';

// White speaker glyph for the pronunciation button (kept crisp at small sizes).
const SPEAKER_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4z"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M15.2 9.4a3.6 3.6 0 0 1 0 5.2"/>' +
    '</svg>';

log('[VM] Content script starting…');

// -------------------------------------------------------------
// Init / teardown
// -------------------------------------------------------------
function init() {
    if (currentObserver) { currentObserver.disconnect(); currentObserver = null; }
    processedNodes = new WeakSet();
    postWordCounts = new WeakMap();
    aiCheckedPairs = new Set();
    aiChecksSent = 0;
    if (aiCheckTimer) { clearTimeout(aiCheckTimer); aiCheckTimer = null; }

    // Drop upgrades parked for a page state that no longer exists.
    pendingUpgrades = [];
    if (upgradeScrollBound) {
        window.removeEventListener('scroll', onUpgradeScroll);
        upgradeScrollBound = false;
    }

    // Per-page personalization state. Flush anything still queued from the
    // previous scan before resetting, so a settings change cannot drop events.
    flushProfileEvents();
    shownThisPage = new Set();
    hoveredThisPage = new Set();
    pageTopic = P ? P.topicFromUrl(location.href) : 'general';

    // Snapshot the learned profile for this scan. Fetching it once (rather than
    // per candidate word) keeps the scan synchronous and means every word on a
    // page is judged against the same profile - a mid-scan update cannot make
    // the top and bottom of an article disagree.
    chrome.runtime.sendMessage({ type: 'MERID_PROFILE_GET' }, (res) => {
        void chrome.runtime.lastError; // an unavailable profile just means no personalization
        profile = (res && res.ok && res.profile) ? res.profile : null;
        startScan();
    });
}

function startScan() {
    // Load the local deck/known lists first so we can honour them while scanning.
    chrome.storage.local.get(['knownWords', 'savedWords'], (local) => {
        knownSet = new Set((local.knownWords || []).map(w => String(w).toLowerCase()));
        savedSet = new Set((local.savedWords || []).map(e => String(e && e.word ? e.word : e).toLowerCase()));

        chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
            if (chrome.runtime.lastError) { console.warn('[VM] getSettings failed:', chrome.runtime.lastError.message); return; }
            settings = C.withDefaults(response);

            if (settings.extensionEnabled === false) {
                log('[VM] Extension disabled - not processing.');
                return;
            }

            // Per-site pause ("Turn off on this site" in the popup).
            if (C.isSiteDisabled(location.hostname, settings.disabledSites)) {
                log('[VM] Paused on this site - not processing.');
                return;
            }

            const modes = [settings.vieEngMode && 'vieEng', settings.engEngMode && 'engEng'].filter(Boolean);
            if (modes.length === 0) {
                log('[VM] No scan direction enabled - nothing to do.');
                return;
            }

            const start = () => {
                const vocabMap = C.buildVocabMap(vocabulary, modes);
                processPage(vocabMap);
                observeChanges(vocabMap);
            };

            if (vocabulary.length > 0) {
                start();
            } else {
                chrome.runtime.sendMessage({ action: 'getVocabulary' }, (resp) => {
                    if (chrome.runtime.lastError) { console.warn('[VM] getVocabulary failed:', chrome.runtime.lastError.message); return; }
                    vocabulary = (resp && resp.vocabulary) || [];
                    if (vocabulary.length > 0) start();
                });
            }
        });
    });
}

// -------------------------------------------------------------
// Node eligibility
// -------------------------------------------------------------
function shouldProcessNode(node) {
    if (processedNodes.has(node)) return false;
    const parent = node.parentElement;
    if (!parent) return false;
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    if (FORBIDDEN_TAGS.has(parent.tagName.toLowerCase())) return false;
    if (parent.isContentEditable) return false;
    if (parent.closest(SKIP_ANCESTOR_SELECTOR)) return false;
    return true;
}

// -------------------------------------------------------------
// Page processing (chunked to keep the main thread responsive)
// -------------------------------------------------------------
function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) if (shouldProcessNode(n)) nodes.push(n);
    return nodes;
}

function processPage(vocabMap) {
    const textNodes = collectTextNodes(document.body);
    let index = 0;
    const chunkSize = 50;

    function processChunk() {
        const end = Math.min(index + chunkSize, textNodes.length);
        for (; index < end; index++) processTextNode(textNodes[index], vocabMap);
        if (index < textNodes.length) {
            requestAnimationFrame(processChunk);
        } else {
            log('[VM] Page processing complete. Replaced:', replacedCount);
            scheduleAiContextCheck();
        }
    }
    processChunk();
}

// The nearest thing that reads as one "post": a feed item/article when the
// site marks one up, otherwise the closest text block, otherwise the page.
function postContainerFor(el) {
    if (!el) return document.body;
    return el.closest('article, [role="article"], [role="listitem"]') ||
        el.closest('p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6, section, main') ||
        document.body;
}

function processTextNode(node, vocabMap) {
    const original = node.textContent;
    if (!original || !original.trim() || vocabMap.size === 0) { processedNodes.add(node); return; }
    if (replacedCount >= MAX_REPLACEMENTS_PER_PAGE) { processedNodes.add(node); return; }

    const tokens = C.tokenize(original);
    const container = postContainerFor(node.parentElement);
    let stats = postWordCounts.get(container);
    if (!stats) { stats = { seen: 0, used: 0 }; postWordCounts.set(container, stats); }

    const out = [];
    let modified = false;

    for (let i = 0; i < tokens.length; i++) {
        if (C.isWordToken(tokens[i])) stats.seen++;

        const match = replacedCount < MAX_REPLACEMENTS_PER_PAGE
            ? C.findMatch(tokens, i, vocabMap, { allowSingleWord: true, minSingleWordLen: 2 })
            : null;

        if (!match) { out.push(makeTextNode(tokens[i])); continue; }

        const { size, matchedText, items } = match;
        // The rest of the matched tokens also count as scanned words.
        for (let k = i + 1; k < i + size; k++) {
            if (C.isWordToken(tokens[k])) stats.seen++;
        }
        const item = items[0]; // deterministic pick from the dataset
        const replaceWith = item.word;

        // "I know this" - never replace words the user already knows.
        if (knownSet.has(replaceWith.toLowerCase())) {
            out.push(makeTextNode(matchedText));
            i += size - 1;
            continue;
        }

        // Deterministic intensity gate - stable across re-renders (no Math.random).
        //
        // Personalization enters HERE and only here: it bends the frequency the
        // gate sees, it does not make the decision. The hash still does that,
        // so the same word on the same page always resolves the same way. With
        // no profile, or a profile too young to trust, effectiveFrequency()
        // returns settings.frequency unchanged.
        if (!C.gateByFrequency(matchedText.toLowerCase() + '|' + replaceWith.toLowerCase(),
            effectiveFrequency(replaceWith, item.dataset))) {
            out.push(makeTextNode(matchedText));
            i += size - 1;
            continue;
        }

        // Density budget - at most ~frequency/15 translations per 100 words
        // scanned in this post so far, so translations spread through the
        // whole article instead of clustering in the first paragraph.
        if (stats.used >= C.postWordBudget(settings.frequency, stats.seen)) {
            out.push(makeTextNode(matchedText));
            i += size - 1;
            continue;
        }

        const span = document.createElement('span');
        span.className = 'vocab-master-highlight';
        span.dataset.word = item.word;
        span.dataset.original = matchedText;
        span.dataset.replacement = replaceWith;
        span.dataset.level = item.dataset || '';
        applyDisplayMode(span);

        const wl = replaceWith.toLowerCase();
        if (!shownThisPage.has(wl)) {
            shownThisPage.add(wl);
            queueProfileEvent(replaceWith, 'shown', item.dataset);
        }

        stats.used++;

        out.push(span);
        i += size - 1;
        modified = true;
    }

    if (modified) {
        out.forEach(nd => { if (nd.nodeType === Node.TEXT_NODE) processedNodes.add(nd); });
        node.replaceWith(...out);
    } else {
        processedNodes.add(node);
    }
}

// Turn a span into its final displayed state per the current replacement mode.
function applyDisplayMode(span) {
    const matchedText = span.dataset.original || '';
    const replaceWith = span.dataset.replacement || matchedText;
    const isSameWord = matchedText.toLowerCase().trim() === replaceWith.toLowerCase().trim();
    const mode = settings.replacementMode || 'replace';

    span.classList.add('vocab-master-highlight', 'vocab-highlight');

    let didReplace = false;
    if (isSameWord || mode === 'highlight') {
        span.textContent = matchedText;                       // keep original, highlighted + tooltip
    } else if (mode === 'beside') {
        span.textContent = `${matchedText} (${replaceWith})`; // từ (word)
        didReplace = true;
    } else {
        span.textContent = replaceWith;                       // 'replace'
        didReplace = true;
    }

    if (didReplace && !span.classList.contains('vocab-replaced')) {
        span.classList.add('vocab-replaced');
        replacedCount++;
    }
    return didReplace;
}

function makeTextNode(text) {
    const t = document.createTextNode(text);
    processedNodes.add(t);
    return t;
}

// -------------------------------------------------------------
// Dynamic content - debounced MutationObserver
// -------------------------------------------------------------
function observeChanges(vocabMap) {
    let debounceTimer = null;
    let queuedRoots = [];

    currentObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            m.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE &&
                    (node.classList.contains('vocab-master-highlight') || node.classList.contains('vocab-master-tooltip'))) return;
                if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) queuedRoots.push(node);
            });
        }
        if (queuedRoots.length && !debounceTimer) {
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                const roots = queuedRoots;
                queuedRoots = [];
                const nodes = [];
                for (const r of roots) {
                    if (!r.isConnected) continue;
                    if (r.nodeType === Node.TEXT_NODE) { if (shouldProcessNode(r)) nodes.push(r); }
                    else nodes.push(...collectTextNodes(r));
                }
                processNodeBatch(nodes, vocabMap);
            }, MUTATION_DEBOUNCE_MS);
        }
    });

    currentObserver.observe(document.body, { childList: true, subtree: true });
}

function processNodeBatch(nodes, vocabMap) {
    let index = 0;
    const batchSize = 20;
    function run() {
        const end = Math.min(index + batchSize, nodes.length);
        for (; index < end; index++) processTextNode(nodes[index], vocabMap);
        if (index < nodes.length) requestAnimationFrame(run);
        else if (nodes.length) scheduleAiContextCheck(); // dynamic content settled
    }
    run();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'revertPage') {
        revertPage();
        sendResponse({ success: true });
    }
    return false;
});

// -------------------------------------------------------------
// Personalization feedback
//
// Every interaction is evidence about which words this reader wants. Events
// are queued here and flushed to the service worker in batches - writing
// chrome.storage on every hover would be far too chatty.
//
// This data never leaves the device on its own: the service worker folds it
// into the local profile, and only the deck sync (opt-in, after sign-in)
// mirrors it to the user's own Firestore account.
// -------------------------------------------------------------
const PROFILE_FLUSH_MS = 4000;
const PROFILE_QUEUE_MAX = 80;
let profileQueue = [];
let profileFlushTimer = null;
let pageTopic = 'general';
// "shown"/"hover" are recorded once per headword per page, not once per span:
// 800 impressions of the same word on one page is one exposure to the reader.
let shownThisPage = new Set();
let hoveredThisPage = new Set();

/**
 * How often this reader should meet `word`, in the 0..100 form
 * `VMCore.gateByFrequency` expects.
 *
 * Falls back to the user's raw setting whenever personalization cannot or
 * should not speak: no profile module, no profile loaded yet, or a profile
 * with too little evidence (VMProfile handles that last case internally by
 * fading its multiplier in from exactly 1.0).
 */
function effectiveFrequency(word, level) {
    if (!P || !profile) return settings.frequency;
    try {
        return P.adjustedFrequency(profile, { word, level, topic: pageTopic }, settings.frequency);
    } catch (e) {
        return settings.frequency; // personalization must never break a page
    }
}

function queueProfileEvent(word, event, level) {
    const w = String(word || '').toLowerCase().trim();
    if (!w) return;
    profileQueue.push({ word: w, event, level: level || '', topic: pageTopic });
    if (profileQueue.length >= PROFILE_QUEUE_MAX) { flushProfileEvents(); return; }
    if (!profileFlushTimer) profileFlushTimer = setTimeout(flushProfileEvents, PROFILE_FLUSH_MS);
}

function flushProfileEvents() {
    if (profileFlushTimer) { clearTimeout(profileFlushTimer); profileFlushTimer = null; }
    if (!profileQueue.length) return;
    const events = profileQueue;
    profileQueue = [];
    try {
        chrome.runtime.sendMessage({ type: 'MERID_PROFILE_EVENTS', events }, () => {
            void chrome.runtime.lastError; // fire-and-forget; losing a batch is harmless
        });
    } catch (e) { /* extension context invalidated (update/reload) */ }
}

// Never lose the tail of a reading session. `pagehide` covers navigation and
// tab close; `visibilitychange` covers tab switches and mobile backgrounding,
// which on some platforms is the last callback that runs at all.
window.addEventListener('pagehide', flushProfileEvents);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushProfileEvents();
});

// -------------------------------------------------------------
// AI context check (optional feature - the background gates on the user's
// toggle + API key, so this is a no-op unless the user set both up).
// Runs after the initial scan AND (debounced) after dynamically-added
// content gets replaced, since modern sites render most text after load.
// Each run sends one batched request: unique unchecked replaced words +
// a short sentence snippet each. Words the AI flags as out-of-context are
// reverted back to the original text immediately (no gray underline, no
// user action needed). Failures never break the page.
// -------------------------------------------------------------
const AI_SNIPPET_RADIUS = 60;      // chars kept around the word - keeps tokens low
const AI_CHECK_MAX_BATCHES = 3;    // max requests per page visit (cost cap)
const AI_CHECK_DEBOUNCE_MS = 1500; // let dynamic content settle first
// Keyed by "word|sentence", NOT by word: the whole point of the context check
// is that a word can be right in one sentence and wrong in another, so a
// verdict earned in one place must never be reused - or applied - elsewhere.
let aiCheckedPairs = new Set();
let aiChecksSent = 0;
let aiCheckTimer = null;

function scheduleAiContextCheck() {
    if (aiCheckTimer) clearTimeout(aiCheckTimer);
    aiCheckTimer = setTimeout(runAiContextCheck, AI_CHECK_DEBOUNCE_MS);
}

function sentenceAround(span) {
    const block = span.closest('p, li, td, th, h1, h2, h3, h4, blockquote') || span.parentElement;
    const text = ((block && block.textContent) || '').replace(/\s+/g, ' ').trim();
    const needle = span.textContent;
    const idx = text.indexOf(needle);
    if (idx === -1) return text.slice(0, AI_SNIPPET_RADIUS * 2);
    const start = Math.max(0, idx - AI_SNIPPET_RADIUS);
    return text.slice(start, idx + needle.length + AI_SNIPPET_RADIUS).trim();
}

function runAiContextCheck() {
    if (aiChecksSent >= AI_CHECK_MAX_BATCHES) return;

    // Group by (word, sentence). Identical pairs on the page share one verdict
    // - they are the same question - but the same word in a different sentence
    // is a separate item, judged and reverted independently.
    const groups = new Map();
    document.querySelectorAll('.vocab-master-highlight.vocab-replaced').forEach(sp => {
        const word = (sp.dataset.word || '').toLowerCase();
        if (!word) return;
        const sentence = sentenceAround(sp);
        const key = word + '|' + sentence;
        if (aiCheckedPairs.has(key)) return;
        const g = groups.get(key);
        if (g) g.spans.push(sp);
        else groups.set(key, { key, sentence, spans: [sp] });
    });
    if (!groups.size) return;

    const batch = Array.from(groups.values()).slice(0, 20);
    const items = batch.map(g => ({
        word: g.spans[0].dataset.replacement || g.spans[0].dataset.word || '',
        original: g.spans[0].dataset.original || '',
        sentence: g.sentence
    }));

    aiChecksSent++;
    log('[VM] AI context check: sending', items.length, 'items (batch', aiChecksSent + '/' + AI_CHECK_MAX_BATCHES + ')');
    chrome.runtime.sendMessage({ type: 'MERID_AI_CHECK', items }, (res) => {
        if (chrome.runtime.lastError) { console.warn('[VM] AI check failed:', chrome.runtime.lastError.message); return; }
        if (!res) { console.warn('[VM] AI check: no response.'); return; }
        if (res.disabled) { log('[VM] AI check is off (toggle disabled or no API key).'); return; }
        if (!res.ok || !Array.isArray(res.verdicts)) {
            console.warn('[VM] AI check error:', res.status || res.reason || 'unknown', res.detail || '');
            return;
        }
        let reverted = 0;
        let upgraded = 0;
        batch.forEach((g, i) => {
            aiCheckedPairs.add(g.key);
            const word = g.spans[0].dataset.word || '';
            const bad = res.verdicts[i] === 0;
            // The verdict is also a free training label for the local ranker.
            queueProfileEvent(word, bad ? 'aiBad' : 'aiOk');
            if (!bad) return;

            // Prefer upgrading to the word the AI suggested over dropping the
            // slot entirely - but only when that word is a real entry in the
            // loaded dataset, so the tooltip still has something to show.
            const entry = findVocabEntry((res.betters || [])[i]);
            if (entry) { scheduleUpgrade(g.spans, entry); upgraded++; }
            else { revertSpans(g.spans); reverted++; }
        });
        log('[VM] AI context check: verified', batch.length, 'items, reverted', reverted,
            ', upgraded', upgraded,
            '(cached ' + (res.cached || 0) + ', asked ' + (res.asked || 0) + ', model ' + (res.model || '?') + ')');
    });
}

// -------------------------------------------------------------
// Revert
// -------------------------------------------------------------
function revertPage() {
    const parents = new Set();
    document.querySelectorAll('.vocab-master-highlight').forEach(span => {
        const originalText = span.dataset.original || span.textContent;
        if (span.parentNode) parents.add(span.parentNode);
        span.replaceWith(document.createTextNode(originalText));
    });
    // Merge adjacent text nodes only where we actually changed things.
    parents.forEach(p => { try { p.normalize(); } catch (e) { /* detached */ } });
    replacedCount = 0;
}

// -------------------------------------------------------------
// Word upgrades (AI suggested something better than what we inserted)
//
// Swapping text under a reader's eyes is worse than showing a slightly wrong
// word: the line reflows and they lose their place. So an upgrade is only
// applied while the span is OUT of the viewport. Anything currently on screen
// is parked until it scrolls away, and dropped if the user never goes back.
// -------------------------------------------------------------
let pendingUpgrades = [];
let upgradeScrollBound = false;
let upgradeRaf = null;

/** Case-insensitive lookup of an English headword in the loaded dataset. */
function findVocabEntry(word) {
    const w = String(word || '').toLowerCase().trim();
    if (!w) return null;
    // Never suggest a word the user has already dismissed or told us they know.
    if (knownSet.has(w)) return null;
    return vocabulary.find(v => (v.word || '').toLowerCase() === w) || null;
}

function isOnScreen(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false; // hidden or detached
    return r.bottom > 0 && r.top < (window.innerHeight || 0);
}

/** Rewrite one span in place to show a different vocabulary entry. */
function applyUpgrade(span, entry) {
    if (!span || !span.isConnected) return;
    span.dataset.word = entry.word;
    span.dataset.replacement = entry.word;
    span.dataset.level = entry.dataset || '';
    // applyDisplayMode re-renders from dataset and guards its own
    // replacedCount bookkeeping, so the count stays correct on re-entry.
    applyDisplayMode(span);
    const wl = (entry.word || '').toLowerCase();
    if (!shownThisPage.has(wl)) {
        shownThisPage.add(wl);
        queueProfileEvent(entry.word, 'shown', entry.dataset);
    }
}

function scheduleUpgrade(spans, entry) {
    (spans || []).forEach(span => {
        if (!span || !span.isConnected) return;
        if (!isOnScreen(span)) { applyUpgrade(span, entry); return; }
        pendingUpgrades.push({ span, entry });
    });
    if (pendingUpgrades.length && !upgradeScrollBound) {
        upgradeScrollBound = true;
        window.addEventListener('scroll', onUpgradeScroll, { passive: true });
    }
}

function onUpgradeScroll() {
    if (upgradeRaf) return;                       // coalesce a burst of scroll events
    upgradeRaf = requestAnimationFrame(() => {
        upgradeRaf = null;
        flushPendingUpgrades();
    });
}

function flushPendingUpgrades() {
    if (!pendingUpgrades.length) return;
    const stillPending = [];
    for (const job of pendingUpgrades) {
        if (!job.span.isConnected) continue;      // the node went away; drop it
        if (isOnScreen(job.span)) { stillPending.push(job); continue; }
        applyUpgrade(job.span, job.entry);
    }
    pendingUpgrades = stillPending;
    if (!pendingUpgrades.length && upgradeScrollBound) {
        window.removeEventListener('scroll', onUpgradeScroll);
        upgradeScrollBound = false;
    }
}

/**
 * Unwrap an explicit list of spans, restoring their original text.
 * Used by the AI context check, which rejects individual (word, sentence)
 * occurrences rather than whole headwords.
 */
function revertSpans(spans) {
    const parents = new Set();
    (spans || []).forEach(span => {
        if (!span || !span.isConnected) return;
        const originalText = span.dataset.original || span.textContent;
        if (span.classList.contains('vocab-replaced')) replacedCount = Math.max(0, replacedCount - 1);
        if (span.parentNode) parents.add(span.parentNode);
        // makeTextNode marks the node processed, so the MutationObserver does
        // not immediately re-replace the text we just put back.
        span.replaceWith(makeTextNode(originalText));
    });
    parents.forEach(p => { try { p.normalize(); } catch (e) { /* detached */ } });
}

// Unwrap every span for a single headword (used by "I know this", which is a
// statement about the word itself rather than about one sentence).
function revertWord(word) {
    const wl = String(word).toLowerCase();
    const matches = [];
    document.querySelectorAll('.vocab-master-highlight').forEach(span => {
        if ((span.dataset.word || '').toLowerCase() === wl) matches.push(span);
    });
    revertSpans(matches);
}

// -------------------------------------------------------------
// Learning card (hover tooltip)
// -------------------------------------------------------------
function createTooltip() {
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'vocab-master-tooltip';
    tooltipElement.style.display = 'none';
    document.body.appendChild(tooltipElement);

    tooltipElement.addEventListener('click', onTooltipClick);
    document.addEventListener('mouseover', handleMouseOver);
}

function onTooltipClick(e) {
    if (e.target.closest('.vm-audio')) {
        const word = tooltipElement.querySelector('.vm-word')?.textContent || '';
        try {
            const u = new SpeechSynthesisUtterance(word);
            u.lang = 'en-US';
            window.speechSynthesis.speak(u);
        } catch (err) { /* speech not available */ }
    } else if (e.target.closest('.vm-close')) {
        hideTooltip();
    } else if (e.target.closest('.vm-save')) {
        handleSave(e.target.closest('.vm-save'));
    } else if (e.target.closest('.vm-know')) {
        handleKnow();
    } else if (e.target.closest('.vm-up')) {
        handleRate('up', e.target.closest('.vm-rate'));
    } else if (e.target.closest('.vm-down')) {
        handleRate('down', e.target.closest('.vm-rate'));
    }
}

/**
 * Thumbs up / down. Purely a preference signal for the local ranker - unlike
 * "I know this" it does not unwrap the word, so a rating never disturbs the
 * text the user is reading. Rating down a word makes it rarer, not banned.
 */
function handleRate(kind, group) {
    const word = tooltipElement.dataset.currentWord || '';
    if (!word) return;
    queueProfileEvent(word, kind, tooltipElement.dataset.currentLevel);
    flushProfileEvents(); // explicit action: persist it now, not in 4s
    if (group) {
        group.classList.add('vm-rated');
        group.querySelectorAll('button').forEach(b => { b.disabled = true; });
        const picked = group.querySelector(kind === 'up' ? '.vm-up' : '.vm-down');
        if (picked) picked.classList.add('vm-picked');
    }
}

// "Save to Deck" - append the word to the local deck (chrome.storage.local).
function handleSave(btn) {
    const word = tooltipElement.dataset.currentWord || '';
    if (!word) return;
    const entry = {
        word,
        vietnamese: tooltipElement.dataset.currentVietnamese || '',
        definition: tooltipElement.dataset.currentDefinition || '',
        example: tooltipElement.dataset.currentExample || '',
        type: tooltipElement.dataset.currentType || ''
    };
    chrome.storage.local.get(['savedWords'], (r) => {
        const list = r.savedWords || [];
        if (!list.some(e => (e.word || '').toLowerCase() === word.toLowerCase())) list.push(entry);
        chrome.storage.local.set({ savedWords: list });
        savedSet.add(word.toLowerCase());
        if (btn) { btn.textContent = t('tooltipSaved', 'Saved ✓'); btn.disabled = true; }
    });
    queueProfileEvent(word, 'saved', tooltipElement.dataset.currentLevel);
    flushProfileEvents();
}

// "I know this" - mark known, unwrap it here, and skip it on future pages.
function handleKnow() {
    const word = tooltipElement.dataset.currentWord || '';
    if (!word) return;
    chrome.storage.local.get(['knownWords'], (r) => {
        const list = r.knownWords || [];
        const wl = word.toLowerCase();
        if (!list.map(w => String(w).toLowerCase()).includes(wl)) list.push(wl);
        chrome.storage.local.set({ knownWords: list });
        knownSet.add(wl);
        revertWord(word);
        hideTooltip();
    });
    queueProfileEvent(word, 'known', tooltipElement.dataset.currentLevel);
    flushProfileEvents();
}

let hideTimeout = null;
function handleMouseOver(e) {
    const highlight = e.target.closest('.vocab-master-highlight');
    const tooltip = e.target.closest('.vocab-master-tooltip');
    if (highlight || tooltip) {
        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
        if (highlight) {
            const item = vocabulary.find(v => v.word === highlight.dataset.word);
            if (item) showTooltip(highlight, item);
        }
    } else if (tooltipElement && tooltipElement.style.display !== 'none' && !hideTimeout) {
        hideTimeout = setTimeout(() => { hideTooltip(); hideTimeout = null; }, 120);
    }
}

function showTooltip(target, item) {
    const esc = C.escapeHtml;
    const rect = target.getBoundingClientRect();
    const originalText = target.dataset.original || '';
    const phon = item.phon_n_am || item.phon_br || '';
    const isSaved = savedSet.has((item.word || '').toLowerCase());

    tooltipElement.dataset.currentWord = item.word || '';
    tooltipElement.dataset.currentVietnamese = item.vietnamese || '';
    tooltipElement.dataset.currentDefinition = item.definition || '';
    tooltipElement.dataset.currentExample = item.example || '';
    tooltipElement.dataset.currentType = item.type || '';
    tooltipElement.dataset.currentLevel = item.dataset || '';

    // Opening the card is the cheapest genuine interest signal there is, so it
    // is recorded once per headword per page - mouseover re-fires whenever the
    // pointer crosses back onto a span, which is not new information.
    const hoverKey = (item.word || '').toLowerCase();
    if (hoverKey && !hoveredThisPage.has(hoverKey)) {
        hoveredThisPage.add(hoverKey);
        queueProfileEvent(item.word, 'hover', item.dataset);
    }

    const synonyms = (item.synonyms || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
    const antonyms = (item.antonyms || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
    const example = item.example
        ? esc(item.example).replace(new RegExp('(' + C.escapeRegExp(esc(item.word)) + ')', 'gi'), '<strong>$1</strong>')
        : esc(t('tooltipNoExample', 'No example available.'));
    const titleFontSize = Math.max(18, 28 - Math.max(0, (item.word || '').length - 9) * 1.2);

    tooltipElement.innerHTML = `
        <div class="vm-card">
            <button class="vm-close" type="button" aria-label="${esc(t('tooltipClose', 'Close'))}">&times;</button>
            <div class="vm-body">
                <div class="vm-header">
                    <div class="vm-title vm-word" style="font-size:${titleFontSize.toFixed(1)}px">${esc((item.word || '').toUpperCase())}</div>
                    <div class="vm-meta">
                        <span class="vm-type">(${esc(item.type || '')})</span>
                        <button class="vm-audio" type="button" aria-label="${esc(t('tooltipPlay', 'Play pronunciation'))}">${SPEAKER_SVG}</button>
                        ${phon ? `<span class="vm-phon">${esc(phon)}</span>` : ''}
                    </div>
                </div>
                <div class="vm-definition">${esc(item.definition || t('tooltipNoDefinition', 'No definition available.'))}</div>
                ${synonyms.length ? `<div class="vm-chips">${synonyms.map(s => `<span class="vm-chip vm-yellow">${esc(s)}</span>`).join('')}</div>` : ''}
                ${antonyms.length ? `<div class="vm-chips">${antonyms.map(s => `<span class="vm-chip vm-dark">${esc(s)}</span>`).join('')}</div>` : ''}
                <div class="vm-example">${example}</div>
                <div class="vm-trans">
                    <div class="vm-trow"><span class="vm-tlabel">${esc(t('tooltipVietnamese', 'Vietnamese'))}</span><span class="vm-tvalue">${esc(item.vietnamese || 'N/A')}</span></div>
                    ${originalText ? `<div class="vm-trow"><span class="vm-tlabel">${esc(t('tooltipReplaced', 'Replaced'))}</span><span class="vm-tvalue">${esc(originalText)}</span></div>` : ''}
                </div>
            </div>
            <div class="vm-actions">
                <button class="vm-save" type="button" ${isSaved ? 'disabled' : ''}>${esc(isSaved ? t('tooltipSaved', 'Saved ✓') : t('tooltipSave', 'Save to Deck'))}</button>
                <button class="vm-know" type="button">${esc(t('tooltipKnow', 'I know this'))}</button>
                <span class="vm-rate">
                    <button class="vm-up" type="button" aria-label="${esc(t('tooltipGood', 'Good suggestion'))}" title="${esc(t('tooltipGood', 'Good suggestion'))}">&#128077;</button>
                    <button class="vm-down" type="button" aria-label="${esc(t('tooltipBad', 'Not a good fit here'))}" title="${esc(t('tooltipBad', 'Not a good fit here'))}">&#128078;</button>
                </span>
            </div>
        </div>`;

    tooltipElement.style.display = 'block';
    const tRect = tooltipElement.getBoundingClientRect();
    const buffer = 20;
    let top;
    if ((window.innerHeight - rect.bottom) < tRect.height + buffer && rect.top > tRect.height + buffer) {
        top = rect.top + window.scrollY - tRect.height - 10;
        tooltipElement.style.animation = 'vm-slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    } else {
        top = rect.bottom + window.scrollY + 10;
        tooltipElement.style.animation = 'vm-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    }
    let left = rect.left + window.scrollX - (tRect.width / 2) + (rect.width / 2);
    if (left < 10) left = 10;
    if (left + tRect.width > window.innerWidth - 10) left = window.innerWidth - tRect.width - 10;
    tooltipElement.style.top = `${top}px`;
    tooltipElement.style.left = `${left}px`;
}

function hideTooltip() {
    if (tooltipElement) tooltipElement.style.display = 'none';
}

// -------------------------------------------------------------
// React to setting / dataset / deck changes live (no reload)
// -------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        // Deck/known lists changed (possibly from the options page or another tab).
        if (changes.knownWords) {
            const newList = (changes.knownWords.newValue || []).map(w => String(w).toLowerCase());
            const added = newList.filter(w => !knownSet.has(w));
            knownSet = new Set(newList);
            added.forEach(w => revertWord(w)); // removals take effect on next page load
        }
        if (changes.savedWords) {
            savedSet = new Set((changes.savedWords.newValue || []).map(e => String(e && e.word ? e.word : e).toLowerCase()));
        }
        return;
    }
    if (area !== 'sync') return;
    for (const key in changes) settings[key] = changes[key].newValue;

    revertPage();

    if (settings.extensionEnabled === false) {
        if (currentObserver) { currentObserver.disconnect(); currentObserver = null; }
        return;
    }
    // Dataset change requires fresh vocab from the background. datasetRev
    // bumps when the ACTIVE custom dataset is replaced in place (same key,
    // new entries), so it needs the same refetch.
    if (changes.datasetKey || changes.datasetRev) {
        chrome.runtime.sendMessage({ action: 'getVocabulary' }, (resp) => {
            if (chrome.runtime.lastError) return;
            vocabulary = (resp && resp.vocabulary) || vocabulary;
            init();
        });
    } else {
        init();
    }
});

// -------------------------------------------------------------
// Boot
// -------------------------------------------------------------
init();
createTooltip();
