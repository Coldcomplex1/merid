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
        disabledSites: []            // canonical hostnames the user paused Merid on
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
     * True when `hostname` is covered by the pause list. An entry covers its
     * exact host and every subdomain (news.example.com matches example.com),
     * so pausing a site holds across its www/mobile/amp variants.
     */
    function isSiteDisabled(hostname, disabledSites) {
        const host = canonicalHost(hostname);
        if (!host || !Array.isArray(disabledSites)) return false;
        return disabledSites.some(site => {
            const s = canonicalHost(site);
            return s && (host === s || host.endsWith('.' + s));
        });
    }

    const REPLACEMENT_MODES = ['replace', 'highlight', 'beside'];

    /** Fill missing keys with defaults without mutating the input. */
    function withDefaults(settings) {
        return Object.assign({}, DEFAULT_SETTINGS, settings || {});
    }

    // Intensity <-> frequency mapping used by the options UI.
    const INTENSITY_TO_FREQUENCY = { light: 25, medium: 50, heavy: 80 };
    function intensityToFrequency(mode) {
        return INTENSITY_TO_FREQUENCY[mode] != null ? INTENSITY_TO_FREQUENCY[mode] : 50;
    }
    function frequencyToIntensity(freq) {
        if (freq <= 35) return 'light';
        if (freq <= 65) return 'medium';
        return 'heavy';
    }

    /**
     * Streaming word budget for a post/article: how many translations are
     * allowed once `wordsSeen` words of the post have been scanned. Density
     * scales with the post's LENGTH - roughly `frequency / 15` translations
     * per 100 words (light ≈ 2/100, medium ≈ 3/100, heavy ≈ 5/100) - so a
     * long article keeps getting translations all the way through instead of
     * burning a flat cap in the first paragraph. The floor of 2 is a head
     * start so short feed posts still get a couple of words.
     */
    function postWordBudget(frequency, wordsSeen) {
        const f = Math.max(0, Math.min(100, Number(frequency)));
        if (!(f > 0)) return 0;
        const perHundred = Math.max(1, Math.round(f / 15));
        return Math.max(2, Math.ceil((Math.max(0, wordsSeen) / 100) * perHundred));
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
        canonicalHost, isSiteDisabled,
        INTENSITY_TO_FREQUENCY, intensityToFrequency, frequencyToIntensity, postWordBudget,
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
