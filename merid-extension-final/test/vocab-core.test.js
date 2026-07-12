const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../lib/vocab-core.js');

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------
test('normalizeKey lowercases and collapses whitespace but keeps accents', () => {
    assert.strictEqual(C.normalizeKey('  Cân   Nhắc '), 'cân nhắc');
    assert.strictEqual(C.normalizeKey('THỰC HIỆN'), 'thực hiện');
    // accents are meaningful - must NOT be stripped
    assert.notStrictEqual(C.normalizeKey('cân'), C.normalizeKey('can'));
});

test('stripDiacritics removes Vietnamese tone/diacritics and đ', () => {
    assert.strictEqual(C.stripDiacritics('cân nhắc'), 'can nhac');
    assert.strictEqual(C.stripDiacritics('Đường'), 'Duong');
});

test('escapeHtml neutralizes markup', () => {
    assert.strictEqual(C.escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
    assert.strictEqual(C.escapeHtml('a & "b"'), 'a &amp; &quot;b&quot;');
});

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------
test('tokenize preserves whitespace/punctuation and round-trips', () => {
    const text = 'Chúng tôi cân nhắc, rồi quyết định.';
    const toks = C.tokenize(text);
    assert.strictEqual(toks.join(''), text);
    assert.ok(C.isWordToken('cân'));
    assert.ok(!C.isWordToken(' '));
    assert.ok(!C.isWordToken(','));
});

// ---------------------------------------------------------------------------
// Vocab map + matching
// ---------------------------------------------------------------------------
const VOCAB = [
    { word: 'consider', vietnamese: 'cân nhắc, xem xét', synonyms: 'ponder, weigh' },
    { word: 'ponder', vietnamese: 'cân nhắc', synonyms: 'consider' },      // collides with consider on "cân nhắc"
    { word: 'implement', vietnamese: 'thực hiện', synonyms: 'carry out' },
    { word: 'reduce', vietnamese: 'giảm', synonyms: 'lessen' }
];

test('buildVocabMap keeps multiple English words for the same Vietnamese key', () => {
    const map = C.buildVocabMap(VOCAB, 'vieEng');
    assert.deepStrictEqual(map.get('cân nhắc').map(i => i.word).sort(), ['consider', 'ponder']);
    assert.deepStrictEqual(map.get('thực hiện').map(i => i.word), ['implement']);
});

test('buildVocabMap engEng mode indexes synonyms', () => {
    const map = C.buildVocabMap(VOCAB, 'engEng');
    assert.ok(map.has('ponder'));
    assert.ok(map.has('carry out'));
});

test('buildVocabMap accepts an array of modes and indexes both directions', () => {
    const map = C.buildVocabMap(VOCAB, ['vieEng', 'engEng']);
    // Vietnamese keys present…
    assert.ok(map.has('cân nhắc'));
    assert.ok(map.has('thực hiện'));
    // …and English synonym keys present in the same map.
    assert.ok(map.has('ponder'));
    assert.ok(map.has('carry out'));
});

test('buildVocabMap with an empty mode array falls back to vieEng', () => {
    const map = C.buildVocabMap(VOCAB, []);
    assert.ok(map.has('cân nhắc'));
    assert.ok(!map.has('carry out'));
});

test('findMatch is greedy longest-first and respects word boundaries', () => {
    const map = C.buildVocabMap(VOCAB, 'vieEng');
    const toks = C.tokenize('Chúng tôi cân nhắc nhiều thứ.');
    // find the index where "cân" starts
    let idx = toks.findIndex(t => t === 'cân');
    const m = C.findMatch(toks, idx, map, {});
    assert.strictEqual(m.matchedText, 'cân nhắc');
    assert.strictEqual(m.key, 'cân nhắc');
    assert.strictEqual(m.items.length, 2);
});

test('findMatch single-word policy', () => {
    const map = C.buildVocabMap(VOCAB, 'vieEng');
    const toks = C.tokenize('Chúng tôi giảm chi phí.');
    const idx = toks.findIndex(t => t === 'giảm');
    // allowed by default
    assert.ok(C.findMatch(toks, idx, map, { allowSingleWord: true }));
    // disallowed
    assert.strictEqual(C.findMatch(toks, idx, map, { allowSingleWord: false }), null);
});

test('findMatch returns null when the start token is not a word', () => {
    const map = C.buildVocabMap(VOCAB, 'vieEng');
    const toks = C.tokenize(' cân nhắc');
    assert.strictEqual(C.findMatch(toks, 0, map, {}), null); // token 0 is whitespace
});

// ---------------------------------------------------------------------------
// Deterministic intensity gate
// ---------------------------------------------------------------------------
test('gateByFrequency is deterministic and honors bounds', () => {
    assert.strictEqual(C.gateByFrequency('x', 0), false);
    assert.strictEqual(C.gateByFrequency('x', 100), true);
    assert.strictEqual(C.gateByFrequency('same-key', 50), C.gateByFrequency('same-key', 50));
    // A higher frequency never turns an already-true key false (monotonic).
    const key = 'monotonic-key';
    let prev = false;
    for (let f = 0; f <= 100; f += 10) {
        const now = C.gateByFrequency(key, f);
        if (prev) assert.ok(now, 'gate must stay true as frequency rises');
        prev = now || prev;
    }
});

test('gateByFrequency roughly tracks the requested rate', () => {
    let hits = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (C.gateByFrequency('k' + i, 30)) hits++;
    const rate = hits / N;
    assert.ok(rate > 0.2 && rate < 0.4, `rate ${rate} not near 0.30`);
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
test('parseCSV handles quoted commas, CRLF, BOM and blank lines', () => {
    const csv = '﻿word,vietnamese,definition\r\nabate,"giảm, bớt","to reduce, lessen"\r\n\r\nabode,nơi ở,home\r\n';
    const rows = C.parseCSV(csv);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].word, 'abate');
    assert.strictEqual(rows[0].vietnamese, 'giảm, bớt');
    assert.strictEqual(rows[0].definition, 'to reduce, lessen');
    assert.strictEqual(rows[1].word, 'abode');
});

test('validateEntry requires word + vietnamese', () => {
    assert.ok(C.validateEntry({ word: 'abate', vietnamese: 'giảm' }));
    assert.ok(!C.validateEntry({ word: '', vietnamese: 'giảm' }));
    assert.ok(!C.validateEntry({ word: 'abate', vietnamese: '' }));
    assert.ok(!C.validateEntry(null));
});

test('normalizeEntry adds id and dataset tag', () => {
    const e = C.normalizeEntry({ word: 'Abate', vietnamese: 'giảm' }, 'c1');
    assert.strictEqual(e.dataset, 'C1');
    assert.strictEqual(e.id, 'C1:abate');
    assert.strictEqual(e.word, 'Abate');
});

// ---------------------------------------------------------------------------
// Settings + dataset registry
// ---------------------------------------------------------------------------
test('withDefaults fills missing keys without mutating input', () => {
    const input = { frequency: 20 };
    const s = C.withDefaults(input);
    assert.strictEqual(s.frequency, 20);
    assert.strictEqual(s.replacementMode, 'highlight');
    assert.strictEqual(s.extensionEnabled, true);
    assert.strictEqual(s.datasetKey, 'sat');
    assert.deepStrictEqual(input, { frequency: 20 }); // unchanged
});

test('withDefaults carries no AI/backend settings', () => {
    const s = C.withDefaults({});
    assert.strictEqual(s.contextCheckMode, undefined);
    assert.strictEqual(s.proxyUrl, undefined);
});

test('intensity <-> frequency mapping', () => {
    assert.strictEqual(C.intensityToFrequency('light'), 30);
    assert.strictEqual(C.intensityToFrequency('heavy'), 95);
    assert.strictEqual(C.frequencyToIntensity(20), 'light');
    assert.strictEqual(C.frequencyToIntensity(70), 'medium');
    assert.strictEqual(C.frequencyToIntensity(95), 'heavy');
});

test('dataset registry resolves files and tags, falling back to sat', () => {
    assert.deepStrictEqual(C.getDatasetFiles('c2'), ['dataset-C2.csv']);
    assert.strictEqual(C.getDatasetFiles('all').length, 3);
    assert.deepStrictEqual(C.getDatasetFiles('nonsense'), ['dataset-SAT.csv']);
    assert.strictEqual(C.datasetTagFor('c1'), 'C1');
});
