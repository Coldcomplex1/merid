// =============================================================
// Merid - content script (LOCAL-ONLY)
// Replaces Vietnamese vocabulary on the page with the English equivalent from
// the selected local dataset(s) and shows a learning card on hover.
//
// Matching/normalization is pure and local (lib/vocab-core.js, VMCore). The
// user's deck ("Save to Deck") and known words ("I know this") are stored
// locally in chrome.storage.local. The only network use is the AI context
// check, which is routed through the background worker - this file never
// makes a request of its own.
// =============================================================

const C = window.VMCore;
const P = window.VMProfile;
// The corner badge that says a context check is running. A no-op stub keeps
// every call site safe if status-badge.js ever fails to load - a missing
// status indicator must never stop the page being read.
const Status = window.MeridStatus || { set: function () { } };

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
// One timestamp per scan, so a long page cannot have its top and bottom
// disagree about whether a word's review has come due.
let scanStartedAt = 0;

const MAX_REPLACEMENTS_PER_PAGE = 800;   // safety cap to protect big pages
const MUTATION_DEBOUNCE_MS = 300;

// Text nodes we've already looked at (avoids MutationObserver reprocessing loops).
// Reset on every init() so a settings change re-evaluates the whole page.
let processedNodes = new WeakSet();

// Per-"post" (feed item or article body) scan stats:
// { words, used, candidates: [span] }. The scan replaces up to
// VMCore.postCandidateCap words - the real cap plus a couple of spares - and
// prunePost() cuts back to VMCore.postWordCap once the context check has said
// which of them actually fit. Reset on every init().
let postWordCounts = new WeakMap();
// Every post we have touched, so a global prune (AI switched off, allowance
// spent) can reach all of them. Cleared on every init().
let knownPosts = new Set();
// Which post a span belongs to, for pruning after its verdict arrives.
let spanPost = new WeakMap();

// Headwords (and the Vietnamese text they replaced) already used somewhere on
// this page visit. A word is worth meeting once: seeing "apprehend" swapped in
// twenty posts of the same feed is noise, not practice, and it wastes an AI
// check slot per copy. Reset on every init().
let takenThisPage = new Set();

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
    knownPosts = new Set();
    spanPost = new WeakMap();
    takenThisPage = new Set();
    aiCheckedPairs = new Set();
    aiRequestsSent = 0;
    aiQueue = [];
    aiQueued = new Set();
    aiInFlight = false;
    aiDisabled = false;
    clearAiTimers();
    startSpanObserver();
    Status.set('idle');

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
                scanStartedAt = Date.now();
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
        }
    }
    processChunk();
}

// The nearest thing a reader would call one "post".
//
// This used to fall back to the closest text block (p/li/td/heading), which
// quietly turned every paragraph of an unmarked-up article into its own post
// with its own word allowance - a ten-paragraph article got ten times the
// intended budget. There are only two things worth recognising: a feed item,
// or an article body. Anything else is the page.
const FEED_ITEM_SELECTOR =
    'article, [role="article"], [role="listitem"], [data-pagelet*="Feed"], [data-testid*="post"]';
const ARTICLE_BODY_SELECTOR =
    'main, [role="main"], .post-content, .entry-content, .article-body, .article-content, #content';

function postContainerFor(el) {
    if (!el) return document.body;
    return el.closest(FEED_ITEM_SELECTOR) ||
        el.closest(ARTICLE_BODY_SELECTOR) ||
        document.body;
}

// Longest a post's measured length is trusted before we look again. Reading
// textContent walks the whole subtree, and processTextNode runs once per text
// node, so re-measuring on every call would be quadratic on a long article.
const POST_REMEASURE_MS = 2000;

/**
 * Scan stats for a post, measuring its length the first time we see it.
 *
 * Re-measures (at most every POST_REMEASURE_MS) when the post has grown by
 * more than a quarter: feed items are often mounted with a truncated caption
 * and expanded later ("See more"), and a post that doubled in length deserves
 * the allowance its new length implies.
 */
function statsFor(container) {
    let stats = postWordCounts.get(container);
    const now = Date.now();
    if (!stats) {
        stats = {
            words: C.countWords(container.textContent || ''),
            used: 0,
            measuredAt: now,
            candidates: []
        };
        postWordCounts.set(container, stats);
        knownPosts.add(container);
        return stats;
    }
    if (now - stats.measuredAt >= POST_REMEASURE_MS) {
        stats.measuredAt = now;
        const words = C.countWords(container.textContent || '');
        if (words > stats.words * 1.25) stats.words = words;
    }
    return stats;
}

function processTextNode(node, vocabMap) {
    const original = node.textContent;
    if (!original || !original.trim() || vocabMap.size === 0) { processedNodes.add(node); return; }
    if (replacedCount >= MAX_REPLACEMENTS_PER_PAGE) { processedNodes.add(node); return; }

    const tokens = C.tokenize(original);
    const container = postContainerFor(node.parentElement);
    const stats = statsFor(container);
    // Over-provision only when a context check is actually coming: it is what
    // prunes the surplus back to the cap. With no check on the way, the cap has
    // to hold at scan time or the reader just gets too many words.
    const cap = contextCheckPossible()
        ? C.postCandidateCap(settings.frequency, stats.words)
        : C.postWordCap(settings.frequency, stats.words);

    const out = [];
    let modified = false;

    for (let i = 0; i < tokens.length; i++) {
        const match = replacedCount < MAX_REPLACEMENTS_PER_PAGE && stats.used < cap
            ? C.findMatch(tokens, i, vocabMap, { allowSingleWord: true, minSingleWordLen: 2 })
            : null;

        if (!match) { out.push(makeTextNode(tokens[i])); continue; }

        const { size, matchedText, items } = match;
        const item = items[0]; // deterministic pick from the dataset
        const replaceWith = item.word;
        const wl = replaceWith.toLowerCase();
        const ml = matchedText.toLowerCase();

        // "I know this" - never replace words the user already knows.
        if (knownSet.has(wl)) {
            out.push(makeTextNode(matchedText));
            i += size - 1;
            continue;
        }

        // One appearance per word, per page visit. Keyed both ways so the same
        // Vietnamese phrase is never swapped twice, and the same English
        // headword never shows up twice from two different source phrases.
        if (takenThisPage.has(wl) || takenThisPage.has(ml)) {
            out.push(makeTextNode(matchedText));
            i += size - 1;
            continue;
        }

        // A word this reader keeps turning down does not get one of the few
        // slots this post has.
        if (!wordIsWelcome(replaceWith, item.dataset)) {
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

        // Claim the word for this page visit before anything else can.
        takenThisPage.add(wl);
        takenThisPage.add(ml);

        if (!shownThisPage.has(wl)) {
            shownThisPage.add(wl);
            // Due-ness is read against the scan's profile snapshot, before the
            // "shown" event below moves the word's clock forward. The marker is
            // what tells the reader why a word they saved has come back.
            if (P && profile && P.isDueForReview(profile, wl, scanStartedAt)) {
                span.dataset.review = '1';
                span.classList.add('vocab-review');
            }
            queueProfileEvent(replaceWith, 'shown', item.dataset);
        }

        stats.used++;
        stats.candidates.push(span);
        spanPost.set(span, container);

        // The AI context check starts when the reader actually reaches this
        // word, not when the scan finds it.
        observeSpan(span);

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
        // Newly replaced words register themselves with the viewport observer
        // as they are created, so there is nothing to kick off here.
        if (index < nodes.length) requestAnimationFrame(run);
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

// A word has to fall this far below the reader's own setting before we skip
// it. Well above the noise floor: the profile has to have real evidence that
// this reader keeps turning this word down, not just a mild preference.
const PROFILE_REJECT_RATIO = 0.6;

/**
 * Whether to offer `word` to this reader at all.
 *
 * Personalization used to bend a 0..100 frequency that a hash gate then acted
 * on, which is why the same page could show different words at 48 and 52. Now
 * that each post has a small, fixed allowance, the useful question is narrower:
 * is this a word the reader keeps rejecting? If so, pass on it and let the
 * next candidate take the slot.
 *
 * Says yes whenever personalization cannot or should not speak: no profile
 * module, no profile loaded yet, or a profile with too little evidence
 * (VMProfile handles that last case internally by fading its multiplier in
 * from exactly 1.0).
 */
function wordIsWelcome(word, level) {
    if (!P || !profile) return true;
    try {
        const base = Number(settings.frequency) || 50;
        const adjusted = P.adjustedFrequency(profile, { word, level, topic: pageTopic, now: scanStartedAt }, base);
        return adjusted >= base * PROFILE_REJECT_RATIO;
    } catch (e) {
        return true; // personalization must never break a page
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

// A reader who tabs away mid-post has still read those words; send what is
// queued rather than letting the batch expire with the page.
window.addEventListener('pagehide', flushAiQueue);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAiQueue();
});

// -------------------------------------------------------------
// AI context check (optional feature - the background gates on the user's
// toggle + API key, so this is a no-op unless the user set both up).
//
// Checking is driven by what the reader is actually looking at. A post enters
// the viewport, its replaced words join a queue, and the queue is sent as one
// batched request. Words the AI flags as out-of-context are reverted or
// upgraded immediately (no gray underline, no user action needed). Failures
// never break the page.
//
// This used to be three requests per page visit, full stop. On an endless feed
// that meant the first three screens were checked and everything past them was
// left with whatever the dataset happened to pick - which is the majority of a
// scrolling session. The cap below is now a runaway guard, not a budget; real
// spend is metered server-side (lib/ai-proxy.js).
// -------------------------------------------------------------
const AI_SNIPPET_RADIUS = 60;       // chars kept around the word - keeps tokens low
const AI_CHECK_MAX_REQUESTS = 40;   // runaway guard per page visit
const AI_BATCH_MAX_ITEMS = 20;      // most items one request may carry
const AI_BATCH_READY_ITEMS = 12;    // enough queued to be worth sending now
const AI_QUIET_MS = 1500;           // no new words for this long -> send
// Longest a word may sit unchecked. Someone reading a single post carefully
// should not be left staring at an unverified word because the queue never
// filled up, so the queue goes out on this timer no matter how short it is.
const AI_MAX_WAIT_MS = 20000;
// How far below the fold to start checking. Generous on purpose: a verdict
// that arrives while the word is still off screen can be applied silently,
// whereas one that arrives after the reader is already looking at the word has
// to wait until they scroll past it (see scheduleUpgrade). Roughly a screen and
// a half of lead time at typical scroll speeds.
const AI_LOOKAHEAD_PX = 1200;

// Keyed by "word|sentence", NOT by word: the whole point of the context check
// is that a word can be right in one sentence and wrong in another, so a
// verdict earned in one place must never be reused - or applied - elsewhere.
let aiCheckedPairs = new Set();
let aiRequestsSent = 0;
let aiQuietTimer = null;
let aiDeadlineTimer = null;
let aiInFlight = false;
let aiDisabled = false;         // set once the background says the feature is off
// Spans waiting to be checked, in the order they came into view.
let aiQueue = [];
let aiQueued = new Set();       // span-level guard against double-queueing
// Watches replaced words for viewport entry.
let spanObserver = null;

/** Queue a word that just came into view. */
function queueSpanForAiCheck(span) {
    if (aiDisabled || !span || aiQueued.has(span) || !span.dataset.word) return;
    aiQueued.add(span);
    aiQueue.push(span);
    scheduleAiFlush();
}

/**
 * Arm the two timers that get a queue sent.
 *
 * The quiet timer restarts on every new word, so a fast scroll accumulates a
 * full batch instead of firing a request per post. The deadline timer is set
 * once for the oldest word in the queue and never pushed back, which is what
 * guarantees the 20-second ceiling.
 */
function scheduleAiFlush() {
    if (aiQueue.length >= AI_BATCH_READY_ITEMS) { flushAiQueue(); return; }
    if (aiQuietTimer) clearTimeout(aiQuietTimer);
    aiQuietTimer = setTimeout(flushAiQueue, AI_QUIET_MS);
    if (!aiDeadlineTimer) aiDeadlineTimer = setTimeout(flushAiQueue, AI_MAX_WAIT_MS);
}

function clearAiTimers() {
    if (aiQuietTimer) { clearTimeout(aiQuietTimer); aiQuietTimer = null; }
    if (aiDeadlineTimer) { clearTimeout(aiDeadlineTimer); aiDeadlineTimer = null; }
}

/** Watch a word so it gets checked when the reader reaches it. */
function observeSpan(span) {
    if (aiDisabled || !spanObserver || !span) return;
    try { spanObserver.observe(span); } catch (e) { /* detached */ }
}

/**
 * Watching the words themselves, rather than the posts containing them, is
 * what makes this work on every kind of page: a feed item, an article body and
 * a page with no useful markup at all are all just spans coming into view.
 */
function startSpanObserver() {
    if (spanObserver) spanObserver.disconnect();
    // A little ahead of the viewport, so a word is usually verified by the time
    // it is actually readable rather than changing under the reader's eyes.
    spanObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            spanObserver.unobserve(entry.target);
            queueSpanForAiCheck(entry.target);
        });
    }, { rootMargin: AI_LOOKAHEAD_PX + 'px 0px' });
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

/**
 * Send whatever is queued.
 *
 * One request at a time: while it is in flight the queue keeps filling, and
 * the response re-arms the timers if anything is waiting. That keeps a fast
 * scroll from opening several requests at once without ever stranding words.
 */
function flushAiQueue() {
    clearAiTimers();
    if (aiDisabled || aiInFlight) return;
    if (aiRequestsSent >= AI_CHECK_MAX_REQUESTS) { aiQueue = []; aiQueued = new Set(); return; }

    // Group by (word, sentence). Identical pairs share one verdict - they are
    // the same question - but the same word in a different sentence is a
    // separate item, judged and reverted independently.
    const groups = new Map();
    const deferred = [];
    for (const sp of aiQueue) {
        if (!sp.isConnected || !sp.classList.contains('vocab-replaced')) continue;
        const word = (sp.dataset.word || '').toLowerCase();
        if (!word) continue;
        const sentence = sentenceAround(sp);
        const key = word + '|' + sentence;
        if (aiCheckedPairs.has(key)) continue;
        const g = groups.get(key);
        if (g) { g.spans.push(sp); continue; }
        // Past the batch size, keep the span queued for the next request
        // rather than dropping it on the floor.
        if (groups.size >= AI_BATCH_MAX_ITEMS) { deferred.push(sp); continue; }
        groups.set(key, { key, sentence, spans: [sp] });
    }
    aiQueue = deferred;
    aiQueued = new Set(deferred);
    if (!groups.size) { Status.set('idle'); return; }

    const batch = Array.from(groups.values());
    const items = batch.map(g => ({
        word: g.spans[0].dataset.replacement || g.spans[0].dataset.word || '',
        original: g.spans[0].dataset.original || '',
        sentence: g.sentence
    }));

    aiRequestsSent++;
    aiInFlight = true;
    Status.set('checking');
    log('[VM] AI context check: sending', items.length, 'items (request',
        aiRequestsSent + '/' + AI_CHECK_MAX_REQUESTS + ')');
    chrome.runtime.sendMessage({ type: 'MERID_AI_CHECK', items }, (res) => {
        aiInFlight = false;
        if (chrome.runtime.lastError) {
            console.warn('[VM] AI check failed:', chrome.runtime.lastError.message);
            Status.set('idle');
            return;
        }
        if (!res) { console.warn('[VM] AI check: no response.'); Status.set('idle'); return; }
        if (res.disabled) {
            // Nothing will ever come back; stop queueing and stop watching.
            log('[VM] AI check is off (toggle disabled or no API key).');
            stopAiChecking();
            return;
        }
        if (!res.ok || !Array.isArray(res.verdicts)) {
            console.warn('[VM] AI check error:', res.status || res.reason || 'unknown', res.detail || '');
            // A spent daily allowance is not a transient failure either.
            if (res.reason === 'quota') stopAiChecking();
            else Status.set('idle');
            return;
        }
        let reverted = 0;
        let upgraded = 0;
        // Posts whose candidates may now all have verdicts, and so be ready to
        // be cut back to the cap.
        const touchedPosts = new Set();
        batch.forEach((g, i) => {
            aiCheckedPairs.add(g.key);
            const word = g.spans[0].dataset.word || '';
            const bad = res.verdicts[i] === 0;
            g.spans.forEach(sp => {
                sp.dataset.aiChecked = '1';
                const post = spanPost.get(sp);
                if (post) touchedPosts.add(post);
            });
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

        // Now that these posts have their verdicts, apply the reader's cap to
        // the words that survived.
        touchedPosts.forEach(post => prunePost(post, false));

        log('[VM] AI context check: verified', batch.length, 'items, reverted', reverted,
            ', upgraded', upgraded,
            '(cached ' + (res.cached || 0) + ', asked ' + (res.asked || 0) + ', model ' + (res.model || '?') + ')');

        Status.set('done');
        if (aiQueue.length) scheduleAiFlush();  // words arrived while we waited
    });
}

/** Give up on context checking for this page visit (feature off, or quota spent). */
function stopAiChecking() {
    aiDisabled = true;
    aiQueue = [];
    aiQueued = new Set();
    clearAiTimers();
    if (spanObserver) { spanObserver.disconnect(); spanObserver = null; }
    Status.set('off');
    // No verdicts are coming, so the spare candidates already on the page will
    // never be judged. Cut every post back to its cap now rather than leaving
    // the reader with more words than they asked for.
    knownPosts.forEach(post => prunePost(post, true));
}

/** True while a context check could still arrive to prune the spare words. */
function contextCheckPossible() {
    return !aiDisabled && settings.aiCheckEnabled !== false;
}

// -------------------------------------------------------------
// Pruning: the cap, applied after the context check
//
// The scan deliberately replaces more words than the reader's intensity
// allows, so the check has something to reject. Once the verdicts for a post
// are in, this cuts the survivors back down to the cap.
//
// Which ones survive is a spread question, not a first-come one: three good
// words bunched in the opening sentence read worse than three spaced through
// the piece, so the keepers are chosen by their position down the page.
// -------------------------------------------------------------

/** Vertical position of a span in the document, for spread selection. */
function verticalPosition(span) {
    try {
        return span.getBoundingClientRect().top + (window.scrollY || 0);
    } catch (e) {
        return 0;
    }
}

/**
 * Cut one post back to its cap.
 *
 * @param {Element} container the post
 * @param {boolean} force     prune even if some candidates are still unchecked
 *                            (used when no verdict will ever arrive)
 */
function prunePost(container, force) {
    // Sites with virtualized feeds recycle posts out of the DOM; stop holding
    // on to those.
    if (!container.isConnected) { knownPosts.delete(container); return; }
    const stats = postWordCounts.get(container);
    if (!stats || !stats.candidates.length) return;

    // Drop candidates that are gone (reverted by the check, unwrapped by "I
    // know this", or removed by the site itself).
    const live = stats.candidates.filter(sp =>
        sp.isConnected && sp.classList.contains('vocab-master-highlight'));
    stats.candidates = live;
    if (!live.length) return;

    // Wait until every candidate has a verdict, so the choice is made among
    // words that are all known to fit.
    if (!force && live.some(sp => sp.dataset.aiChecked !== '1')) return;

    const cap = C.postWordCap(settings.frequency, stats.words);
    if (live.length <= cap) return;

    const ordered = live
        .map(sp => ({ sp, pos: verticalPosition(sp) }))
        .sort((a, b) => a.pos - b.pos);
    const keep = new Set(
        C.pickSpread(ordered.map(o => o.pos), cap).map(i => ordered[i].sp)
    );

    // A surplus word was never wrong, just crowded out - let it have its turn
    // in a later post rather than burning its one appearance here. The claim is
    // released when the revert actually lands, not now: a revert on a span the
    // reader is looking at is deferred, and releasing early would let the same
    // word appear somewhere else while this copy is still on screen.
    scheduleRevert(ordered.map(o => o.sp).filter(sp => !keep.has(sp)));

    stats.candidates = live.filter(sp => keep.has(sp));
    stats.used = stats.candidates.length;
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
// Deferred edits (the context check changed its mind about a word)
//
// Changing text under a reader's eyes is worse than showing a slightly wrong
// word: the line reflows and they lose their place. So an edit is only applied
// while the span is OUT of the viewport. Anything currently on screen is
// parked until it scrolls away, and dropped if the user never goes back.
//
// Two kinds of edit go through here: an UPGRADE, where the check suggested a
// better word for the slot, and a REVERT, where the word was crowded out by
// the reader's cap and goes back to Vietnamese. Both are cosmetic corrections
// to text already on the page, so both owe the reader the same courtesy.
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
    // Nor one already showing elsewhere on the page - an upgrade that creates a
    // duplicate defeats the one-appearance-per-word rule.
    if (takenThisPage.has(w)) return null;
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
    // Remember what the dataset had picked, so the learning card can show the
    // reader exactly what the AI changed and why the word is there.
    if (!span.dataset.aiFrom) span.dataset.aiFrom = span.dataset.word || '';
    span.classList.add('vocab-ai-fix');
    span.dataset.word = entry.word;
    span.dataset.replacement = entry.word;
    span.dataset.level = entry.dataset || '';
    // applyDisplayMode re-renders from dataset and guards its own
    // replacedCount bookkeeping, so the count stays correct on re-entry.
    applyDisplayMode(span);
    const wl = (entry.word || '').toLowerCase();
    // The upgraded word now occupies this slot; the word it displaced is gone
    // from the page, so release its claim.
    const previous = (span.dataset.aiFrom || '').toLowerCase();
    if (previous && previous !== wl) takenThisPage.delete(previous);
    takenThisPage.add(wl);
    if (!shownThisPage.has(wl)) {
        shownThisPage.add(wl);
        queueProfileEvent(entry.word, 'shown', entry.dataset);
    }
}

/** Queue an edit, applying it straight away if the span is off screen. */
function scheduleEdit(spans, job) {
    (spans || []).forEach(span => {
        if (!span || !span.isConnected) return;
        if (!isOnScreen(span)) { applyEdit(span, job); return; }
        pendingUpgrades.push(Object.assign({ span }, job));
    });
    if (pendingUpgrades.length && !upgradeScrollBound) {
        upgradeScrollBound = true;
        window.addEventListener('scroll', onUpgradeScroll, { passive: true });
    }
}

function applyEdit(span, job) {
    if (job.entry) { applyUpgrade(span, job.entry); return; }
    // Give the word back to the page only once it has actually left it.
    if (job.release) {
        takenThisPage.delete((span.dataset.word || '').toLowerCase());
        takenThisPage.delete((span.dataset.original || '').toLowerCase());
    }
    revertSpans([span]);
}

/** The check found a better word for this slot. */
function scheduleUpgrade(spans, entry) {
    scheduleEdit(spans, { entry });
}

/** The word was crowded out by the cap and goes back to Vietnamese. It was
 *  never judged wrong, so it is free to be used in a later post. */
function scheduleRevert(spans) {
    scheduleEdit(spans, { entry: null, release: true });
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
        applyEdit(job.span, job);
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
    // Set only on words the AI context check replaced with a better fit.
    const aiFrom = target.dataset.aiFrom || '';

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
                ${aiFrom ? `<div class="vm-aifix">${esc(t('tooltipAiFixed', 'AI context check swapped this'))}: <s>${esc(aiFrom)}</s> → <strong>${esc(item.word || '')}</strong></div>` : ''}
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
