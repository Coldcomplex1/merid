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
        [10, 1, 2, 3],
        [200, 1, 2, 3],
        [201, 1, 2, 3],
        [1000, 1, 2, 3],
        [1001, 2, 3, 4],
        [2000, 2, 3, 4],
        [2001, 3, 4, 5]
        // Past here the allowance becomes a density rather than a flat number;
        // see the "keeps growing past the table" test below.
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

test('the three levels differ at every post length', () => {
    // Short posts used to give focused and locked-in the same allowance. A
    // social feed is nothing but short posts, so on the sites people use most
    // the slider did nothing at all. Every row must separate all three.
    for (const words of [10, 60, 200, 201, 800, 1000, 1500, 2000, 2500, 9000]) {
        const casual = C.postWordCap('casual', words);
        const focused = C.postWordCap('focused', words);
        const locked = C.postWordCap('locked', words);
        assert.ok(focused > casual, `focused must beat casual at ${words} (${focused} vs ${casual})`);
        assert.ok(locked > focused, `locked must beat focused at ${words} (${locked} vs ${focused})`);
    }
});

test('postWordCap keeps growing past the table instead of flatlining', () => {
    // A 20,000-word page - an endless feed that resolved to one container, or
    // a very long piece - must not get the same allowance as a 2,100-word
    // article, or everything past the opening is left bare.
    for (const level of C.INTENSITY_LEVELS) {
        // The final table row's own figure is the base the density builds on.
        const base = C.postWordCap(level, C.LONG_POST_FROM + 1);
        const perExtra = C.LONG_POST_WORDS_PER_EXTRA[level];
        assert.strictEqual(C.postWordCap(level, C.LONG_POST_FROM + perExtra - 1), base,
            `${level}: nothing added until a full step of text`);
        assert.strictEqual(C.postWordCap(level, C.LONG_POST_FROM + perExtra), base + 1, level);
        assert.strictEqual(C.postWordCap(level, C.LONG_POST_FROM + perExtra * 5), base + 5, level);
        assert.ok(C.postWordCap(level, 20000) > 10, `${level}: a huge page gets a real allowance`);
    }
    // Heavier intensity still means more words, at every length.
    for (const words of [3000, 8000, 20000]) {
        assert.ok(C.postWordCap('focused', words) > C.postWordCap('casual', words), `@ ${words}`);
        assert.ok(C.postWordCap('locked', words) > C.postWordCap('focused', words), `@ ${words}`);
    }
    // Still off when the reader turned it off.
    assert.strictEqual(C.postWordCap(0, 20000), 0);
});

test('spreadAllowance releases the budget as the scan moves down the post', () => {
    // The bug this exists to stop: the whole allowance spent in the first
    // paragraphs, nothing in the rest of the article.
    assert.strictEqual(C.spreadAllowance(4, 0, 1000), 1);      // head start
    assert.strictEqual(C.spreadAllowance(4, 250, 1000), 1);
    assert.strictEqual(C.spreadAllowance(4, 500, 1000), 2);
    assert.strictEqual(C.spreadAllowance(4, 750, 1000), 3);
    assert.strictEqual(C.spreadAllowance(4, 1000, 1000), 4);
    // Never more than the cap, however far past the end we run.
    assert.strictEqual(C.spreadAllowance(4, 99999, 1000), 4);
    // Monotonic: the allowance may never shrink as the scan advances.
    let prev = 0;
    for (let seen = 0; seen <= 2000; seen += 50) {
        const now = C.spreadAllowance(5, seen, 2000);
        assert.ok(now >= prev, `must not shrink at seen=${seen}`);
        prev = now;
    }
    // Degenerate inputs must not stall the scan.
    assert.strictEqual(C.spreadAllowance(3, 10, 0), 3);        // unmeasured post
    assert.strictEqual(C.spreadAllowance(0, 10, 100), 0);      // off stays off
});

test('spreadAllowance does not hold anything back on a short post', () => {
    // A feed post is one screenful: there is no "further down" to spread
    // across, and rationing it just means a post that could show two shows one.
    for (const words of [10, 60, 120, C.SPREAD_FROM_WORDS]) {
        assert.strictEqual(C.spreadAllowance(3, 0, words), 3, `${words} words, nothing scanned yet`);
        assert.strictEqual(C.spreadAllowance(3, 1, words), 3, `${words} words, one word in`);
    }
    // Just past the threshold rationing resumes.
    assert.strictEqual(C.spreadAllowance(3, 1, C.SPREAD_FROM_WORDS + 1), 1);
});

test('postCandidateCap leaves room for the context check to reject words', () => {
    // The scan replaces more than the cap on purpose; the cap is applied after
    // the verdicts come back. Without the slack, one bad verdict at casual
    // means the post ends up with no vocabulary in it at all.
    for (const level of C.INTENSITY_LEVELS) {
        for (const words of [10, 200, 500, 1500, 5000]) {
            assert.strictEqual(
                C.postCandidateCap(level, words),
                C.postWordCap(level, words) + C.CANDIDATE_SURPLUS,
                `${level} @ ${words}`);
        }
    }
    // Off stays off - there is nothing to over-provision for.
    assert.strictEqual(C.postCandidateCap(0, 500), 0);
});

test('pickSpread spreads the keepers across the post', () => {
    // Four candidates bunched at the top and one at the bottom: keeping two
    // must take one from each end, not the first two.
    assert.deepStrictEqual(C.pickSpread([0, 10, 20, 30, 900], 2), [0, 4]);
    // Evenly spaced input stays evenly spaced.
    assert.deepStrictEqual(C.pickSpread([0, 100, 200, 300, 400], 3), [0, 2, 4]);
    // One keeper is the first word the reader meets, not the middle.
    assert.deepStrictEqual(C.pickSpread([0, 50, 900], 1), [0]);
    // Asking for everything (or more) keeps everything, in order.
    assert.deepStrictEqual(C.pickSpread([5, 15, 25], 3), [0, 1, 2]);
    assert.deepStrictEqual(C.pickSpread([5, 15, 25], 9), [0, 1, 2]);
    assert.deepStrictEqual(C.pickSpread([], 3), []);
    assert.deepStrictEqual(C.pickSpread([1, 2, 3], 0), []);
    // Never returns a duplicate, whatever the clustering.
    for (const n of [1, 2, 3, 4]) {
        const picked = C.pickSpread([0, 0, 0, 0, 0, 0], n);
        assert.strictEqual(new Set(picked).size, picked.length, `n=${n} must be distinct`);
        assert.strictEqual(picked.length, n, `n=${n} must return n items`);
    }
});

test('a stored frequency of 0 still means off', () => {
    // The three-stop slider cannot produce 0, but installs from before the
    // change have it, and it meant "replace nothing" - it must keep meaning that.
    assert.strictEqual(C.postWordCap(0, 0), 0);
    assert.strictEqual(C.postWordCap(0, 500), 0);
    assert.strictEqual(C.postWordCap(0, 100000), 0);
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
