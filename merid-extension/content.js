// =============================================================
// Merid - content script (LOCAL-ONLY, injected on demand)
//
// This script is NOT registered for any URL. It is injected into the current
// tab only when the user explicitly activates Merid (keyboard shortcut or the
// popup), using the temporary activeTab grant. It stays idle until it receives
// a MERID_ENABLE message, and reverts the page on MERID_DISABLE.
//
// Replaces Vietnamese vocabulary on the page with the English equivalent from
// the selected local dataset(s) and shows a learning card on hover.
//
// No network requests, no backend, no AI. Pure matching/normalization lives in
// lib/vocab-core.js (VMCore). The user's deck ("Save to Deck") and known words
// ("I know this") are stored locally in chrome.storage.local.
// =============================================================

(function () {
    'use strict';

    // -------------------------------------------------------------
    // Page-level runtime guard.
    //
    // Injecting the same file twice into a frame re-runs it. This IIFE returns
    // immediately on any injection after the first, so we never create duplicate
    // MutationObservers, listeners, tooltips, style elements or replacements.
    // The listener registered by the FIRST injection owns all state; later
    // MERID_ENABLE / MERID_DISABLE messages flow through it.
    // -------------------------------------------------------------
    if (globalThis.__MERID_RUNTIME__ && globalThis.__MERID_RUNTIME__.initialized) {
        return;
    }

    const RT = (globalThis.__MERID_RUNTIME__ = {
        initialized: true,
        active: false,
        observer: null,
        tooltip: null
    });

    const C = window.VMCore;

    let settings = {};
    let vocabulary = [];
    let tooltipElement = null;
    let replacedCount = 0;
    let currentVocabMap = new Map();

    // User's local lists (lowercased headwords / saved-word keys).
    let knownSet = new Set();
    let savedSet = new Set();

    const MAX_REPLACEMENTS_PER_PAGE = 800;   // safety cap to protect big pages
    const MUTATION_DEBOUNCE_MS = 300;

    // Text nodes we've already looked at (avoids MutationObserver reprocessing loops).
    // Reset on every enable() so a settings change re-evaluates the whole page.
    let processedNodes = new WeakSet();

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

    console.log('[VM] Content script injected (idle until enabled).');

    // -------------------------------------------------------------
    // Enable / disable (driven by the service worker's toggle flow)
    // -------------------------------------------------------------

    /**
     * Turn Merid on for this document. Idempotent: safe to call when already
     * active (it reverts first so nothing is ever double-wrapped) and when
     * previously disabled (it reuses this runtime, re-reads settings, rescans).
     */
    function enable() {
        if (RT.observer) { RT.observer.disconnect(); RT.observer = null; }
        revertPage();
        processedNodes = new WeakSet();

        return new Promise(resolve => {
            // Load the local deck/known lists first so we can honour them while scanning.
            chrome.storage.local.get(['knownWords', 'savedWords'], (local) => {
                knownSet = new Set((local.knownWords || []).map(w => String(w).toLowerCase()));
                savedSet = new Set((local.savedWords || []).map(e => String(e && e.word ? e.word : e).toLowerCase()));

                chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
                    if (chrome.runtime.lastError) { console.warn('[VM] getSettings failed:', chrome.runtime.lastError.message); }
                    settings = C.withDefaults(response);

                    const modes = [settings.vieEngMode && 'vieEng', settings.engEngMode && 'engEng'].filter(Boolean);

                    const start = () => {
                        RT.active = true;
                        // Empty map when the user has turned both scan directions off:
                        // Merid stays "active" but replaces nothing.
                        currentVocabMap = modes.length ? C.buildVocabMap(vocabulary, modes) : new Map();
                        processPage(currentVocabMap);
                        observeChanges(currentVocabMap);
                        resolve(true);
                    };

                    if (vocabulary.length > 0) {
                        start();
                    } else {
                        chrome.runtime.sendMessage({ action: 'getVocabulary' }, (resp) => {
                            if (chrome.runtime.lastError) { console.warn('[VM] getVocabulary failed:', chrome.runtime.lastError.message); }
                            vocabulary = (resp && resp.vocabulary) || [];
                            start();
                        });
                    }
                });
            });
        });
    }

    /** Turn Merid off for this document: restore text, stop observing, hide card. */
    function disable() {
        if (RT.observer) { RT.observer.disconnect(); RT.observer = null; }
        revertPage();
        hideTooltip();
        RT.active = false;
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
        if (!document.body) return;
        const textNodes = collectTextNodes(document.body);
        let index = 0;
        const chunkSize = 50;

        function processChunk() {
            const end = Math.min(index + chunkSize, textNodes.length);
            for (; index < end; index++) processTextNode(textNodes[index], vocabMap);
            if (index < textNodes.length) {
                requestAnimationFrame(processChunk);
            } else {
                console.log('[VM] Page processing complete. Replaced:', replacedCount);
            }
        }
        processChunk();
    }

    function processTextNode(node, vocabMap) {
        const original = node.textContent;
        if (!original || !original.trim() || vocabMap.size === 0) { processedNodes.add(node); return; }
        if (replacedCount >= MAX_REPLACEMENTS_PER_PAGE) { processedNodes.add(node); return; }

        const tokens = C.tokenize(original);
        const out = [];
        let modified = false;

        for (let i = 0; i < tokens.length; i++) {
            const match = replacedCount < MAX_REPLACEMENTS_PER_PAGE
                ? C.findMatch(tokens, i, vocabMap, { allowSingleWord: true, minSingleWordLen: 2 })
                : null;

            if (!match) { out.push(makeTextNode(tokens[i])); continue; }

            const { size, matchedText, items } = match;
            const item = items[0]; // deterministic pick from the dataset
            const replaceWith = item.word;

            // "I know this" - never replace words the user already knows.
            if (knownSet.has(replaceWith.toLowerCase())) {
                out.push(makeTextNode(matchedText));
                i += size - 1;
                continue;
            }

            // Deterministic intensity gate - stable across re-renders (no Math.random).
            if (!C.gateByFrequency(matchedText.toLowerCase() + '|' + replaceWith.toLowerCase(), settings.frequency)) {
                out.push(makeTextNode(matchedText));
                i += size - 1;
                continue;
            }

            const span = document.createElement('span');
            span.className = 'vocab-master-highlight';
            span.dataset.word = item.word;
            span.dataset.original = matchedText;
            span.dataset.replacement = replaceWith;
            applyDisplayMode(span);

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

        RT.observer = new MutationObserver((mutations) => {
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

        RT.observer.observe(document.body, { childList: true, subtree: true });
    }

    function processNodeBatch(nodes, vocabMap) {
        let index = 0;
        const batchSize = 20;
        function run() {
            const end = Math.min(index + batchSize, nodes.length);
            for (; index < end; index++) processTextNode(nodes[index], vocabMap);
            if (index < nodes.length) requestAnimationFrame(run);
        }
        run();
    }

    // -------------------------------------------------------------
    // Messaging (from the service worker: enable / disable / status / etc.)
    // -------------------------------------------------------------
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const type = request && (request.type || request.action);
        switch (type) {
            case 'MERID_GET_STATUS':
                sendResponse({ injected: true, active: RT.active });
                return false;

            case 'MERID_ENABLE':
                enable().then(() => sendResponse({ ok: true, active: true }));
                return true; // async response

            case 'MERID_DISABLE':
                disable();
                sendResponse({ ok: true, active: false });
                return false;

            case 'MERID_TOGGLE':
                if (RT.active) { disable(); sendResponse({ ok: true, active: false }); return false; }
                enable().then(() => sendResponse({ ok: true, active: true }));
                return true;

            case 'MERID_REVERT_PAGE':
            case 'revertPage': // legacy alias
                revertPage();
                sendResponse({ ok: true, success: true });
                return false;

            case 'MERID_APPLY_SETTINGS':
                if (RT.active) { enable().then(() => sendResponse({ ok: true, active: true })); return true; }
                sendResponse({ ok: true, active: false });
                return false;

            default:
                return false;
        }
    });

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

    // Unwrap only the spans for a single headword (used by "I know this").
    function revertWord(word) {
        const wl = String(word).toLowerCase();
        const parents = new Set();
        document.querySelectorAll('.vocab-master-highlight').forEach(span => {
            if ((span.dataset.word || '').toLowerCase() !== wl) return;
            const originalText = span.dataset.original || span.textContent;
            if (span.classList.contains('vocab-replaced')) replacedCount = Math.max(0, replacedCount - 1);
            if (span.parentNode) parents.add(span.parentNode);
            span.replaceWith(document.createTextNode(originalText));
        });
        parents.forEach(p => { try { p.normalize(); } catch (e) { /* detached */ } });
    }

    // -------------------------------------------------------------
    // Learning card (hover tooltip)
    // -------------------------------------------------------------
    function createTooltip() {
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'vocab-master-tooltip';
        tooltipElement.style.display = 'none';
        document.body.appendChild(tooltipElement);
        RT.tooltip = tooltipElement;

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
            type: tooltipElement.dataset.currentType || ''
        };
        chrome.storage.local.get(['savedWords'], (r) => {
            const list = r.savedWords || [];
            if (!list.some(e => (e.word || '').toLowerCase() === word.toLowerCase())) list.push(entry);
            chrome.storage.local.set({ savedWords: list });
            savedSet.add(word.toLowerCase());
            if (btn) { btn.textContent = 'Saved ✓'; btn.disabled = true; }
        });
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
    }

    let hideTimeout = null;
    function handleMouseOver(e) {
        if (!RT.active) return;
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
        tooltipElement.dataset.currentType = item.type || '';

        const synonyms = (item.synonyms || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
        const antonyms = (item.antonyms || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
        const example = item.example
            ? esc(item.example).replace(new RegExp('(' + C.escapeRegExp(esc(item.word)) + ')', 'gi'), '<strong>$1</strong>')
            : 'No example available.';
        const titleFontSize = Math.max(18, 28 - Math.max(0, (item.word || '').length - 9) * 1.2);

        tooltipElement.innerHTML = `
            <div class="vm-card">
                <button class="vm-close" type="button" aria-label="Close">&times;</button>
                <div class="vm-body">
                    <div class="vm-header">
                        <div class="vm-title vm-word" style="font-size:${titleFontSize.toFixed(1)}px">${esc((item.word || '').toUpperCase())}</div>
                        <div class="vm-meta">
                            <span class="vm-type">(${esc(item.type || '')})</span>
                            <button class="vm-audio" type="button" aria-label="Play pronunciation">${SPEAKER_SVG}</button>
                            ${phon ? `<span class="vm-phon">${esc(phon)}</span>` : ''}
                        </div>
                    </div>
                    <div class="vm-definition">${esc(item.definition || 'No definition available.')}</div>
                    ${synonyms.length ? `<div class="vm-chips">${synonyms.map(s => `<span class="vm-chip vm-yellow">${esc(s)}</span>`).join('')}</div>` : ''}
                    ${antonyms.length ? `<div class="vm-chips">${antonyms.map(s => `<span class="vm-chip vm-dark">${esc(s)}</span>`).join('')}</div>` : ''}
                    <div class="vm-example">${example}</div>
                    <div class="vm-trans">
                        <div class="vm-trow"><span class="vm-tlabel">Vietnamese</span><span class="vm-tvalue">${esc(item.vietnamese || 'N/A')}</span></div>
                        ${originalText ? `<div class="vm-trow"><span class="vm-tlabel">Replaced</span><span class="vm-tvalue">${esc(originalText)}</span></div>` : ''}
                    </div>
                </div>
                <div class="vm-actions">
                    <button class="vm-save" type="button" ${isSaved ? 'disabled' : ''}>${isSaved ? 'Saved ✓' : 'Save to Deck'}</button>
                    <button class="vm-know" type="button">I know this</button>
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
    // React to setting / dataset / deck changes live (no reload) while active.
    // -------------------------------------------------------------
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            // Deck/known lists changed (possibly from the options page or another tab).
            if (changes.knownWords) {
                const newList = (changes.knownWords.newValue || []).map(w => String(w).toLowerCase());
                const added = newList.filter(w => !knownSet.has(w));
                knownSet = new Set(newList);
                if (RT.active) added.forEach(w => revertWord(w)); // removals take effect on next scan
            }
            if (changes.savedWords) {
                savedSet = new Set((changes.savedWords.newValue || []).map(e => String(e && e.word ? e.word : e).toLowerCase()));
            }
            return;
        }
        if (area !== 'sync') return;
        for (const key in changes) settings[key] = changes[key].newValue;

        // Only touch the page when Merid is actually running on it. Otherwise the
        // new settings are simply stored for the next activation.
        if (!RT.active) return;

        // Dataset change requires fresh vocab from the background; enable() rescans.
        if (changes.datasetKey) {
            chrome.runtime.sendMessage({ action: 'getVocabulary' }, (resp) => {
                if (chrome.runtime.lastError) return;
                vocabulary = (resp && resp.vocabulary) || vocabulary;
                enable();
            });
        } else {
            enable();
        }
    });

    // -------------------------------------------------------------
    // Boot: set up the hover card once, then stay idle until MERID_ENABLE.
    // -------------------------------------------------------------
    createTooltip();
})();
