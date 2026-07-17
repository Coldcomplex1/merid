#!/usr/bin/env node
/**
 * validate-datasets.js - structural + mechanical validator for the Merid
 * vocabulary CSVs (dataset-SAT.csv, dataset-C1.csv, dataset-C2.csv).
 *
 * This is a SUPPORT tool for the manual semantic audit - it catches mechanical
 * and schema problems deterministically. It does NOT judge whether a definition,
 * translation or CEFR level is *correct* - that requires human/linguist review.
 *
 * Usage:
 *   node scripts/validate-datasets.js            # validate CSVs next to this repo dir
 *   node scripts/validate-datasets.js --dir PATH # validate CSVs in PATH
 *   node scripts/validate-datasets.js --json      # machine-readable output
 *
 * Exit code is non-zero if any ERROR-level problem is found (WARN/INFO do not
 * fail the run) so it can be wired into CI later.
 *
 * Reuses the shipping CSV parser from lib/vocab-core.js so validation matches
 * exactly what the extension sees at runtime.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const VM = require('../lib/vocab-core.js');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const dirIdx = args.indexOf('--dir');
const DIR = dirIdx >= 0 ? args[dirIdx + 1] : path.join(__dirname, '..');

const DATASETS = [
    { key: 'sat', file: 'dataset-SAT.csv', tag: 'SAT', hasCefr: false, cefr: null },
    { key: 'c1', file: 'dataset-C1.csv', tag: 'C1', hasCefr: true, cefr: 'c1' },
    { key: 'c2', file: 'dataset-C2.csv', tag: 'C2', hasCefr: true, cefr: 'c2' },
];

const SAT_HEADER = ['word', 'type', 'phon_br', 'phon_n_am', 'definition', 'example', 'vietnamese', 'synonyms', 'antonyms'];
const CEFR_HEADER = ['word', 'type', 'cefr', 'phon_br', 'phon_n_am', 'definition', 'example', 'vietnamese', 'synonyms', 'antonyms'];

// Parts of speech we accept. Anything else is flagged for review.
const VALID_POS = new Set([
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
    'conjunction', 'interjection', 'determiner', 'exclamation',
    'phrase', 'idiom', 'phrasal verb', 'modal verb', 'auxiliary verb',
    'number', 'article', 'prefix', 'suffix',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const findings = []; // {level, dataset, row, word, field, code, msg}
function add(level, dataset, row, word, field, code, msg) {
    findings.push({ level, dataset, row, word, field, code, msg });
}

// Rough stem so "example contains the word" tolerates simple inflection.
function stem(w) {
    w = w.toLowerCase();
    return w
        .replace(/(ies|ied)$/, 'i')
        .replace(/(ing|ings)$/, '')
        .replace(/(ed|es|s)$/, '')
        .replace(/e$/, '');
}

function hasControlOrOddUnicode(s) {
    // Flag C0/C1 control chars (except tab/newline/CR), zero-width & bidi
    // controls, BOM, and the U+FFFD replacement char - all invisible/unsafe.
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === 9 || c === 10 || c === 13) continue;
        if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;      // control
        if (c === 0x200b || c === 0x200c || c === 0x200d) return true; // zero-width
        if (c >= 0x202a && c <= 0x202e) return true;                 // bidi
        if (c >= 0x2066 && c <= 0x2069) return true;                 // bidi isolates
        if (c === 0xfeff || c === 0xfffd) return true;               // BOM / replacement
    }
    return false;
}

function isValidIpa(s) {
    if (!s) return true; // emptiness handled separately
    const t = s.trim();
    // Accept /.../ or [...] slashed/bracketed transcription.
    return (/^\/.*\/$/.test(t) || /^\[.*\]$/.test(t));
}

// ---------------------------------------------------------------------------
// Load + per-dataset checks
// ---------------------------------------------------------------------------
const byDataset = {}; // tag -> Map(lowerWord -> {row, entry})
const globalWord = new Map(); // lowerWord -> [{tag, row, entry}]
const counts = {};

for (const ds of DATASETS) {
    const full = path.join(DIR, ds.file);
    if (!fs.existsSync(full)) {
        add('ERROR', ds.tag, 0, '', 'file', 'missing-file', `File not found: ${ds.file}`);
        continue;
    }
    const raw = fs.readFileSync(full, 'utf8');

    // Header check on the literal first line.
    const firstLine = raw.replace(/^﻿/, '').split(/\r?\n/)[0];
    const header = VM.splitCsvLine(firstLine);
    const expected = ds.hasCefr ? CEFR_HEADER : SAT_HEADER;
    if (header.join(',') !== expected.join(',')) {
        add('ERROR', ds.tag, 1, '', 'header', 'bad-header',
            `Header mismatch. Got [${header.join(', ')}] expected [${expected.join(', ')}]`);
    }

    // CRLF / trailing-newline observations.
    if (/\r\n/.test(raw)) add('INFO', ds.tag, 0, '', 'file', 'crlf', 'File uses CRLF line endings');

    // Embedded-newline guard: the shipped parseCSV splits on newlines BEFORE
    // honoring quotes, so a quoted field containing a newline shatters into
    // several corrupt rows. Detect any physical line that leaves a quote open.
    {
        const phys = raw.replace(/^﻿/, '').split(/\r?\n/);
        for (let li = 0; li < phys.length; li++) {
            const quotes = (phys[li].match(/"/g) || []).length;
            if (quotes % 2 === 1) {
                add('ERROR', ds.tag, li + 1, '', 'row', 'embedded-newline',
                    `Physical line ${li + 1} has an unbalanced quote (field spans multiple lines) - the shipped parser will corrupt this record`);
            }
        }
    }

    const rows = VM.parseCSV(raw);
    counts[ds.tag] = rows.length;
    const seen = new Map();
    byDataset[ds.tag] = seen;

    // Field-count check needs raw lines (parseCSV pads/truncates silently).
    const dataLines = raw.replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(l => l.trim());

    rows.forEach((entry, i) => {
        const rowNo = i + 2; // 1-based, +1 header
        const word = (entry.word || '').trim();
        const lower = word.toLowerCase();

        // Field count vs header
        const parts = VM.splitCsvLine(dataLines[i] != null ? dataLines[i] : '');
        if (parts.length !== expected.length) {
            add('ERROR', ds.tag, rowNo, word, 'row', 'field-count',
                `Row has ${parts.length} fields, expected ${expected.length}`);
        }

        // Required fields
        if (!word) add('ERROR', ds.tag, rowNo, word, 'word', 'empty-word', 'Missing word');
        if (!(entry.vietnamese || '').trim()) add('ERROR', ds.tag, rowNo, word, 'vietnamese', 'empty-vi', 'Missing Vietnamese meaning');
        if (!(entry.definition || '').trim()) add('WARN', ds.tag, rowNo, word, 'definition', 'empty-def', 'Missing definition');
        if (!(entry.type || '').trim()) add('WARN', ds.tag, rowNo, word, 'type', 'empty-pos', 'Missing part of speech');
        if (!(entry.example || '').trim()) add('WARN', ds.tag, rowNo, word, 'example', 'empty-ex', 'Missing example');

        // Leading/trailing whitespace or odd unicode in any field
        for (const [k, v] of Object.entries(entry)) {
            if (typeof v !== 'string') continue;
            if (v !== v.trim()) add('WARN', ds.tag, rowNo, word, k, 'whitespace', `Field "${k}" has leading/trailing whitespace`);
            if (hasControlOrOddUnicode(v)) add('ERROR', ds.tag, rowNo, word, k, 'bad-unicode', `Field "${k}" contains control/zero-width/odd unicode`);
        }

        // POS validity (allow "verb, noun" style multi-POS)
        const pos = (entry.type || '').trim().toLowerCase();
        if (pos) {
            const okPos = pos.split(/[,/]/).map(p => p.trim()).every(p => VALID_POS.has(p));
            if (!okPos) add('WARN', ds.tag, rowNo, word, 'type', 'bad-pos', `Unrecognized part of speech: "${entry.type}"`);
        }

        // CEFR label
        if (ds.hasCefr) {
            const c = (entry.cefr || '').trim().toLowerCase();
            if (c !== ds.cefr) add('ERROR', ds.tag, rowNo, word, 'cefr', 'bad-cefr', `CEFR is "${entry.cefr}" but file is ${ds.tag}`);
        }

        // IPA format
        if (!isValidIpa(entry.phon_br)) add('WARN', ds.tag, rowNo, word, 'phon_br', 'bad-ipa', `phon_br not slashed/bracketed: "${entry.phon_br}"`);
        if (!isValidIpa(entry.phon_n_am)) add('WARN', ds.tag, rowNo, word, 'phon_n_am', 'bad-ipa', `phon_n_am not slashed/bracketed: "${entry.phon_n_am}"`);

        // Definition length sanity
        const defLen = (entry.definition || '').trim().length;
        if (defLen > 0 && defLen < 3) add('WARN', ds.tag, rowNo, word, 'definition', 'short-def', `Very short definition: "${entry.definition}"`);
        if (defLen > 200) add('INFO', ds.tag, rowNo, word, 'definition', 'long-def', `Very long definition (${defLen} chars)`);

        // Synonyms / antonyms analysis
        const syn = (entry.synonyms || '').split(',').map(s => s.trim()).filter(Boolean);
        const ant = (entry.antonyms || '').split(',').map(s => s.trim()).filter(Boolean);
        const synLower = syn.map(s => s.toLowerCase());
        const antLower = ant.map(s => s.toLowerCase());

        if (synLower.includes(lower)) add('WARN', ds.tag, rowNo, word, 'synonyms', 'self-syn', 'Headword appears in its own synonyms');
        if (antLower.includes(lower)) add('WARN', ds.tag, rowNo, word, 'antonyms', 'self-ant', 'Headword appears in its own antonyms');

        const dupSyn = synLower.filter((s, idx) => synLower.indexOf(s) !== idx);
        if (dupSyn.length) add('WARN', ds.tag, rowNo, word, 'synonyms', 'dup-syn', `Duplicate synonym(s): ${[...new Set(dupSyn)].join(', ')}`);
        const dupAnt = antLower.filter((s, idx) => antLower.indexOf(s) !== idx);
        if (dupAnt.length) add('WARN', ds.tag, rowNo, word, 'antonyms', 'dup-ant', `Duplicate antonym(s): ${[...new Set(dupAnt)].join(', ')}`);

        const overlap = synLower.filter(s => antLower.includes(s));
        if (overlap.length) add('ERROR', ds.tag, rowNo, word, 'synonyms', 'syn-ant-overlap', `Same term in synonyms AND antonyms: ${[...new Set(overlap)].join(', ')}`);

        // Vietnamese matching terms
        const vi = (entry.vietnamese || '').split(',').map(s => s.trim()).filter(Boolean);
        const viLower = vi.map(s => s.toLowerCase());
        const dupVi = viLower.filter((s, idx) => viLower.indexOf(s) !== idx);
        if (dupVi.length) add('WARN', ds.tag, rowNo, word, 'vietnamese', 'dup-vi', `Duplicate Vietnamese term(s): ${[...new Set(dupVi)].join(', ')}`);
        // Very broad single-word Vietnamese function words (risk of false matches)
        // Only flag the most common ambiguous function words.
        const RISKY_VI = new Set(['của', 'và', 'là', 'có', 'được', 'cho', 'ra', 'đi', 'các', 'những', 'một']);
        viLower.forEach(v => { if (RISKY_VI.has(v)) add('WARN', ds.tag, rowNo, word, 'vietnamese', 'broad-vi', `Vietnamese match term is a common/broad word: "${v}"`); });

        // Example should contain the headword or a simple inflection
        const ex = (entry.example || '').toLowerCase();
        if (ex && word) {
            const w = lower;
            const contains = ex.includes(w) || ex.includes(stem(w)) ||
                w.split(/\s+/).every(part => ex.includes(stem(part)));
            if (!contains) add('WARN', ds.tag, rowNo, word, 'example', 'ex-missing-word', 'Example may not contain the headword/inflection');
        }

        // Duplicate within dataset (case-insensitive). A headword may legitimately
        // appear more than once with DIFFERENT parts of speech (e.g. "abuse" noun +
        // verb) - that is an intentional multi-sense entry, flagged INFO. Only a
        // repeat with the SAME part of speech is a true accidental duplicate (ERROR).
        if (lower) {
            const prev = seen.get(lower);
            if (prev) {
                if (prev.pos.has(pos)) {
                    add('ERROR', ds.tag, rowNo, word, 'word', 'dup-in-dataset', `True duplicate of row ${prev.row} (same word + POS "${pos}")`);
                } else {
                    add('INFO', ds.tag, rowNo, word, 'word', 'multi-pos-entry', `Same headword as row ${prev.row}, different POS (intentional multi-sense) - shares id "${ds.tag}:${lower}"`);
                    prev.pos.add(pos);
                }
            } else {
                seen.set(lower, { row: rowNo, entry, pos: new Set([pos]) });
            }
            if (!globalWord.has(lower)) globalWord.set(lower, []);
            globalWord.get(lower).push({ tag: ds.tag, row: rowNo, entry });
        }
    });

    // Sorting check (dataset is expected roughly alphabetical)
    const words = rows.map(r => (r.word || '').toLowerCase());
    let outOfOrder = 0;
    for (let i = 1; i < words.length; i++) if (words[i] < words[i - 1]) outOfOrder++;
    if (outOfOrder) add('INFO', ds.tag, 0, '', 'file', 'sort', `${outOfOrder} word(s) out of alphabetical order`);
}

// ---------------------------------------------------------------------------
// Cross-dataset overlap + conflict analysis
// ---------------------------------------------------------------------------
let overlapCount = 0;
let conflictCount = 0;
for (const [lower, occ] of globalWord) {
    if (occ.length < 2) continue;
    overlapCount++;
    const tags = occ.map(o => o.tag).join(', ');
    // Conflicting POS?
    const poss = new Set(occ.map(o => (o.entry.type || '').trim().toLowerCase()));
    if (poss.size > 1) {
        conflictCount++;
        add('INFO', 'CROSS', 0, lower, 'type', 'cross-pos-conflict', `"${lower}" in [${tags}] has differing POS: ${[...poss].join(' | ')}`);
    }
    // Same word C1 AND C2 -> level conflict worth review
    const inC1 = occ.some(o => o.tag === 'C1');
    const inC2 = occ.some(o => o.tag === 'C2');
    if (inC1 && inC2) add('INFO', 'CROSS', 0, lower, 'cefr', 'c1-c2-overlap', `"${lower}" is in BOTH C1 and C2`);
    add('INFO', 'CROSS', 0, lower, 'dataset', 'cross-overlap', `"${lower}" appears in: ${tags}`);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const errors = findings.filter(f => f.level === 'ERROR');
const warns = findings.filter(f => f.level === 'WARN');
const infos = findings.filter(f => f.level === 'INFO');

if (JSON_OUT) {
    console.log(JSON.stringify({ counts, overlapCount, conflictCount, findings }, null, 2));
} else {
    const byCode = {};
    for (const f of findings) byCode[f.code] = (byCode[f.code] || 0) + 1;
    console.log('=== Merid dataset validation ===');
    console.log('Dir:', DIR);
    console.log('Counts:', JSON.stringify(counts));
    console.log(`Cross-dataset overlapping headwords: ${overlapCount}`);
    console.log(`ERRORS: ${errors.length}  WARNINGS: ${warns.length}  INFO: ${infos.length}`);
    console.log('\n--- Findings by code ---');
    Object.entries(byCode).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${String(n).padStart(5)}  ${c}`));
    const show = (lvl, list) => {
        if (!list.length) return;
        console.log(`\n--- ${lvl} (${list.length}) ---`);
        list.forEach(f => console.log(`  [${f.dataset} r${f.row}] ${f.word || ''} :: ${f.code} :: ${f.msg}`));
    };
    show('ERROR', errors);
    // Keep WARN/INFO summarised unless --verbose
    if (args.includes('--verbose')) { show('WARN', warns); show('INFO', infos); }
    else console.log(`\n(${warns.length} warnings, ${infos.length} info - run with --verbose to list)`);
}

process.exitCode = errors.length ? 1 : 0;
