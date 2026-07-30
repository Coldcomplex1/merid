const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../lib/profile.js');

const HOUR = 60 * 60 * 1000;

/** Apply the same event n times, threading the profile through. */
function repeat(profile, ev, n) {
    let p = profile;
    for (let i = 0; i < n; i++) p = P.recordEvent(p, ev);
    return p;
}

// ---------------------------------------------------------------------------
// Construction / hardening
// ---------------------------------------------------------------------------
test('createProfile is empty and neutral', () => {
    const p = P.createProfile();
    assert.strictEqual(p.events, 0);
    assert.deepStrictEqual(p.words, {});
    assert.strictEqual(p.weights.length, P.FEATURE_COUNT);
    assert.ok(p.weights.every(w => w === 0));
});

test('withDefaults survives garbage without throwing', () => {
    for (const junk of [null, undefined, 0, '', 'nope', [], { words: 'no' }, { weights: [1, 2] }]) {
        const p = P.withDefaults(junk);
        assert.strictEqual(p.v, P.PROFILE_VERSION);
        assert.strictEqual(p.weights.length, P.FEATURE_COUNT);
        assert.strictEqual(typeof p.words, 'object');
    }
});

test('withDefaults drops negative and non-numeric counters', () => {
    const p = P.withDefaults({ words: { foo: { shown: -5, up: 'x', down: 3 } } });
    assert.strictEqual(p.words.foo.shown, 0);
    assert.strictEqual(p.words.foo.up, 0);
    assert.strictEqual(p.words.foo.down, 3);
});

test('recordEvent does not mutate the input profile', () => {
    const before = P.createProfile();
    const after = P.recordEvent(before, { word: 'ubiquitous', event: 'up', level: 'C1' });
    assert.strictEqual(before.events, 0);
    assert.deepStrictEqual(before.words, {});
    assert.strictEqual(after.events, 1);
    assert.strictEqual(after.words.ubiquitous.up, 1);
});

test('recordEvent ignores unknown events and empty words', () => {
    const p = P.createProfile();
    assert.strictEqual(P.recordEvent(p, { word: 'x', event: 'explode' }).events, 0);
    assert.strictEqual(P.recordEvent(p, { word: '', event: 'up' }).events, 0);
    assert.strictEqual(P.recordEvent(p, {}).events, 0);
});

test('recordEvent lowercases the word key', () => {
    const p = P.recordEvent(P.createProfile(), { word: '  Ubiquitous ', event: 'up' });
    assert.strictEqual(p.words.ubiquitous.up, 1);
});

test('"shown" is tracked but is not treated as feedback evidence', () => {
    const p = P.recordEvent(P.createProfile(), { word: 'candid', event: 'shown' });
    assert.strictEqual(p.words.candid.shown, 1);
    assert.strictEqual(p.events, 0, 'exposure alone must not count as a feedback event');
});

// ---------------------------------------------------------------------------
// Cold start - the guardrail that keeps new users on v1.6 behaviour
// ---------------------------------------------------------------------------
test('an empty profile leaves frequency exactly unchanged', () => {
    const p = P.createProfile();
    assert.strictEqual(P.frequencyMultiplier(p, { word: 'anything' }), 1);
    assert.strictEqual(P.adjustedFrequency(p, { word: 'anything' }, 50), 50);
    assert.strictEqual(P.scoreCandidate(p, { word: 'anything' }), 0.5);
});

test('a handful of rejections cannot dominate the system', () => {
    let p = repeat(P.createProfile(), { word: 'obfuscate', event: 'down', level: 'C2' }, 3);
    const mult = P.frequencyMultiplier(p, { word: 'obfuscate', level: 'C2' });
    assert.ok(mult < 1, 'should lean down');
    assert.ok(mult > 0.75, `3 events must stay gentle, got ${mult}`);
    assert.ok(P.confidence(p) < 0.2);
});

test('confidence ramps to 1 and stays clamped', () => {
    const p = repeat(P.createProfile(), { word: 'w', event: 'up' }, P.COLD_START_EVENTS * 2);
    assert.strictEqual(P.confidence(p), 1);
});

// ---------------------------------------------------------------------------
// The core claim: the ranker actually learns from feedback
// ---------------------------------------------------------------------------
test('sustained positive feedback raises a word above a rejected one', () => {
    let p = P.createProfile();
    p = repeat(p, { word: 'candid', event: 'up', level: 'C1', topic: 'news' }, 15);
    p = repeat(p, { word: 'candid', event: 'saved', level: 'C1', topic: 'news' }, 5);
    p = repeat(p, { word: 'obfuscate', event: 'down', level: 'C2', topic: 'news' }, 15);
    p = repeat(p, { word: 'obfuscate', event: 'known', level: 'C2', topic: 'news' }, 5);

    const liked = P.scoreCandidate(p, { word: 'candid', level: 'C1', topic: 'news' });
    const disliked = P.scoreCandidate(p, { word: 'obfuscate', level: 'C2', topic: 'news' });
    assert.ok(liked > disliked, `liked ${liked} should beat disliked ${disliked}`);
    assert.ok(liked > 0.5, `liked word should score positive, got ${liked}`);
});

test('learned preference moves the effective frequency in both directions', () => {
    let p = P.createProfile();
    p = repeat(p, { word: 'candid', event: 'up', level: 'C1' }, 20);
    p = repeat(p, { word: 'obfuscate', event: 'down', level: 'C2' }, 20);

    const up = P.adjustedFrequency(p, { word: 'candid', level: 'C1' }, 50);
    const down = P.adjustedFrequency(p, { word: 'obfuscate', level: 'C2' }, 50);
    assert.ok(up > 50, `liked word should appear more often, got ${up}`);
    assert.ok(down < 50, `disliked word should appear less often, got ${down}`);
});

test('multiplier never leaves its bounds even under extreme feedback', () => {
    let p = P.createProfile();
    p = repeat(p, { word: 'x', event: 'up', level: 'C1', topic: 'tech' }, 500);
    const hi = P.frequencyMultiplier(p, { word: 'x', level: 'C1', topic: 'tech' });
    assert.ok(hi <= P.MAX_MULTIPLIER + 1e-9, `got ${hi}`);

    let q = P.createProfile();
    q = repeat(q, { word: 'y', event: 'down', level: 'C2', topic: 'tech' }, 500);
    const lo = P.frequencyMultiplier(q, { word: 'y', level: 'C2', topic: 'tech' });
    assert.ok(lo >= P.MIN_MULTIPLIER - 1e-9, `got ${lo}`);
    assert.ok(lo > 0, 'a disliked word must never be silenced completely');
});

test('adjustedFrequency respects the 0..100 contract of gateByFrequency', () => {
    let p = repeat(P.createProfile(), { word: 'x', event: 'up' }, 200);
    for (const base of [0, 1, 50, 99, 100]) {
        const f = P.adjustedFrequency(p, { word: 'x' }, base);
        assert.ok(f >= 0 && f <= 100, `base ${base} produced ${f}`);
    }
    assert.strictEqual(P.adjustedFrequency(p, { word: 'x' }, 0), 0, 'frequency 0 stays off');
});

test('"I know this" is a hard filter, not a preference', () => {
    const p = P.recordEvent(P.createProfile(), { word: 'ubiquitous', event: 'known' });
    assert.strictEqual(P.adjustedFrequency(p, { word: 'ubiquitous' }, 100), 0);
});

// ---------------------------------------------------------------------------
// Individual features
// ---------------------------------------------------------------------------
test('featureVector has a bias term and the declared width', () => {
    const x = P.featureVector(P.createProfile(), { word: 'w' });
    assert.strictEqual(x.length, P.FEATURE_COUNT);
    assert.strictEqual(x[0], 1);
    assert.ok(x.every(Number.isFinite));
});

test('every feature stays inside [-1, 1]', () => {
    let p = P.createProfile();
    p = repeat(p, { word: 'w', event: 'shown', level: 'C1', topic: 'tech' }, 300);
    p = repeat(p, { word: 'w', event: 'down', level: 'C1', topic: 'tech' }, 100);
    const x = P.featureVector(p, { word: 'w', level: 'C1', topic: 'tech' });
    x.forEach((v, i) => assert.ok(v >= -1 && v <= 1, `feature ${i} = ${v} out of range`));
});

test('recency damps a word shown moments ago and forgives an old one', () => {
    const now = 1000 * HOUR;
    const p = P.recordEvent(P.createProfile(), { word: 'w', event: 'shown', now });
    const fresh = P.featureVector(p, { word: 'w', now: now + 60 * 1000 })[6];
    const stale = P.featureVector(p, { word: 'w', now: now + 24 * HOUR })[6];
    assert.ok(fresh < -0.9, `just-shown should damp hard, got ${fresh}`);
    assert.strictEqual(stale, 0, 'outside the repeat window there is no penalty');
});

test('exposure fatigue accrues only while the user stays silent', () => {
    let silent = repeat(P.createProfile(), { word: 'w', event: 'shown' }, 12);
    assert.ok(P.featureVector(silent, { word: 'w' })[7] <= -1 + 1e-9);

    let engaged = repeat(P.createProfile(), { word: 'w', event: 'shown' }, 12);
    engaged = repeat(engaged, { word: 'w', event: 'hover' }, 12);
    assert.strictEqual(P.featureVector(engaged, { word: 'w' })[7], 0);
});

test('AI verdict history feeds the ranker as a free training label', () => {
    const good = repeat(P.createProfile(), { word: 'w', event: 'aiOk' }, 5);
    const bad = repeat(P.createProfile(), { word: 'w', event: 'aiBad' }, 5);
    assert.ok(P.featureVector(good, { word: 'w' })[2] > 0);
    assert.ok(P.featureVector(bad, { word: 'w' })[2] < 0);
});

test('level and topic affinity generalize to words never seen before', () => {
    let p = P.createProfile();
    p = repeat(p, { word: 'seen-word', event: 'up', level: 'C1', topic: 'business' }, 20);
    const x = P.featureVector(p, { word: 'brand-new-word', level: 'C1', topic: 'business' });
    assert.ok(x[4] > 0, 'level affinity should transfer');
    assert.ok(x[5] > 0, 'topic affinity should transfer');
});

// ---------------------------------------------------------------------------
// Topic derivation
// ---------------------------------------------------------------------------
test('topicFromUrl handles Vietnamese section slugs', () => {
    assert.strictEqual(P.topicFromUrl('https://vnexpress.net/kinh-doanh/abc'), 'business');
    assert.strictEqual(P.topicFromUrl('https://tuoitre.vn/cong-nghe/xyz'), 'tech');
    assert.strictEqual(P.topicFromUrl('https://vnexpress.net/khoa-hoc/z'), 'science');
    assert.strictEqual(P.topicFromUrl('https://x.vn/giao-duc/tuyen-sinh'), 'academic');
    assert.strictEqual(P.topicFromUrl('https://x.vn/giai-tri/phim'), 'casual');
});

test('topicFromUrl does not match keywords inside unrelated words', () => {
    // Regression: a raw `includes` matched "ai" inside "giai-tri" and "hoc"
    // inside "khoa-hoc", silently misfiling entertainment and science pages.
    assert.strictEqual(P.topicFromUrl('https://vnexpress.net/giai-tri/phim'), 'casual');
    assert.strictEqual(P.topicFromUrl('https://vnexpress.net/khoa-hoc/vu-tru'), 'science');
    assert.strictEqual(P.topicFromUrl('https://example.com/mosaic/aircraft'), 'general');
    assert.strictEqual(P.topicFromUrl('https://techcrunch.com/2026/01/post'), 'general');
    // ...but a real section slug still matches, including inside a longer slug.
    assert.strictEqual(P.topicFromUrl('https://example.com/ai/news'), 'tech');
    assert.strictEqual(P.topicFromUrl('https://x.vn/tin-tuc-kinh-doanh/abc'), 'business');
    assert.strictEqual(P.topicFromUrl('https://sohoa.vnexpress.net/x'), 'tech');
});

test('topicFromUrl falls back to general and never throws', () => {
    assert.strictEqual(P.topicFromUrl('https://example.com/'), 'general');
    assert.strictEqual(P.topicFromUrl(''), 'general');
    assert.strictEqual(P.topicFromUrl(null), 'general');
    assert.strictEqual(P.topicFromUrl(undefined), 'general');
});

// ---------------------------------------------------------------------------
// Size control - the profile is mirrored to Firestore (1 MiB doc limit)
// ---------------------------------------------------------------------------
test('pruning caps the table and keeps explicitly-rated words', () => {
    let p = P.createProfile();
    for (let i = 0; i < P.MAX_WORDS_TRACKED + 300; i++) {
        p = P.recordEvent(p, { word: 'filler' + i, event: 'shown', now: i });
    }
    p = P.recordEvent(p, { word: 'precious', event: 'up' });
    for (let i = 0; i < 400; i++) {
        p = P.recordEvent(p, { word: 'more' + i, event: 'shown', now: 1e6 + i });
    }
    assert.ok(Object.keys(p.words).length <= P.MAX_WORDS_TRACKED);
    assert.ok(p.words.precious, 'a word with explicit feedback must survive pruning');
});

// ---------------------------------------------------------------------------
// Prompt summary - billed on every AI request, so it must stay small and safe
// ---------------------------------------------------------------------------
test('describeProfile says nothing for a new user', () => {
    assert.strictEqual(P.describeProfile(P.createProfile()), '');
});

test('describeProfile reports level, topics and rejected words', () => {
    let p = P.createProfile();
    p = repeat(p, { word: 'candid', event: 'up', level: 'C1', topic: 'business' }, 6);
    p = repeat(p, { word: 'obfuscate', event: 'down', level: 'C2', topic: 'business' }, 6);
    const s = P.describeProfile(p);
    assert.match(s, /prefers C1-level words/);
    assert.match(s, /business/);
    assert.match(s, /has rejected: .*obfuscate/);
    assert.ok(!s.includes('candid'), 'liked words are not listed as rejected');
});

test('describeProfile stays compact under a heavy profile', () => {
    let p = P.createProfile();
    for (let i = 0; i < 300; i++) {
        p = P.recordEvent(p, { word: 'bad' + i, event: 'down', level: 'C2', topic: 'tech' });
    }
    const s = P.describeProfile(p);
    assert.ok(s.length < 400, `prompt block must stay small, got ${s.length} chars`);
});

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
test('sigmoid is stable at extremes', () => {
    assert.strictEqual(P.sigmoid(0), 0.5);
    assert.ok(P.sigmoid(1000) <= 1 && P.sigmoid(1000) > 0.999);
    assert.ok(P.sigmoid(-1000) >= 0 && P.sigmoid(-1000) < 0.001);
    assert.ok(Number.isFinite(P.sigmoid(-1e6)));
});

test('trainStep moves the prediction toward the target and stays bounded', () => {
    const w = new Array(P.FEATURE_COUNT).fill(0);
    const x = [1, 1, 0, 0, 0, 0, 0, 0];
    const before = P.sigmoid(P.dot(w, x));
    for (let i = 0; i < 50; i++) P.trainStep(w, x, 1, 1);
    const after = P.sigmoid(P.dot(w, x));
    assert.ok(after > before);
    assert.ok(w.every(v => v >= -4 && v <= 4), 'weights must stay clamped');
});
