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
 * it stays unit-testable. It performs NO network access - the extension is
 * fully local (no backend, no API keys, no AI calls).
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
        const entry = DATASET_REGISTRY[key] || DATASET_REGISTRY.sat;
        return entry.files;
    }

    function datasetTagFor(key) {
        const entry = DATASET_REGISTRY[key] || DATASET_REGISTRY.sat;
        return entry.tag;
    }

    // ---------------------------------------------------------------------
    // Settings model + defaults (single source of truth for both UIs).
    // Local-only: no context-check mode, no backend URL, no API keys.
    // ---------------------------------------------------------------------
    const DEFAULT_SETTINGS = {
        extensionEnabled: true,
        frequency: 70,               // 0..100 - deterministic replacement-intensity gate per phrase
        replacementMode: 'highlight',// 'replace' | 'highlight' | 'beside'
        vieEngMode: true,            // match Vietnamese meanings -> show English
        engEngMode: false,           // match English synonyms -> show headword
        datasetKey: 'sat'
    };

    const REPLACEMENT_MODES = ['replace', 'highlight', 'beside'];

    /** Fill missing keys with defaults without mutating the input. */
    function withDefaults(settings) {
        return Object.assign({}, DEFAULT_SETTINGS, settings || {});
    }

    // Intensity <-> frequency mapping used by the options UI.
    const INTENSITY_TO_FREQUENCY = { light: 30, medium: 65, heavy: 95 };
    function intensityToFrequency(mode) {
        return INTENSITY_TO_FREQUENCY[mode] != null ? INTENSITY_TO_FREQUENCY[mode] : 65;
    }
    function frequencyToIntensity(freq) {
        if (freq <= 45) return 'light';
        if (freq <= 80) return 'medium';
        return 'heavy';
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

    return {
        // datasets/settings
        DATASET_REGISTRY, getDatasetFiles, datasetTagFor,
        DEFAULT_SETTINGS, REPLACEMENT_MODES, withDefaults,
        INTENSITY_TO_FREQUENCY, intensityToFrequency, frequencyToIntensity,
        // text
        normalizeKey, stripDiacritics, escapeRegExp, escapeHtml, tokenize, isWordToken,
        // matching
        buildVocabMap, findMatch,
        // intensity gate
        hashToInt, gateByFrequency,
        // csv
        splitCsvLine, parseCSV, validateEntry, normalizeEntry
    };
});
