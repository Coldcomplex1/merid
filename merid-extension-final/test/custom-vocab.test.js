// Tests for the custom-dataset (user-uploaded CSV) support in vocab-core:
// the RFC-4180 record parser, the upload validator, entry normalization and
// the `custom:<id>` dataset-key helpers.
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../lib/vocab-core.js');

const HEADER = 'word,type,phon_br,phon_n_am,definition,example,vietnamese,synonyms,antonyms';

function csv(...rows) {
    return [HEADER, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// parseCsvRecords - RFC-4180 state machine
// ---------------------------------------------------------------------------
test('parseCsvRecords keeps commas inside quoted fields', () => {
    const { records, error } = C.parseCsvRecords('a,b\n"one, two",3');
    assert.strictEqual(error, null);
    assert.deepStrictEqual(records[1].fields, ['one, two', '3']);
});

test('parseCsvRecords unescapes doubled quotes', () => {
    const { records } = C.parseCsvRecords('a\n"say ""hello"" now"');
    assert.strictEqual(records[1].fields[0], 'say "hello" now');
});

test('parseCsvRecords keeps line breaks inside quoted fields in one record', () => {
    const { records, error } = C.parseCsvRecords('a,b\n"line one\nline two",x\nnext,y');
    assert.strictEqual(error, null);
    assert.strictEqual(records.length, 3);
    assert.strictEqual(records[1].fields[0], 'line one\nline two');
    assert.deepStrictEqual(records[2].fields, ['next', 'y']);
    assert.strictEqual(records[2].line, 4); // physical line, counting the wrapped one
});

test('parseCsvRecords handles CRLF, LF and a missing trailing newline alike', () => {
    for (const text of ['a,b\r\n1,2\r\n3,4\r\n', 'a,b\n1,2\n3,4']) {
        const { records } = C.parseCsvRecords(text);
        assert.strictEqual(records.length, 3);
        assert.deepStrictEqual(records[2].fields, ['3', '4']);
    }
});

test('parseCsvRecords strips a UTF-8 BOM and skips blank lines', () => {
    const { records } = C.parseCsvRecords('﻿a,b\n\n  \n1,2\n');
    assert.strictEqual(records.length, 2);
    assert.strictEqual(records[0].fields[0], 'a');
});

test('parseCsvRecords reports an unterminated quote instead of corrupting rows', () => {
    const { records, error } = C.parseCsvRecords('a,b\n"broken,2\nx,y');
    assert.strictEqual(records.length, 0);
    assert.strictEqual(error.code, 'UNTERMINATED_QUOTE');
    assert.strictEqual(error.line, 2);
});

// ---------------------------------------------------------------------------
// validateDatasetCsv - file-level errors
// ---------------------------------------------------------------------------
test('validateDatasetCsv rejects empty and whitespace-only files', () => {
    assert.strictEqual(C.validateDatasetCsv('').errorCode, 'EMPTY_FILE');
    assert.strictEqual(C.validateDatasetCsv('   \n \n').errorCode, 'EMPTY_FILE');
    assert.strictEqual(C.validateDatasetCsv(null).errorCode, 'EMPTY_FILE');
});

test('validateDatasetCsv rejects oversized files', () => {
    const big = 'x'.repeat(C.CUSTOM_LIMITS.MAX_FILE_CHARS + 1);
    assert.strictEqual(C.validateDatasetCsv(big).errorCode, 'TOO_LARGE');
});

test('validateDatasetCsv rejects malformed CSV with a row-level explanation', () => {
    const r = C.validateDatasetCsv(csv('"never closed,adj'));
    assert.strictEqual(r.errorCode, 'MALFORMED_CSV');
    assert.strictEqual(r.errors[0].code, 'UNTERMINATED_QUOTE');
});

test('validateDatasetCsv rejects a file with no recognizable header', () => {
    const r = C.validateDatasetCsv('foo,bar\n1,2');
    assert.strictEqual(r.errorCode, 'MISSING_HEADER');
});

test('validateDatasetCsv names the missing required columns', () => {
    const r = C.validateDatasetCsv('word,definition\nubiquitous,everywhere');
    assert.strictEqual(r.errorCode, 'MISSING_COLUMNS');
    assert.deepStrictEqual(r.missingColumns, ['vietnamese']);
});

test('validateDatasetCsv rejects header-only files as NO_VALID_ROWS', () => {
    assert.strictEqual(C.validateDatasetCsv(HEADER).errorCode, 'NO_VALID_ROWS');
});

test('validateDatasetCsv enforces the row cap without truncating silently', () => {
    const rows = Array.from({ length: C.CUSTOM_LIMITS.MAX_ROWS + 1 },
        (_, i) => `word${i},,,,,,nghĩa${i},,`);
    const r = C.validateDatasetCsv(csv(...rows));
    assert.strictEqual(r.errorCode, 'TOO_MANY_ROWS');
    assert.strictEqual(r.entries.length, 0);
});

// ---------------------------------------------------------------------------
// validateDatasetCsv - header normalization + row validation
// ---------------------------------------------------------------------------
test('validateDatasetCsv accepts a minimal word+vietnamese file', () => {
    const r = C.validateDatasetCsv('word,vietnamese\nconsider,cân nhắc\nreduce,giảm');
    assert.ok(r.ok);
    assert.strictEqual(r.stats.valid, 2);
    assert.strictEqual(r.entries[0].word, 'consider');
    assert.strictEqual(r.entries[0].vietnamese, 'cân nhắc');
});

test('validateDatasetCsv normalizes header case, whitespace and BOM', () => {
    const r = C.validateDatasetCsv('﻿ Word , VIETNAMESE \nconsider,cân nhắc');
    assert.ok(r.ok);
    assert.strictEqual(r.entries[0].word, 'consider');
});

test('validateDatasetCsv accepts the C1/C2-style header with a cefr column', () => {
    const r = C.validateDatasetCsv('word,type,cefr,phon_br,phon_n_am,definition,example,vietnamese,synonyms,antonyms\n'
        + 'resilient,adj,C1,/rɪˈzɪl.jənt/,/rɪˈzɪl.jənt/,able to recover quickly,She stayed resilient.,kiên cường,tough,fragile');
    assert.ok(r.ok);
    assert.strictEqual(r.entries[0].cefr, 'C1');
});

test('validateDatasetCsv warns about and drops unknown columns', () => {
    const r = C.validateDatasetCsv('word,vietnamese,notes\nconsider,cân nhắc,my note');
    assert.ok(r.ok);
    assert.ok(r.warnings.some(w => w.code === 'UNKNOWN_COLUMNS' && w.message.includes('notes')));
    assert.strictEqual(r.entries[0].notes, undefined);
});

test('validateDatasetCsv skips rows missing word or vietnamese with 1-based line numbers', () => {
    const r = C.validateDatasetCsv(csv(
        'consider,v,,,,,"cân nhắc",,',   // line 2 - ok
        ',n,,,,,thiếu từ,,',             // line 3 - no word
        'orphan,v,,,,,,,'                // line 4 - no vietnamese
    ));
    assert.ok(r.ok);
    assert.strictEqual(r.stats.valid, 1);
    assert.strictEqual(r.stats.invalid, 2);
    assert.deepStrictEqual(r.errors.map(e => [e.row, e.code]), [
        [3, 'MISSING_WORD'], [4, 'MISSING_VIETNAMESE']
    ]);
    assert.ok(r.errors[0].sample.length <= 60);
});

test('validateDatasetCsv preserves quoted commas and Vietnamese text in fields', () => {
    const r = C.validateDatasetCsv(csv(
        'consider,v,/kənˈsɪd.ər/,/kənˈsɪd.ɚ/,"to think, with care","We considered it.","cân nhắc, xem xét","ponder, weigh",""'
    ));
    assert.ok(r.ok);
    assert.strictEqual(r.entries[0].definition, 'to think, with care');
    assert.strictEqual(r.entries[0].vietnamese, 'cân nhắc, xem xét');
    assert.strictEqual(r.entries[0].synonyms, 'ponder, weigh');
});

test('validateDatasetCsv rejects files where every row is invalid', () => {
    const r = C.validateDatasetCsv(csv(',,,,,,,,', 'word-only,,,,,,,,'));
    assert.strictEqual(r.errorCode, 'NO_VALID_ROWS');
    assert.strictEqual(r.stats.invalid, 1); // the all-empty row is dropped as blank, not counted invalid
});

test('validateDatasetCsv dedupes headwords first-row-wins, case-insensitively', () => {
    const r = C.validateDatasetCsv(csv(
        'Consider,v,,,,,"cân nhắc",,',
        'consider,n,,,,,"sự cân nhắc",,',
        'reduce,v,,,,,giảm,,'
    ));
    assert.ok(r.ok);
    assert.strictEqual(r.stats.valid, 2);
    assert.strictEqual(r.stats.duplicates, 1);
    assert.deepStrictEqual(r.duplicates, [{ row: 3, word: 'consider' }]);
    assert.strictEqual(r.entries[0].vietnamese, 'cân nhắc'); // first row won
});

test('validateDatasetCsv caps the reported error sample but counts everything', () => {
    const bad = Array.from({ length: 30 }, () => ',,,,,,x,,'); // 30 rows missing word
    const r = C.validateDatasetCsv(csv('ok,,,,,,tốt,,', ...bad));
    assert.strictEqual(r.errors.length, C.CUSTOM_LIMITS.MAX_ERRORS_REPORTED);
    assert.strictEqual(r.stats.invalid, 30);
});

test('validateDatasetCsv sanitizes fields: control chars stripped, whitespace collapsed, caps applied', () => {
    const longDef = 'd'.repeat(C.CUSTOM_LIMITS.FIELD_MAX.example + 50);
    const r = C.validateDatasetCsv(csv(`con sider,v,,,,"${longDef}", "cân​  nhắc" ,,`));
    assert.ok(r.ok);
    assert.strictEqual(r.entries[0].word, 'consider');
    assert.strictEqual(r.entries[0].vietnamese, 'cân nhắc');
    assert.strictEqual(r.entries[0].example.length, C.CUSTOM_LIMITS.FIELD_MAX.example);
    assert.ok(r.warnings.some(w => w.code === 'TRUNCATED_FIELDS'));
});

test('validateDatasetCsv keeps a quoted field with an embedded newline on one record', () => {
    const r = C.validateDatasetCsv('word,vietnamese,example\nconsider,cân nhắc,"line one\nline two"\nreduce,giảm,ok');
    assert.ok(r.ok);
    assert.strictEqual(r.stats.valid, 2);
    assert.strictEqual(r.entries[0].example, 'line one line two'); // flattened to a space
});

// ---------------------------------------------------------------------------
// sanitizeDatasetName
// ---------------------------------------------------------------------------
test('sanitizeDatasetName trims, collapses and caps names', () => {
    assert.strictEqual(C.sanitizeDatasetName('  Tài chính   C1  '), 'Tài chính C1');
    assert.strictEqual(C.sanitizeDatasetName(' ​'), '');
    assert.ok(C.sanitizeDatasetName('n'.repeat(100)).length <= C.CUSTOM_LIMITS.MAX_NAME_LEN);
});

// ---------------------------------------------------------------------------
// Custom keys + entry normalization
// ---------------------------------------------------------------------------
test('custom key helpers round-trip and never collide with registry keys', () => {
    const key = C.customKeyFor('abc-123');
    assert.strictEqual(key, 'custom:abc-123');
    assert.ok(C.isCustomKey(key));
    assert.strictEqual(C.customIdFromKey(key), 'abc-123');
    assert.ok(!C.isCustomKey('sat'));
    assert.strictEqual(C.customIdFromKey('sat'), null);
    assert.strictEqual(C.DATASET_REGISTRY[key], undefined);
});

test('custom keys are not mislabeled by the registry fallbacks', () => {
    assert.strictEqual(C.datasetTagFor('custom:abc'), 'CUSTOM');
    assert.deepStrictEqual(C.getDatasetFiles('custom:abc'), []);
    // regression: unknown non-custom keys still fall back to SAT
    assert.strictEqual(C.datasetTagFor('nonsense'), 'SAT');
    assert.deepStrictEqual(C.getDatasetFiles('nonsense'), ['dataset-SAT.csv']);
    assert.strictEqual(C.withDefaults({}).datasetKey, 'sat');
});

test('normalizeCustomEntry builds a stable per-dataset id and CUSTOM tag', () => {
    const e = C.normalizeCustomEntry({ word: ' Consider ', vietnamese: 'cân nhắc' }, 'abc-123');
    assert.strictEqual(e.id, 'custom:abc-123:consider');
    assert.strictEqual(e.word, 'Consider');
    assert.strictEqual(e.dataset, 'CUSTOM');
    // stable: same input, same id
    assert.strictEqual(C.normalizeCustomEntry({ word: 'Consider', vietnamese: 'x' }, 'abc-123').id, e.id);
});

// ---------------------------------------------------------------------------
// End-to-end: uploaded entries drive the existing matching pipeline
// ---------------------------------------------------------------------------
test('validated custom entries work with buildVocabMap and findMatch in both directions', () => {
    const r = C.validateDatasetCsv(csv(
        'consider,v,,,,"We considered it.","cân nhắc, xem xét","ponder, weigh",',
        'implement,v,,,,,thực hiện,"carry out",'
    ));
    assert.ok(r.ok);
    const entries = r.entries.map(e => C.normalizeCustomEntry(e, 'ds1'));
    const map = C.buildVocabMap(entries, ['vieEng', 'engEng']);

    // Vietnamese -> English: multi-word phrase
    const viTokens = C.tokenize('Họ cân nhắc rất lâu.');
    const viStart = viTokens.findIndex(t => t === 'cân');
    const viMatch = C.findMatch(viTokens, viStart, map, {});
    assert.ok(viMatch);
    assert.strictEqual(viMatch.items[0].word, 'consider');

    // English synonym -> harder headword
    const enTokens = C.tokenize('They ponder the plan.');
    const enStart = enTokens.findIndex(t => t === 'ponder');
    const enMatch = C.findMatch(enTokens, enStart, map, {});
    assert.ok(enMatch);
    assert.strictEqual(enMatch.items[0].word, 'consider');
});
