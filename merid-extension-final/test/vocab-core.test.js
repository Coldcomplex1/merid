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
// Phrases longer than two syllables
//
// The matcher used to walk fixed token windows [3,2,1], and since `tokenize`
// emits whitespace as its own token that is two words at most - so every
// Vietnamese key of three syllables or more in the shipped datasets was
// unreachable, and the scanner fell through to the bare syllable instead.
// ---------------------------------------------------------------------------
const PHRASE_VOCAB = [
    { word: 'letter', vietnamese: 'thư' },
    { word: 'secretary', vietnamese: 'thư ký' },
    { word: 'infrastructure', vietnamese: 'cơ sở hạ tầng' },              // 4 syllables
    { word: 'upgrade', vietnamese: 'nâng cấp quan hệ' },                  // 3 syllables
    { word: 'relation', vietnamese: 'quan hệ' },                          // prefix collision
    { word: 'comprehensive', vietnamese: 'toàn diện' },
    { word: 'premises', vietnamese: 'sở' }                                // a syllable of "cơ sở hạ tầng"
];

test('findMatch reaches three- and four-syllable Vietnamese phrases', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, 'vieEng');

    const four = C.tokenize('Đầu tư cơ sở hạ tầng là ưu tiên.');
    const m4 = C.findMatch(four, four.indexOf('cơ'), map, {});
    assert.strictEqual(m4.key, 'cơ sở hạ tầng');
    assert.strictEqual(m4.matchedText, 'cơ sở hạ tầng');

    const three = C.tokenize('Hai nước nâng cấp quan hệ trong năm nay.');
    const m3 = C.findMatch(three, three.indexOf('nâng'), map, {});
    assert.strictEqual(m3.key, 'nâng cấp quan hệ');
});

test('findMatch prefers the longest phrase over a shorter key inside it', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, 'vieEng');
    const toks = C.tokenize('Hai nước nâng cấp quan hệ.');
    // "quan hệ" is a key in its own right, but the longer phrase starts earlier
    // and must win from its own start index.
    const m = C.findMatch(toks, toks.indexOf('nâng'), map, {});
    assert.strictEqual(m.key, 'nâng cấp quan hệ');
    // …and the caller advancing past it lands after "hệ".
    assert.strictEqual(toks.slice(toks.indexOf('nâng'), toks.indexOf('nâng') + m.size).join(''),
        'nâng cấp quan hệ');
});

test('a phrase never spans punctuation', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, 'vieEng');
    // Without the punctuation guard "quan hệ" would be assembled across the comma.
    const toks = C.tokenize('Về quan, hệ hai nước.');
    const m = C.findMatch(toks, toks.indexOf('quan'), map, {});
    assert.strictEqual(m, null);

    const ok = C.tokenize('Về quan hệ hai nước.');
    assert.strictEqual(C.findMatch(ok, ok.indexOf('quan'), map, {}).key, 'quan hệ');
});

test('phraseWindowSizes is longest-first and stops at punctuation', () => {
    const toks = C.tokenize('một hai ba, bốn');
    assert.deepStrictEqual(C.phraseWindowSizes(toks, 0), [5, 3, 1]); // "một hai ba"
});

// ---------------------------------------------------------------------------
// Bare-syllable guard
// ---------------------------------------------------------------------------
test('a bare syllable under a capitalised title is skipped', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, 'vieEng');
    const toks = C.tokenize('Đây là lần đầu tiên Tổng Bí thư, Chủ tịch nước Tô Lâm tới Australia.');
    const idx = toks.indexOf('thư');
    // The reported bug: "thư" of "Tổng Bí thư" was being swapped for "letter".
    assert.ok(C.findMatch(toks, idx, map, {}), 'unguarded, it still matches');
    assert.strictEqual(C.findMatch(toks, idx, map, { guardBareSyllables: true }), null);
});

test('the guard does not fire on a plain lowercase syllable', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, 'vieEng');
    const toks = C.tokenize('Tôi gửi một thư cho bạn.');
    const m = C.findMatch(toks, toks.indexOf('thư'), map, { guardBareSyllables: true });
    assert.strictEqual(m.key, 'thư');
});

test('the guard ignores a sentence-opening capital', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, 'vieEng');
    // "Anh" opens the sentence, so its capital is grammar, not a name.
    const toks = C.tokenize('Anh thư của tôi.');
    const m = C.findMatch(toks, toks.indexOf('thư'), map, { guardBareSyllables: true });
    assert.strictEqual(m.key, 'thư');
});

test('the guard skips a syllable that forms a known compound with its neighbour', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, 'vieEng');
    // "cơ sở" is not a key of its own, but it is a compound the map learned from
    // "cơ sở hạ tầng" - so the bare "sở" in it must not be swapped for "premises".
    assert.ok(map.compoundBigrams.has('cơ sở'));
    assert.ok(!map.has('cơ sở'));
    const toks = C.tokenize('xây một cơ sở mới');
    assert.strictEqual(C.findMatch(toks, toks.indexOf('sở'), map, { guardBareSyllables: true }), null);
    // Standing alone it is still a word.
    const alone = C.tokenize('đến sở làm');
    assert.strictEqual(C.findMatch(alone, alone.indexOf('sở'), map, { guardBareSyllables: true }).key, 'sở');
});

test('a longer phrase still wins over the guard', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, 'vieEng');
    // "thư ký" is a key, so the phrase matches and the guard never applies -
    // the guard only decides what to do when nothing longer fits.
    const toks = C.tokenize('làm thư ký cho công ty');
    const m = C.findMatch(toks, toks.indexOf('thư'), map, { guardBareSyllables: true });
    assert.strictEqual(m.key, 'thư ký');
});

test('buildVocabMap learns compound bigrams from multi-syllable Vietnamese keys only', () => {
    const map = C.buildVocabMap(PHRASE_VOCAB, ['vieEng', 'engEng']);
    assert.ok(map.compoundBigrams.has('cơ sở'));
    assert.ok(map.compoundBigrams.has('hạ tầng'));
    assert.ok(map.compoundBigrams.has('toàn diện'));
    // Seeded titles the datasets do not carry.
    assert.ok(map.compoundBigrams.has('bí thư'));
    // English synonyms are not Vietnamese compounds.
    assert.ok(!map.compoundBigrams.has('carry out'));
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
    assert.strictEqual(s.datasetKey, C.DEFAULT_DATASET_KEY);
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

test('dataset registry resolves files and tags, falling back to the default', () => {
    assert.deepStrictEqual(C.getDatasetFiles('c2'), ['dataset-C2.csv']);
    assert.strictEqual(C.getDatasetFiles('all').length, 3);
    assert.deepStrictEqual(C.getDatasetFiles('nonsense'),
        C.DATASET_REGISTRY[C.DEFAULT_DATASET_KEY].files);
    assert.strictEqual(C.datasetTagFor('c1'), 'C1');
    // The default has to name a real bundled dataset, never a custom key.
    assert.ok(C.DATASET_REGISTRY[C.DEFAULT_DATASET_KEY]);
    assert.strictEqual(C.isCustomKey(C.DEFAULT_DATASET_KEY), false);
});

test('"All" keeps SAT first so shared headwords resolve the same as before', () => {
    // Duplicate headwords keep the FIRST row, so this order is behaviour, not
    // presentation - it must not follow the registry's display order.
    assert.deepStrictEqual(C.getDatasetFiles('all'),
        ['dataset-SAT.csv', 'dataset-C1.csv', 'dataset-C2.csv']);
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

// A DM thread on Facebook is served from the same host as the feed, so the
// host lists cannot tell them apart and the path has to.
test('direct messages are blocked by path, on sites that stay scannable', () => {
    const blocked = [
        'https://www.facebook.com/messages/t/1234',
        'https://facebook.com/messages',
        'https://facebook.com/messages/',            // trailing slash, same page
        'https://m.facebook.com/messages/read/?fbid=1',
        'https://facebook.com/e2ee/t/999',           // encrypted thread
        'https://facebook.com/marketplace/inbox',
        'https://www.instagram.com/direct/inbox/',
        'https://x.com/messages/123',
        'https://twitter.com/messages',
        'https://www.linkedin.com/messaging/thread/2',
        'https://www.tiktok.com/messages?lang=vi',
        'https://www.reddit.com/chat/room/9'
    ];
    for (const url of blocked) assert.strictEqual(C.isUrlBlocked(url), true, url);

    // The site itself keeps working - that is the whole reason for this list.
    const allowed = [
        'https://facebook.com/',
        'https://www.facebook.com/groups/hoctienganh',
        'https://facebook.com/messagesomething',     // boundary, not a prefix
        'https://instagram.com/nasa',
        'https://x.com/elonmusk',
        'https://www.linkedin.com/feed/',
        'https://www.reddit.com/r/vietnam',
        'https://vnexpress.net/messages',            // path rule is per host
        'https://facebook.com.evil.test/messages'    // lookalike host
    ];
    for (const url of allowed) assert.strictEqual(C.isUrlBlocked(url), false, url);

    for (const url of ['chrome://extensions/', 'about:blank', 'not a url', '', null, undefined]) {
        assert.strictEqual(C.isUrlBlocked(url), false, String(url));
    }
    for (const host of Object.keys(C.BLOCKED_PATHS)) {
        assert.strictEqual(C.isHostBlocked(host), false,
            `${host} must stay scannable - only its message paths are blocked`);
    }
});

test('dedicated chat hosts are blocked outright', () => {
    for (const host of ['messenger.com', 'm.me', 'chat.reddit.com', 'chat.zalo.me',
        'web.whatsapp.com', 'web.telegram.org', 'voice.google.com', 'messages.android.com']) {
        assert.strictEqual(C.isHostBlocked(host), true, host);
    }
    // ...without taking the site those chats hang off with them.
    assert.strictEqual(C.isHostBlocked('reddit.com'), false);
    assert.strictEqual(C.isHostBlocked('google.com'), false);
});

test('chat surfaces are named per host, for the windows a path cannot reach', () => {
    // A chat popup has no URL of its own, so the label it carries is the only
    // thing left to recognise it by - in either language the reader has set.
    for (const host of ['facebook.com', 'www.facebook.com', 'instagram.com', 'x.com', 'linkedin.com']) {
        const sel = C.chatSurfaceSelector(host);
        assert.ok(sel.includes('[role="dialog"]'), host);
        assert.ok(sel.includes('tin nhắn'), `${host} must know the Vietnamese label`);
        assert.ok(sel.includes('chat'), host);
    }
    assert.ok(C.chatSurfaceSelector('x.com').includes('DMDrawer'));
    assert.ok(C.chatSurfaceSelector('www.twitter.com').includes('DMDrawer'));
    assert.ok(C.chatSurfaceSelector('linkedin.com').includes('msg-overlay'));
    // Every selector has to be one a browser will actually accept.
    for (const host of Object.keys(C.CHAT_SURFACE_SELECTORS)) {
        assert.doesNotThrow(() => new RegExp(''),
            `${host}: selector is only exercised in the DOM, keep it syntactically simple`);
        assert.ok(C.chatSurfaceSelector(host).length > 0, host);
    }
    // Sites with no chat of their own are left entirely alone.
    assert.strictEqual(C.chatSurfaceSelector('vnexpress.net'), '');
    assert.strictEqual(C.chatSurfaceSelector(''), '');
});

test('withDefaults supplies an empty disabledSites list', () => {
    assert.deepStrictEqual(C.withDefaults({}).disabledSites, []);
    assert.deepStrictEqual(C.withDefaults({ disabledSites: ['a.com'] }).disabledSites, ['a.com']);
});

test('withDefaults supplies an empty allowedSites list', () => {
    assert.deepStrictEqual(C.withDefaults({}).allowedSites, []);
    assert.deepStrictEqual(C.withDefaults({ allowedSites: ['a.com'] }).allowedSites, ['a.com']);
});

// ---------------------------------------------------------------------------
// Built-in site lists
// ---------------------------------------------------------------------------

// The three tests below guard the lists themselves rather than the matcher.
// A bad entry pasted into either list is otherwise a silent production bug:
// it either never matches or quietly takes out half the web.

test('built-in host entries are stored in canonical form', () => {
    const all = C.BUILTIN_BLOCKED_HOSTS.concat(C.DEFAULT_OFF_HOSTS);
    for (const h of all) {
        assert.strictEqual(h, C.canonicalHost(h), `${h} is not canonical`);
        // A leading dot compares against host.endsWith('..gov') and never hits;
        // schemes, paths and globs never match a hostname at all.
        assert.ok(!/^[.*]|[/:*\s]/.test(h), `${h} is not a bare hostname`);
    }
});

test('the two built-in lists do not overlap and hold no duplicates', () => {
    const hard = C.BUILTIN_BLOCKED_HOSTS;
    const soft = C.DEFAULT_OFF_HOSTS;
    assert.strictEqual(new Set(hard).size, hard.length, 'duplicate in the blocked list');
    assert.strictEqual(new Set(soft).size, soft.length, 'duplicate in the default-off list');
    const both = hard.filter(h => soft.indexOf(h) !== -1);
    assert.deepStrictEqual(both, [], 'a host cannot be in both tiers');
    // Every category is labelled for the options page.
    for (const key of Object.keys(C.BLOCKED_BY_CATEGORY)) {
        assert.ok(C.SITE_CATEGORY_LABELS[key], `no label for ${key}`);
    }
    for (const key of Object.keys(C.DEFAULT_OFF_BY_CATEGORY)) {
        assert.ok(C.SITE_CATEGORY_LABELS[key], `no label for ${key}`);
    }
});

test('no built-in entry swallows a host Merid should still read', () => {
    // An apex entry covers every subdomain, so 'google.com' in either list
    // would silently take out Search, News, Books and Scholar with it.
    const keep = ['google.com', 'microsoft.com', 'apple.com', 'yahoo.com',
        'qq.com', 'github.com', 'gitlab.com', 'dropbox.com', 'edu', 'com',
        'vnexpress.net', 'tuoitre.vn', 'bbc.com', 'wikipedia.org', 'medium.com',
        'reddit.com', 'nytimes.com'];
    for (const h of keep) {
        assert.strictEqual(C.isSiteDisabled(h, [], []), false, `${h} must stay on`);
    }
});

test('private sites are off no matter what the user lists say', () => {
    const hard = ['mail.google.com', 'messenger.com', 'accounts.google.com',
        'paypal.com', 'vietcombank.com.vn', 'proctorio.com', 'irs.gov'];
    for (const h of hard) {
        assert.strictEqual(C.isHostBlocked(h), true, `${h} should be blocked`);
        // An allow entry cannot lift a built-in block.
        assert.strictEqual(C.isSiteDisabled(h, [], [h]), true);
        // and it holds across subdomains
        assert.strictEqual(C.isSiteDisabled('secure.' + h, [], [h]), true);
        // ...but only at a label boundary
        assert.strictEqual(C.isHostBlocked('not' + h), false, `not${h} is a different site`);
    }
});

test('default-off sites ship off and can be turned back on per host', () => {
    assert.strictEqual(C.isSiteDisabled('docs.google.com', [], []), true);
    assert.strictEqual(C.isSiteDisabled('docs.google.com', [], ['docs.google.com']), false);
    // Allowing one host does not allow its whole category.
    assert.strictEqual(C.isSiteDisabled('drive.google.com', [], ['docs.google.com']), true);
    // Both sides are canonicalized before comparing.
    assert.strictEqual(C.isSiteDisabled('WWW.DeepL.com', [], ['deepl.com']), false);
    assert.strictEqual(C.isHostDefaultOff('quizlet.com'), true);
    assert.strictEqual(C.isHostDefaultOff('mail.google.com'), false);
    assert.strictEqual(C.isHostBlocked('docs.google.com'), false);
});

test('an explicit pause beats a stale allow entry', () => {
    assert.strictEqual(
        C.isSiteDisabled('docs.google.com', ['docs.google.com'], ['docs.google.com']), true);
});

test('TLD-level entries cover every label under them, at a boundary', () => {
    // Government sites are default-off, not blocked: nasa.gov and nih.gov are
    // some of the best free English reading there is, and a reader who wants
    // them can say so.
    assert.strictEqual(C.isSiteDisabled('nasa.gov', [], []), true);
    assert.strictEqual(C.isSiteDisabled('nasa.gov', [], ['nasa.gov']), false);
    assert.strictEqual(C.isSiteDisabled('dichvucong.gov.vn', [], []), true);
    // ...while the named tax/benefits/identity services stay hard-blocked even
    // though the gov TLD around them is only default-off.
    assert.strictEqual(C.isHostBlocked('irs.gov'), true);
    assert.strictEqual(C.isHostBlocked('nasa.gov'), false);
    assert.strictEqual(C.isSiteDisabled('dichvucong.gov.vn', [], ['dichvucong.gov.vn']), true);
    // Label boundary, same rule as the pause list.
    assert.strictEqual(C.isSiteDisabled('notgov', [], []), false);
    assert.strictEqual(C.isSiteDisabled('gov.example.com', [], []), false);
});

test('siteToggleState names the four states the popup renders', () => {
    assert.strictEqual(C.siteToggleState('mail.google.com', [], []), 'blocked');
    assert.strictEqual(C.siteToggleState('vnexpress.net', ['vnexpress.net'], []), 'paused');
    assert.strictEqual(C.siteToggleState('docs.google.com', [], []), 'default-off');
    assert.strictEqual(C.siteToggleState('docs.google.com', [], ['docs.google.com']), 'on');
    assert.strictEqual(C.siteToggleState('vnexpress.net', [], []), 'on');
});

test('addSiteToList canonicalizes, dedupes and caps', () => {
    assert.deepStrictEqual(C.addSiteToList([], 'WWW.A.com'), ['a.com']);
    assert.deepStrictEqual(C.addSiteToList(['a.com'], 'a.com'), ['a.com']);
    assert.deepStrictEqual(C.addSiteToList(['a.com'], 'www.a.com'), ['a.com']);
    assert.deepStrictEqual(C.addSiteToList(['a.com'], ''), ['a.com']);
    assert.deepStrictEqual(C.addSiteToList(undefined, 'a.com'), ['a.com']);
    const full = Array.from({ length: C.MAX_SITE_LIST }, (_, i) => `s${i}.com`);
    assert.strictEqual(C.addSiteToList(full, 'one-too-many.com').length, C.MAX_SITE_LIST);
    // the input is never mutated
    const before = ['a.com'];
    C.addSiteToList(before, 'b.com');
    assert.deepStrictEqual(before, ['a.com']);
});

test('removeSiteFromList drops every entry covering the host', () => {
    assert.deepStrictEqual(C.removeSiteFromList(['a.com', 'b.com'], 'a.com'), ['b.com']);
    // an apex entry covers the subdomain, so removing it re-enables all of them
    assert.deepStrictEqual(C.removeSiteFromList(['a.com'], 'news.a.com'), []);
    assert.deepStrictEqual(C.removeSiteFromList(['a.com'], 'nota.com'), ['a.com']);
    assert.deepStrictEqual(C.removeSiteFromList([], 'a.com'), []);
    const before = ['a.com'];
    C.removeSiteFromList(before, 'a.com');
    assert.deepStrictEqual(before, ['a.com']);
});

test('the two-argument isSiteDisabled call still fails safe', () => {
    // popup/content pass three arguments now, but anything that predates
    // allowedSites should leave a default-off site off rather than on.
    assert.strictEqual(C.isSiteDisabled('docs.google.com', []), true);
    assert.strictEqual(C.isSiteDisabled('vnexpress.net', []), false);
});

// ---------------------------------------------------------------------------
// Case matching
//
// The datasets store every headword lower case, so without this a word landing
// where "Khó" or "KHÓ KHĂN" stood arrives as "difficult" and announces itself
// as a substitution - worst in headlines, which is where whole-caps text lives.
// ---------------------------------------------------------------------------
test('matchCase copies the capitalisation of the word it replaces', () => {
    assert.strictEqual(C.matchCase('khó', 'difficult'), 'difficult');
    assert.strictEqual(C.matchCase('Khó', 'difficult'), 'Difficult');
    assert.strictEqual(C.matchCase('KHÓ', 'difficult'), 'DIFFICULT');
});

test('matchCase keeps Vietnamese diacritics out of the decision and the result', () => {
    // /[A-Z]/ sees no letter at all in "Ở" or "ĐẸP"; \p{Lu} does. Getting this
    // wrong leaves every accented word lower case.
    assert.strictEqual(C.matchCase('Ở', 'at'), 'At');
    assert.strictEqual(C.matchCase('ở', 'at'), 'at');
    assert.strictEqual(C.matchCase('ĐẸP', 'beautiful'), 'BEAUTIFUL');
    assert.strictEqual(C.matchCase('Đẹp', 'beautiful'), 'Beautiful');
    assert.strictEqual(C.matchCase('đẹp', 'beautiful'), 'beautiful');
});

test('matchCase reads a multi-word phrase by its first letter, not its shape', () => {
    // A title-cased phrase is capitalised, not shouted.
    assert.strictEqual(C.matchCase('Tổng Bí thư', 'leader'), 'Leader');
    assert.strictEqual(C.matchCase('KHÓ KHĂN', 'difficult'), 'DIFFICULT');
});

test('matchCase leaves the replacement alone when there is no case to copy', () => {
    assert.strictEqual(C.matchCase('123', 'x'), 'x');
    assert.strictEqual(C.matchCase('', 'word'), 'word');
    assert.strictEqual(C.matchCase('khó', ''), '');
});

// ---------------------------------------------------------------------------
// Sentence position
//
// The half `matchCase` cannot reach. It copies what the Vietnamese was wearing,
// so a sentence the writer opened in lower case - most of an informal feed -
// got a lower-case English word standing at the front of it.
// ---------------------------------------------------------------------------
test('opensSentence: a full stop before the word opens a sentence', () => {
    assert.strictEqual(C.opensSentence('Anh nói vậy. '), true);
    assert.strictEqual(C.opensSentence('Thật không! '), true);
    assert.strictEqual(C.opensSentence('Ai biết được? '), true);
    assert.strictEqual(C.opensSentence('rồi thì… '), true);
});

test('opensSentence: nothing before the word means it opens its block', () => {
    assert.strictEqual(C.opensSentence(''), true);
    assert.strictEqual(C.opensSentence('   '), true);
    assert.strictEqual(C.opensSentence(undefined), true);
});

test('opensSentence: quotes and brackets are stepped over, not counted', () => {
    // The stop is still what decides; the bracket only leads into the sentence.
    assert.strictEqual(C.opensSentence('Anh nói vậy. "'), true);
    assert.strictEqual(C.opensSentence('Anh nói vậy. ('), true);
    assert.strictEqual(C.opensSentence('“'), true);
    // ...and a bracket with ordinary prose behind it opens nothing.
    assert.strictEqual(C.opensSentence('văn hóa ('), false);
});

test('opensSentence: mid-sentence punctuation does not open one', () => {
    assert.strictEqual(C.opensSentence('nhưng '), false);
    assert.strictEqual(C.opensSentence('Anh nói: '), false);
    assert.strictEqual(C.opensSentence('một là thế này; '), false);
    assert.strictEqual(C.opensSentence('trong đó, '), false);
    assert.strictEqual(C.opensSentence('gồm hai phần - '), false);
    // A date is not a sentence: what precedes the space is a digit, not a stop.
    assert.strictEqual(C.opensSentence('Ngày 20.8 '), false);
});

test('capitalizeFirst raises the first letter and leaves the rest alone', () => {
    assert.strictEqual(C.capitalizeFirst('difficult'), 'Difficult');
    assert.strictEqual(C.capitalizeFirst('in spite of'), 'In spite of');
    assert.strictEqual(C.capitalizeFirst('Difficult'), 'Difficult');
    assert.strictEqual(C.capitalizeFirst('DIFFICULT'), 'DIFFICULT');
    assert.strictEqual(C.capitalizeFirst(''), '');
    assert.strictEqual(C.capitalizeFirst(null), '');
});

test('capitalizeFirst keeps Vietnamese tone marks on the letter it raises', () => {
    assert.strictEqual(C.capitalizeFirst('ở'), 'Ở');
    assert.strictEqual(C.capitalizeFirst('đẹp'), 'Đẹp');
});

test('a sentence-opening word is capitalised whatever case it replaced', () => {
    // The two rules compose: copy what the source wore, then raise the first
    // letter if the word is standing at the front of a sentence.
    assert.strictEqual(C.capitalizeFirst(C.matchCase('khó', 'difficult')), 'Difficult');
    assert.strictEqual(C.capitalizeFirst(C.matchCase('Khó', 'difficult')), 'Difficult');
    assert.strictEqual(C.capitalizeFirst(C.matchCase('KHÓ KHĂN', 'difficult')), 'DIFFICULT');
});
