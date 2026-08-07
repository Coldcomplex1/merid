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
    assert.strictEqual(C.intensityToFrequency('light'), 25);
    assert.strictEqual(C.intensityToFrequency('heavy'), 80);
    assert.strictEqual(C.frequencyToIntensity(25), 'light');
    assert.strictEqual(C.frequencyToIntensity(50), 'medium');
    assert.strictEqual(C.frequencyToIntensity(80), 'heavy');
    // each preset round-trips to itself
    for (const mode of ['light', 'medium', 'heavy']) {
        assert.strictEqual(C.frequencyToIntensity(C.intensityToFrequency(mode)), mode);
    }
});

test('normalizeIntensity snaps any stored frequency to one of three levels', () => {
    assert.strictEqual(C.normalizeIntensity(0), 'casual');
    assert.strictEqual(C.normalizeIntensity(25), 'casual');
    assert.strictEqual(C.normalizeIntensity(35), 'casual');
    assert.strictEqual(C.normalizeIntensity(36), 'focused');
    assert.strictEqual(C.normalizeIntensity(50), 'focused');
    assert.strictEqual(C.normalizeIntensity(63), 'focused');  // in-between value from an older build
    assert.strictEqual(C.normalizeIntensity(66), 'locked');
    assert.strictEqual(C.normalizeIntensity(100), 'locked');
    // an unreadable setting must not throw or blank the UI
    assert.strictEqual(C.normalizeIntensity(undefined), 'focused');
    assert.strictEqual(C.normalizeIntensity('nonsense'), 'focused');
    // every level round-trips through the stored frequency
    for (const level of C.INTENSITY_LEVELS) {
        assert.strictEqual(C.normalizeIntensity(C.intensityToFrequency(level)), level);
    }
});

test('postWordCap follows the published table', () => {
    // Rows are post length; a Facebook-sized post gets one word (two when the
    // reader asked for locked-in), a normal article tops out at three.
    const table = [
        //  words  casual focused locked
        [10, 1, 1, 2],
        [200, 1, 1, 2],
        [201, 1, 2, 3],
        [1000, 1, 2, 3],
        [1001, 2, 3, 4],
        [2000, 2, 3, 4],
        [2001, 3, 4, 5],
        [50000, 3, 4, 5]
    ];
    for (const [words, casual, focused, locked] of table) {
        assert.strictEqual(C.postWordCap('casual', words), casual, `casual @ ${words}`);
        assert.strictEqual(C.postWordCap('focused', words), focused, `focused @ ${words}`);
        assert.strictEqual(C.postWordCap('locked', words), locked, `locked @ ${words}`);
    }
});

test('postWordCap accepts a stored frequency as well as a level name', () => {
    assert.strictEqual(C.postWordCap(25, 500), C.postWordCap('casual', 500));
    assert.strictEqual(C.postWordCap(50, 500), C.postWordCap('focused', 500));
    assert.strictEqual(C.postWordCap(80, 500), C.postWordCap('locked', 500));
    // an in-between value left by an older build still resolves to a level
    assert.strictEqual(C.postWordCap(63, 500), C.postWordCap('focused', 500));
    // and legacy level names keep working
    assert.strictEqual(C.postWordCap('heavy', 500), C.postWordCap('locked', 500));
});

test('postWordCap never shrinks as a post gets longer or intensity rises', () => {
    for (const level of C.INTENSITY_LEVELS) {
        let prev = 0;
        for (let words = 0; words <= 5000; words += 100) {
            const now = C.postWordCap(level, words);
            assert.ok(now >= prev, `cap must not shrink with length (${level} @ ${words})`);
            prev = now;
        }
    }
    for (let words = 0; words <= 5000; words += 250) {
        assert.ok(C.postWordCap('focused', words) >= C.postWordCap('casual', words), `focused >= casual @ ${words}`);
        assert.ok(C.postWordCap('locked', words) >= C.postWordCap('focused', words), `locked >= focused @ ${words}`);
    }
});

test('countWords counts words, not punctuation or emoji', () => {
    assert.strictEqual(C.countWords('Xin chào các bạn'), 4);
    assert.strictEqual(C.countWords('Hello!!! 🎉🎉 world?'), 2);
    assert.strictEqual(C.countWords('  '), 0);
    assert.strictEqual(C.countWords(null), 0);
    // digits count - "top 10 films of 2024" is five words of reading
    assert.strictEqual(C.countWords('top 10 films of 2024'), 5);
});

test('dataset registry resolves files and tags, falling back to sat', () => {
    assert.deepStrictEqual(C.getDatasetFiles('c2'), ['dataset-C2.csv']);
    assert.strictEqual(C.getDatasetFiles('all').length, 3);
    assert.deepStrictEqual(C.getDatasetFiles('nonsense'), ['dataset-SAT.csv']);
    assert.strictEqual(C.datasetTagFor('c1'), 'C1');
});

test('canonicalHost lowercases and strips www', () => {
    assert.strictEqual(C.canonicalHost('WWW.VnExpress.net'), 'vnexpress.net');
    assert.strictEqual(C.canonicalHost('news.zing.vn'), 'news.zing.vn');
    assert.strictEqual(C.canonicalHost('  tuoitre.vn '), 'tuoitre.vn');
    assert.strictEqual(C.canonicalHost(''), '');
    assert.strictEqual(C.canonicalHost(null), '');
});

test('isSiteDisabled matches exact hosts, www variants and subdomains', () => {
    const sites = ['vnexpress.net', 'www.tuoitre.vn'];
    assert.strictEqual(C.isSiteDisabled('vnexpress.net', sites), true);
    assert.strictEqual(C.isSiteDisabled('www.vnexpress.net', sites), true);
    assert.strictEqual(C.isSiteDisabled('video.vnexpress.net', sites), true);
    assert.strictEqual(C.isSiteDisabled('tuoitre.vn', sites), true);       // stored with www, page without
    assert.strictEqual(C.isSiteDisabled('notvnexpress.net', sites), false); // suffix must be a label boundary
    assert.strictEqual(C.isSiteDisabled('zingnews.vn', sites), false);
    assert.strictEqual(C.isSiteDisabled('vnexpress.net', []), false);
    assert.strictEqual(C.isSiteDisabled('vnexpress.net', undefined), false);
});

test('merid.site is blocked without the user having to pause it', () => {
    // Reading about Merid while Merid rewrites the page is a bad first
    // impression, so our own site is off with no setting involved.
    assert.strictEqual(C.isSiteDisabled('merid.site', []), true);
    assert.strictEqual(C.isSiteDisabled('www.merid.site', []), true);
    assert.strictEqual(C.isSiteDisabled('app.merid.site', undefined), true);
    assert.strictEqual(C.isHostBlocked('merid.site'), true);
    assert.strictEqual(C.isHostBlocked('MERID.SITE'), true);
    // a lookalike host must not be caught by it
    assert.strictEqual(C.isHostBlocked('notmerid.site'), false);
    assert.strictEqual(C.isHostBlocked('merid.site.example.com'), false);
    assert.strictEqual(C.isHostBlocked('vnexpress.net'), false);
});

test('withDefaults supplies an empty disabledSites list', () => {
    assert.deepStrictEqual(C.withDefaults({}).disabledSites, []);
    assert.deepStrictEqual(C.withDefaults({ disabledSites: ['a.com'] }).disabledSites, ['a.com']);
});
