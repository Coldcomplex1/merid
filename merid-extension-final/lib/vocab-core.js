/**
 * vocab-core.js - pure, DOM-free helpers shared by the content script and the
 * Node test suite.
 *
 * Loaded two ways:
 *   - As the FIRST content script in the extension (classic script). It attaches
 *     its API to `globalThis.VMCore`, which the other content scripts read.
 *   - As a CommonJS module in `node --test` (`require('../lib/vocab-core.js')`).
 *
 * Keep this file free of `chrome.*`, `window`, `document` and any DOM access so
 * it stays unit-testable. This file performs NO network access - all matching
 * and CSV handling is pure and local.
 *
 * @typedef {Object} VocabularyEntry
 * @property {string}  id           Stable id: `${dataset}:${word}`.
 * @property {string}  word         English headword (the replacement).
 * @property {string}  vietnamese   Comma-separated Vietnamese meanings.
 * @property {("SAT"|"B2"|"C1"|"C2")} dataset
 * @property {string}  [type]       Part of speech.
 * @property {string}  [definition]
 * @property {string}  [example]
 * @property {string}  [synonyms]   Comma-separated.
 * @property {string}  [antonyms]   Comma-separated.
 * @property {string}  [phon_br]
 * @property {string}  [phon_n_am]
 */

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;      // Node / tests
    } else {
        root.VMCore = api;         // content-script isolated world
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ---------------------------------------------------------------------
    // Dataset registry - adding a new dataset (e.g. B2) is a drop-in: place
    // `dataset-B2.csv` in the repo, add a row here, add a button in the UI.
    // ---------------------------------------------------------------------
    const DATASET_REGISTRY = {
        sat: { label: 'SAT', files: ['dataset-SAT.csv'], tag: 'SAT' },
        // b2: { label: 'B2', files: ['dataset-B2.csv'], tag: 'B2' }, // TODO: add dataset-B2.csv
        c1: { label: 'C1', files: ['dataset-C1.csv'], tag: 'C1' },
        c2: { label: 'C2', files: ['dataset-C2.csv'], tag: 'C2' },
        all: { label: 'All', files: ['dataset-SAT.csv', 'dataset-C1.csv', 'dataset-C2.csv'], tag: 'ALL' }
    };

    function getDatasetFiles(key) {
        if (isCustomKey(key)) return []; // custom datasets load from storage, not bundled files
        const entry = DATASET_REGISTRY[key] || DATASET_REGISTRY.sat;
        return entry.files;
    }

    function datasetTagFor(key) {
        if (isCustomKey(key)) return 'CUSTOM';
        const entry = DATASET_REGISTRY[key] || DATASET_REGISTRY.sat;
        return entry.tag;
    }

    // ---------------------------------------------------------------------
    // Custom (user-uploaded) datasets - key format and limits.
    //
    // A custom dataset is selected with datasetKey = `custom:<stable-id>`;
    // its validated entries live in chrome.storage.local (see
    // lib/custom-datasets.js), never in bundled files and never in
    // chrome.storage.sync.
    // ---------------------------------------------------------------------
    const CUSTOM_KEY_PREFIX = 'custom:';

    function isCustomKey(key) {
        return typeof key === 'string' && key.indexOf(CUSTOM_KEY_PREFIX) === 0;
    }

    function customIdFromKey(key) {
        return isCustomKey(key) ? key.slice(CUSTOM_KEY_PREFIX.length) : null;
    }

    function customKeyFor(id) {
        return CUSTOM_KEY_PREFIX + id;
    }

    // Shared by the options page (preview), the service worker (import) and
    // the docs, so the numbers can never drift apart.
    const CUSTOM_LIMITS = {
        MAX_FILE_CHARS: 2 * 1024 * 1024, // ~2 MB of CSV text
        MAX_ROWS: 5000,                  // data rows per dataset (excluding header)
        MAX_DATASETS: 10,
        MAX_NAME_LEN: 40,
        MAX_ERRORS_REPORTED: 20,         // sample size; stats still count everything
        FIELD_MAX: {
            word: 64, type: 32, cefr: 16, phon_br: 64, phon_n_am: 64,
            definition: 512, example: 1024, vietnamese: 256, synonyms: 256, antonyms: 256
        }
    };

    const CUSTOM_REQUIRED_COLUMNS = ['word', 'vietnamese'];
    const CUSTOM_KNOWN_COLUMNS = ['word', 'type', 'cefr', 'phon_br', 'phon_n_am',
        'definition', 'example', 'vietnamese', 'synonyms', 'antonyms'];

    // ---------------------------------------------------------------------
    // Settings model + defaults (single source of truth for both UIs).
    // Local-only: no context-check mode, no backend URL, no API keys.
    // ---------------------------------------------------------------------
    const DEFAULT_SETTINGS = {
        extensionEnabled: true,
        frequency: 50,               // 0..100 - drives BOTH the per-phrase gate and the per-post word budget
        replacementMode: 'highlight',// 'replace' | 'highlight' | 'beside'
        vieEngMode: true,            // match Vietnamese meanings -> show English
        engEngMode: false,           // match English synonyms -> show headword
        datasetKey: 'sat',
        disabledSites: [],           // canonical hostnames the user paused Merid on
        // AI context check. ON by default now that it needs no setup from the
        // reader: Merid supplies the keys and meters usage server-side. It was
        // off while it required them to create their own API key, which made
        // opting in the only honest default. Turning it off in Settings stops
        // every request - nothing leaves the device with this false.
        aiCheckEnabled: true
    };

    // ---------------------------------------------------------------------
    // Per-site pause list ("Turn off on this site" in the popup).
    // Stored in chrome.storage.sync as canonical hostnames.
    // ---------------------------------------------------------------------

    /** Canonical form used for storing/comparing sites: lowercase, no "www." */
    function canonicalHost(hostname) {
        const h = String(hostname || '').toLowerCase().trim();
        return h.indexOf('www.') === 0 ? h.slice(4) : h;
    }

    /**
     * Sites Merid never touches, regardless of settings. Our own site is here
     * because reading about the extension while the extension rewrites the
     * page is genuinely unpleasant - the marketing copy, the tutorial and the
     * deck all say specific words on purpose, and swapping them makes the
     * product look broken. The content-bridge script (sign-in + deck sync)
     * still runs on merid.site; only the word swapping is off.
     */
    const BUILTIN_BLOCKED_HOSTS = ['merid.site'];

    /** True when the host is on the built-in blocklist (not user-editable). */
    function isHostBlocked(hostname) {
        return matchesHostList(canonicalHost(hostname), BUILTIN_BLOCKED_HOSTS);
    }

    /** Shared matcher: an entry covers its exact host and every subdomain. */
    function matchesHostList(host, list) {
        if (!host || !Array.isArray(list)) return false;
        return list.some(site => {
            const s = canonicalHost(site);
            return s && (host === s || host.endsWith('.' + s));
        });
    }

    /**
     * True when `hostname` is covered by the pause list OR by the built-in
     * blocklist. An entry covers its exact host and every subdomain
     * (news.example.com matches example.com), so pausing a site holds across
     * its www/mobile/amp variants.
     */
    function isSiteDisabled(hostname, disabledSites) {
        const host = canonicalHost(hostname);
        if (!host) return false;
        return matchesHostList(host, BUILTIN_BLOCKED_HOSTS) ||
            matchesHostList(host, disabledSites);
    }

    const REPLACEMENT_MODES = ['replace', 'highlight', 'beside'];

    /** Fill missing keys with defaults without mutating the input. */
    function withDefaults(settings) {
        return Object.assign({}, DEFAULT_SETTINGS, settings || {});
    }

    // ---------------------------------------------------------------------
    // Intensity: three named levels, nothing in between.
    //
    // The slider used to be a continuous 0..100 "frequency" that fed a hash
    // gate, which made the in-between values unpredictable - the same page
    // could show wildly different words for 48 vs 52. Readers only ever meant
    // one of three things, so that is all we offer now. `frequency` stays in
    // storage as the wire format (older installs have a number there, and the
    // profile module still speaks it) but it only ever holds one of the three
    // anchors below.
    // ---------------------------------------------------------------------
    const INTENSITY_LEVELS = ['casual', 'focused', 'locked'];
    const INTENSITY_TO_FREQUENCY = {
        casual: 25, focused: 50, locked: 80,
        // Legacy aliases - settings saved by older versions, and options.html's
        // segmented control, still use these names.
        light: 25, medium: 50, heavy: 80
    };
    function intensityToFrequency(mode) {
        return INTENSITY_TO_FREQUENCY[mode] != null ? INTENSITY_TO_FREQUENCY[mode] : 50;
    }
    function frequencyToIntensity(freq) {
        if (freq <= 35) return 'light';
        if (freq <= 65) return 'medium';
        return 'heavy';
    }

    /** Snap any stored frequency (including in-between values written by older
     *  versions) to one of the three levels. */
    function normalizeIntensity(freq) {
        const f = Number(freq);
        if (!isFinite(f)) return 'focused';   // unreadable setting -> the default
        if (f <= 35) return 'casual';
        if (f <= 65) return 'focused';
        return 'locked';
    }

    /**
     * How many words Merid may replace in one post/article.
     *
     * Rows are post length in words, columns are the three intensity levels.
     * A Facebook-sized post gets one word (two when the reader asked for
     * locked-in); a normal article tops out at three; only genuinely long
     * pieces earn the extra one or two, because a reader who has scrolled
     * through 2000 words has room for them.
     *
     * This table is the whole policy - to retune how much Merid translates,
     * change these numbers and nothing else.
     */
    const POST_WORD_CAPS = [
        // maxWords, casual, focused, locked
        { upTo: 200, casual: 1, focused: 2, locked: 2 },
        { upTo: 1000, casual: 1, focused: 2, locked: 3 },
        { upTo: 2000, casual: 2, focused: 3, locked: 4 },
        { upTo: Infinity, casual: 3, focused: 4, locked: 5 }
    ];

    /**
     * Spare words to swap in beyond the cap, so the context check has
     * something to reject.
     *
     * The cap used to be applied while scanning, which made the AI check
     * purely subtractive: at casual a post got exactly one word, and if the
     * check disliked it the reader got nothing at all. Scanning now replaces
     * cap + this many candidates and the cap is applied AFTER the verdicts
     * come back, so it selects among words known to fit rather than truncating
     * blind. Two is enough slack to lose a couple of candidates without
     * turning every post into an AI request of its own.
     */
    const CANDIDATE_SURPLUS = 2;

    /** How many words the scan may replace before the context check prunes. */
    function postCandidateCap(intensity, postWords) {
        const cap = postWordCap(intensity, postWords);
        return cap > 0 ? cap + CANDIDATE_SURPLUS : 0;
    }

    /**
     * Choose `n` of `positions` spread as evenly as possible across the range
     * they span, so the words that survive the check are distributed through
     * the post instead of bunched in the opening lines.
     *
     * Divides the span from first to last into `n` equal bands and takes the
     * candidate nearest each band's centre, never picking the same one twice.
     *
     * @param {number[]} positions ascending offsets (px down the page, or any
     *                             monotonic measure of "how far into the post")
     * @param {number} n how many to keep
     * @returns {number[]} indices into `positions`, ascending
     */
    function pickSpread(positions, n) {
        const len = positions.length;
        if (n >= len) return positions.map((_, i) => i);
        if (n <= 0) return [];
        if (n === 1) return [0];   // one word: the first one the reader meets

        const first = positions[0];
        const last = positions[len - 1];
        const span = last - first;
        const taken = new Set();
        for (let k = 0; k < n; k++) {
            // Band centres, including both ends: k/(n-1) puts the first pick at
            // the top of the post and the last at the bottom.
            const target = first + (span * k) / (n - 1);
            let best = -1;
            let bestDist = Infinity;
            for (let i = 0; i < len; i++) {
                if (taken.has(i)) continue;
                const d = Math.abs(positions[i] - target);
                if (d < bestDist) { bestDist = d; best = i; }
            }
            if (best >= 0) taken.add(best);
        }
        return Array.from(taken).sort((a, b) => a - b);
    }

    /**
     * Cap for a post of `postWords` words at the given intensity.
     *
     * Note this reads the post's TOTAL length, not how much of it has been
     * scanned so far. The old streaming budget grew as the scan walked down
     * the page, which meant a long article kept earning more slots the further
     * you read; a flat per-post cap is what readers actually expect.
     *
     * @param {string|number} intensity level name, or a legacy 0..100 frequency
     * @param {number} postWords total words in the post
     */
    /**
     * Beyond the last row of the table the allowance stops being a flat number
     * and becomes a density: one more word per this many words of text.
     *
     * Without this the table's ceiling is absurd at the extremes - a 20,000
     * word page (an infinite feed that resolved to a single container, or a
     * very long piece) would get the same five words as a 2,100 word article,
     * so everything past the opening would be bare. These rates are far
     * gentler than the ones Merid shipped with originally (which ran to five
     * words per hundred); one per few hundred words is a reading aid, not a
     * rewrite.
     */
    const LONG_POST_WORDS_PER_EXTRA = { casual: 1200, focused: 800, locked: 600 };
    const LONG_POST_FROM = 2000;

    function levelOf(intensity) {
        if (typeof intensity === 'number') return normalizeIntensity(intensity);
        if (INTENSITY_LEVELS.indexOf(intensity) >= 0) return intensity;
        return normalizeIntensity(intensityToFrequency(intensity));
    }

    function postWordCap(intensity, postWords) {
        // Zero is still "off". The slider cannot produce it any more, but
        // installs that set it before the three-level change have it stored,
        // and a reader who turned Merid down to nothing meant it.
        if (Number(intensity) === 0) return 0;
        const level = levelOf(intensity);
        const words = Math.max(0, Number(postWords) || 0);
        const row = POST_WORD_CAPS.find(r => words <= r.upTo) || POST_WORD_CAPS[POST_WORD_CAPS.length - 1];
        const base = row[level];
        if (words <= LONG_POST_FROM) return base;
        return base + Math.floor((words - LONG_POST_FROM) / LONG_POST_WORDS_PER_EXTRA[level]);
    }

    /**
     * How much of a post's allowance may be spent by the time `wordsSeen` of
     * its `totalWords` have been scanned.
     *
     * The scan walks a post from top to bottom in one pass, so without this it
     * simply spends the whole allowance on the first candidates it meets - the
     * opening paragraphs get every word and the rest of the article gets none.
     * Releasing the allowance in proportion to how far in we are spreads the
     * words down the page instead. The floor of one is a head start, so a
     * short post still gets its first word immediately rather than waiting
     * until the reader is halfway through it.
     */
    function spreadAllowance(cap, wordsSeen, totalWords) {
        if (!(cap > 0)) return 0;
        const total = Number(totalWords) || 0;
        if (total <= 0) return cap;                 // unmeasured: do not hold back
        const seen = Math.max(0, Number(wordsSeen) || 0);
        const share = Math.ceil(cap * Math.min(1, seen / total));
        return Math.max(1, Math.min(cap, share));
    }

    /** Word count used to size a post. Counts runs of letters/digits, so
     *  punctuation and emoji do not inflate a short caption into an article. */
    function countWords(text) {
        const m = String(text || '').match(/[\p{L}\p{N}]+/gu);
        return m ? m.length : 0;
    }

    // ---------------------------------------------------------------------
    // Text helpers
    // ---------------------------------------------------------------------

    /** Canonical match key: lowercase + collapse whitespace. Accents are kept
     *  on purpose - they are meaningful in Vietnamese. */
    function normalizeKey(str) {
        return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    /** Accent-insensitive form (fuzzy fallback / tests). Not used for primary
     *  matching so we do not conflate distinct Vietnamese words. */
    function stripDiacritics(str) {
        return (str || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }

    function escapeRegExp(string) {
        return (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtml(string) {
        return (string || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Split text into tokens, keeping whitespace runs and single punctuation
     *  chars as their own tokens so the text can be losslessly reassembled.
     *  Word tokens contain ASCII word chars or Vietnamese letters (U+00C0..U+1EF9). */
    function tokenize(text) {
        return (text || '').split(/(\s+|[^\s\wÀ-ỹ])/g);
    }

    function isWordToken(token) {
        return !!token && /[\wÀ-ỹ]/.test(token);
    }

    // ---------------------------------------------------------------------
    // Vocabulary map + phrase matching
    // ---------------------------------------------------------------------

    /**
     * Build a Map<searchKey, VocabularyEntry[]> from active vocabulary.
     * Values are ARRAYS so that a Vietnamese phrase mapping to several English
     * words (or vice-versa) does not silently overwrite earlier entries.
     *
     * `modes` accepts a single mode string OR an array of modes. Passing both
     * (`['vieEng','engEng']`) indexes Vietnamese meanings AND English synonyms in
     * one map, so a page can be scanned in both directions at once.
     *
     * @param {VocabularyEntry[]} activeVocab
     * @param {("vieEng"|"engEng")|Array<"vieEng"|"engEng">} modes
     */
    function buildVocabMap(activeVocab, modes) {
        const map = new Map();
        const modeList = (Array.isArray(modes) ? modes : [modes])
            .filter(Boolean);
        // Default to Vietnamese→English if nothing usable was passed.
        if (modeList.length === 0) modeList.push('vieEng');

        const addKey = (key, item) => {
            const k = normalizeKey(key);
            if (!k) return;
            const arr = map.get(k);
            if (arr) {
                if (!arr.some(e => e.word === item.word)) arr.push(item);
            } else {
                map.set(k, [item]);
            }
        };

        (activeVocab || []).forEach(item => {
            if (modeList.includes('engEng')) {
                (item.synonyms || '').split(',').forEach(s => addKey(s, item));
            }
            if (modeList.includes('vieEng')) {
                (item.vietnamese || '').split(',').forEach(s => addKey(s, item));
            }
        });
        return map;
    }

    /**
     * Try to match a vocabulary phrase starting at `tokens[startIndex]`.
     * Greedy longest-first over window sizes [3,2,1].
     *
     * @returns {{size:number, matchedText:string, key:string, items:VocabularyEntry[]}|null}
     */
    function findMatch(tokens, startIndex, vocabMap, opts) {
        opts = opts || {};
        const allowSingleWord = opts.allowSingleWord !== false; // default: allow
        const minSingleWordLen = opts.minSingleWordLen || 2;

        if (!isWordToken(tokens[startIndex])) return null;

        for (const size of [3, 2, 1]) {
            if (startIndex + size > tokens.length) continue;

            // The last token of a multi-token window must itself be a word token,
            // otherwise `.trim()` would drop a trailing separator and corrupt the match.
            if (size > 1 && !isWordToken(tokens[startIndex + size - 1])) continue;

            const slice = tokens.slice(startIndex, startIndex + size);
            const matchedText = slice.join('');
            const key = normalizeKey(matchedText);
            if (!vocabMap.has(key)) continue;

            const isSingleWord = !key.includes(' ');
            if (isSingleWord && (!allowSingleWord || key.length < minSingleWordLen)) continue;

            return { size, matchedText, key, items: vocabMap.get(key) };
        }
        return null;
    }

    // ---------------------------------------------------------------------
    // Deterministic replacement-intensity gate
    // ---------------------------------------------------------------------

    /** Stable non-negative integer hash of a string. */
    function hashToInt(str) {
        let hash = 0;
        for (let i = 0; i < (str || '').length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    /**
     * Deterministic replace/skip decision. Same key + frequency always yields the
     * same answer, so re-renders and MutationObserver passes are stable (unlike
     * Math.random). `frequency` is 0..100 - higher means more replacements.
     */
    function gateByFrequency(key, frequency) {
        const f = Math.max(0, Math.min(100, Number(frequency)));
        if (f >= 100) return true;
        if (f <= 0) return false;
        return (hashToInt('gate|' + key) % 100) < f;
    }

    // ---------------------------------------------------------------------
    // CSV parsing + entry validation/normalization
    // ---------------------------------------------------------------------

    /** Split a single CSV line honoring double-quoted fields (which may contain commas). */
    function splitCsvLine(line) {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                out.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out.map(v => v.trim());
    }

    /** Parse CSV text into row objects keyed by header. Tolerates BOM, CRLF and blank lines. */
    function parseCSV(text) {
        const clean = (text || '').replace(/^﻿/, '');
        const lines = clean.split(/\r?\n/);
        if (!lines.length || !lines[0]) return [];
        const headers = splitCsvLine(lines[0]).map(h => h.trim());
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || !lines[i].trim()) continue;
            const parts = splitCsvLine(lines[i]);
            const entry = {};
            headers.forEach((header, idx) => { entry[header] = parts[idx] != null ? parts[idx] : ''; });
            rows.push(entry);
        }
        return rows;
    }

    /** Minimal sanity check - an entry needs at least an English word + a Vietnamese meaning. */
    function validateEntry(entry) {
        return !!(entry && typeof entry.word === 'string' && entry.word.trim() &&
            typeof entry.vietnamese === 'string' && entry.vietnamese.trim());
    }

    /** Map a raw CSV row onto the VocabularyEntry shape (keeps original fields too). */
    function normalizeEntry(entry, datasetKey) {
        const tag = datasetTagFor(datasetKey);
        const word = (entry.word || '').trim();
        return Object.assign({}, entry, {
            id: tag + ':' + word.toLowerCase(),
            word,
            dataset: tag
        });
    }

    // ---------------------------------------------------------------------
    // Custom-dataset import: robust CSV parsing + validation.
    //
    // `parseCSV` above splits on newlines first, which is fine for the bundled
    // datasets (curated, single-line records) but breaks on user files where a
    // quoted field legitimately contains a line break. Uploads therefore go
    // through this character-level RFC-4180 parser instead. Everything here is
    // pure and synchronous so the options page (preview) and the service
    // worker (authoritative import) run the exact same code, and node:test
    // can cover it directly.
    // ---------------------------------------------------------------------

    /**
     * Parse CSV text into records. Quoted fields may contain commas, escaped
     * quotes ("") and embedded line breaks. Tolerates BOM, CRLF/LF and a
     * missing trailing newline; blank records are dropped.
     *
     * @returns {{records: Array<{fields:string[], line:number}>,
     *            error: null|{line:number, code:'UNTERMINATED_QUOTE'}}}
     */
    function parseCsvRecords(text) {
        const src = (text || '').replace(/^﻿/, '');
        const records = [];
        let field = '';
        let record = [];
        let inQuotes = false;
        let line = 1;       // physical line being read (1-based, for messages)
        let recordLine = 1; // line where the current record started

        const endField = () => { record.push(field); field = ''; };
        const endRecord = () => {
            endField();
            if (record.some(f => f.trim() !== '')) records.push({ fields: record, line: recordLine });
            record = [];
        };

        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (src[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else {
                    if (ch === '\n') line++;
                    field += ch;
                }
                continue;
            }
            if (ch === '"') { inQuotes = true; continue; }
            if (ch === ',') { endField(); continue; }
            if (ch === '\r' && src[i + 1] === '\n') continue; // CRLF: the \n ends the record
            if (ch === '\n' || ch === '\r') {
                endRecord();
                line++;
                recordLine = line;
                continue;
            }
            field += ch;
        }
        if (inQuotes) return { records: [], error: { line: recordLine, code: 'UNTERMINATED_QUOTE' } };
        endRecord(); // file may lack a trailing newline
        return { records, error: null };
    }

    /**
     * Clean one uploaded field: NFC-normalize (CSV-sourced Vietnamese often
     * arrives decomposed), strip control/zero-width characters, collapse
     * whitespace (this also flattens embedded line breaks), trim, and cap the
     * length. Returns { value, truncated }.
     */
    function sanitizeFieldText(value, maxLen) {
        let v = String(value == null ? '' : value);
        if (typeof v.normalize === 'function') v = v.normalize('NFC');
        v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, '');
        v = v.replace(/\s+/g, ' ').trim();
        const truncated = maxLen > 0 && v.length > maxLen;
        if (truncated) v = v.slice(0, maxLen).trim();
        return { value: v, truncated };
    }

    /** Clean a user-supplied dataset name. Returns '' when nothing usable remains. */
    function sanitizeDatasetName(name) {
        return sanitizeFieldText(name, CUSTOM_LIMITS.MAX_NAME_LEN).value;
    }

    /**
     * Validate and sanitize an uploaded CSV into storable row objects.
     *
     * Dedupe rule (documented in the UI, README and merid.site/create-dataset):
     * when the same English headword appears more than once, the FIRST row
     * wins - the same rule the bundled "All" dataset uses for overlaps.
     *
     * @returns {{
     *   ok: boolean,
     *   errorCode: null|'EMPTY_FILE'|'TOO_LARGE'|'MALFORMED_CSV'|'MISSING_HEADER'
     *             |'MISSING_COLUMNS'|'TOO_MANY_ROWS'|'NO_VALID_ROWS',
     *   missingColumns: string[],
     *   entries: Object[],   // sanitized, deduped rows (recognized columns only)
     *   stats: {totalRows:number, valid:number, invalid:number, duplicates:number},
     *   errors: Array<{row:number, code:'MISSING_WORD'|'MISSING_VIETNAMESE'|'UNTERMINATED_QUOTE', message:string, sample?:string}>,
     *   duplicates: Array<{row:number, word:string}>,
     *   warnings: Array<{code:'UNKNOWN_COLUMNS'|'TRUNCATED_FIELDS', message:string}>
     * }}
     */
    function validateDatasetCsv(text) {
        const report = {
            ok: false,
            errorCode: null,
            missingColumns: [],
            entries: [],
            stats: { totalRows: 0, valid: 0, invalid: 0, duplicates: 0 },
            errors: [],
            duplicates: [],
            warnings: []
        };
        const raw = String(text == null ? '' : text);
        if (!raw.trim()) { report.errorCode = 'EMPTY_FILE'; return report; }
        if (raw.length > CUSTOM_LIMITS.MAX_FILE_CHARS) { report.errorCode = 'TOO_LARGE'; return report; }

        const parsed = parseCsvRecords(raw);
        if (parsed.error) {
            report.errorCode = 'MALFORMED_CSV';
            report.errors.push({
                row: parsed.error.line,
                code: parsed.error.code,
                message: 'A double quote opened near line ' + parsed.error.line + ' is never closed.'
            });
            return report;
        }
        if (!parsed.records.length) { report.errorCode = 'EMPTY_FILE'; return report; }

        // Header: trim + lowercase so " Word ,VIETNAMESE" still matches.
        const headers = parsed.records[0].fields.map(h => h.trim().toLowerCase());
        if (!headers.some(h => CUSTOM_KNOWN_COLUMNS.includes(h))) {
            report.errorCode = 'MISSING_HEADER';
            return report;
        }
        report.missingColumns = CUSTOM_REQUIRED_COLUMNS.filter(c => !headers.includes(c));
        if (report.missingColumns.length) { report.errorCode = 'MISSING_COLUMNS'; return report; }
        const unknown = headers.filter(h => h && !CUSTOM_KNOWN_COLUMNS.includes(h));
        if (unknown.length) {
            report.warnings.push({
                code: 'UNKNOWN_COLUMNS',
                message: 'Ignored unrecognized column(s): ' + unknown.join(', ')
            });
        }

        const dataRecords = parsed.records.slice(1);
        report.stats.totalRows = dataRecords.length;
        if (dataRecords.length > CUSTOM_LIMITS.MAX_ROWS) { report.errorCode = 'TOO_MANY_ROWS'; return report; }

        const byWord = new Map();
        let truncatedFields = 0;
        const rowError = (row, code, message, sample) => {
            report.stats.invalid++;
            if (report.errors.length < CUSTOM_LIMITS.MAX_ERRORS_REPORTED) {
                report.errors.push({ row, code, message, sample });
            }
        };

        for (const rec of dataRecords) {
            const entry = {};
            headers.forEach((header, idx) => {
                if (!CUSTOM_KNOWN_COLUMNS.includes(header)) return;
                const cleaned = sanitizeFieldText(
                    rec.fields[idx] != null ? rec.fields[idx] : '',
                    CUSTOM_LIMITS.FIELD_MAX[header] || 256
                );
                if (cleaned.truncated) truncatedFields++;
                entry[header] = cleaned.value;
            });
            const sample = rec.fields.join(',').slice(0, 60);
            if (!entry.word) { rowError(rec.line, 'MISSING_WORD', 'Missing the English word.', sample); continue; }
            if (!entry.vietnamese) { rowError(rec.line, 'MISSING_VIETNAMESE', 'Missing the Vietnamese meaning.', sample); continue; }
            const wordKey = entry.word.toLowerCase();
            if (byWord.has(wordKey)) {
                report.stats.duplicates++;
                if (report.duplicates.length < CUSTOM_LIMITS.MAX_ERRORS_REPORTED) {
                    report.duplicates.push({ row: rec.line, word: entry.word });
                }
                continue;
            }
            byWord.set(wordKey, entry);
        }

        if (truncatedFields) {
            report.warnings.push({
                code: 'TRUNCATED_FIELDS',
                message: truncatedFields + ' overlong field value(s) were shortened.'
            });
        }
        report.entries = Array.from(byWord.values());
        report.stats.valid = report.entries.length;
        if (!report.entries.length) { report.errorCode = 'NO_VALID_ROWS'; return report; }
        report.ok = true;
        return report;
    }

    /**
     * Map a validated custom row onto the VocabularyEntry shape. The id embeds
     * the dataset's stable id so entries stay unique across custom datasets.
     */
    function normalizeCustomEntry(entry, datasetId) {
        const word = (entry.word || '').trim();
        return Object.assign({}, entry, {
            id: CUSTOM_KEY_PREFIX + datasetId + ':' + word.toLowerCase(),
            word,
            dataset: 'CUSTOM'
        });
    }

    return {
        // datasets/settings
        DATASET_REGISTRY, getDatasetFiles, datasetTagFor,
        DEFAULT_SETTINGS, REPLACEMENT_MODES, withDefaults,
        canonicalHost, isSiteDisabled, isHostBlocked, BUILTIN_BLOCKED_HOSTS,
        INTENSITY_LEVELS, INTENSITY_TO_FREQUENCY, intensityToFrequency, frequencyToIntensity,
        normalizeIntensity, POST_WORD_CAPS, postWordCap, countWords,
        CANDIDATE_SURPLUS, postCandidateCap, pickSpread, spreadAllowance,
        LONG_POST_WORDS_PER_EXTRA, LONG_POST_FROM,
        // text
        normalizeKey, stripDiacritics, escapeRegExp, escapeHtml, tokenize, isWordToken,
        // matching
        buildVocabMap, findMatch,
        // intensity gate
        hashToInt, gateByFrequency,
        // csv
        splitCsvLine, parseCSV, validateEntry, normalizeEntry,
        // custom datasets
        CUSTOM_KEY_PREFIX, CUSTOM_LIMITS, CUSTOM_REQUIRED_COLUMNS, CUSTOM_KNOWN_COLUMNS,
        isCustomKey, customIdFromKey, customKeyFor,
        parseCsvRecords, sanitizeFieldText, sanitizeDatasetName,
        validateDatasetCsv, normalizeCustomEntry
    };
});
