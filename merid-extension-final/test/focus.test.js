const { test } = require('node:test');
const assert = require('node:assert');
const F = require('../lib/focus.js');

/** A dataset of `n` throwaway headwords: w0, w1, ... */
function pool(n) {
    return Array.from({ length: n }, (_, i) => 'w' + i);
}

/** A deterministic rng: cycles through `seq`, so draws are reproducible. */
function seededRng(seq) {
    let i = 0;
    return () => seq[i++ % seq.length];
}

/** Build a list at `size` from a pool of `poolSize`, deterministically. */
function listOf(size, poolSize, opts) {
    return F.createList(size, 'c1', pool(poolSize),
        Object.assign({ rng: seededRng([0.1, 0.4, 0.7, 0.2, 0.9, 0.5]), now: 1000 }, opts));
}

/** Send the same event n times, threading the list through. */
function repeat(list, ev, n, p, opts) {
    let l = list;
    for (let i = 0; i < n; i++) l = F.applyEvents(l, [ev], p, opts);
    return l;
}

const words = l => l.words.map(e => e.w);

// ---------------------------------------------------------------------------
// Construction / hardening
// ---------------------------------------------------------------------------

test('createList draws exactly `size` distinct words from the pool', () => {
    const l = listOf(25, 200);
    assert.strictEqual(l.words.length, 25);
    assert.strictEqual(new Set(words(l)).size, 25);
    const p = new Set(pool(200));
    assert.ok(words(l).every(w => p.has(w)));
    assert.strictEqual(l.size, 25);
    assert.strictEqual(l.datasetKey, 'c1');
});

test('createList is deterministic under an injected rng', () => {
    assert.deepStrictEqual(words(listOf(10, 100)), words(listOf(10, 100)));
});

test('a pool smaller than the size yields the whole pool, not a hang', () => {
    const l = listOf(50, 8);
    assert.strictEqual(l.words.length, 8);
    assert.strictEqual(l.size, 50);
});

test('size 0 ("All") builds an empty list and rotates nothing', () => {
    const l = listOf(0, 100);
    assert.deepStrictEqual(l.words, []);
    const after = F.applyEvents(l, [{ word: 'w1', event: 'shown' }], pool(100));
    assert.deepStrictEqual(after.words, []);
});

test('withDefaults survives garbage without throwing', () => {
    for (const junk of [null, undefined, 0, '', 'nope', [], { words: 'no' }, { size: -4 }]) {
        const l = F.withDefaults(junk);
        assert.strictEqual(l.v, F.FOCUS_VERSION);
        assert.ok(Array.isArray(l.words));
        assert.ok(Array.isArray(l.retired));
        assert.ok(l.size >= 0);
    }
});

test('withDefaults drops duplicate and negative entries', () => {
    const l = F.withDefaults({
        size: 10, datasetKey: 'c1',
        words: [{ w: 'Alpha', shown: -3, acted: 'x' }, { w: 'alpha' }, { w: '' }, { w: 'beta', shown: 4 }]
    });
    assert.deepStrictEqual(words(l), ['alpha', 'beta']);
    assert.strictEqual(l.words[0].shown, 0);
    assert.strictEqual(l.words[0].acted, 0);
    assert.strictEqual(l.words[1].shown, 4);
});

// ---------------------------------------------------------------------------
// Size arithmetic
// ---------------------------------------------------------------------------

test('the ceiling is twice the base', () => {
    assert.strictEqual(F.maxSizeFor(25), 50);
    assert.strictEqual(F.maxSizeFor(100), 200);
    assert.strictEqual(F.maxSizeFor(200), 400);
});

test('clampSize floors at FOCUS_MIN, and reads "every word" as All', () => {
    assert.strictEqual(F.clampSize(3, 1379), F.FOCUS_MIN);
    assert.strictEqual(F.clampSize(137, 1379), 137);
    assert.strictEqual(F.clampSize(1379, 1379), F.FOCUS_ALL);
    assert.strictEqual(F.clampSize(99999, 1379), F.FOCUS_ALL);
    assert.strictEqual(F.clampSize(0, 1379), F.FOCUS_ALL);
    assert.strictEqual(F.clampSize('nope', 1379), F.FOCUS_ALL);
});

test('needsRebuild fires on a dataset change, not on a size change', () => {
    const l = listOf(25, 200);
    assert.strictEqual(F.needsRebuild(l, 25, 'c1'), false);
    assert.strictEqual(F.needsRebuild(l, 100, 'c1'), false);   // a resize, not a rebuild
    assert.strictEqual(F.needsRebuild(l, 25, 'c2'), true);
    assert.strictEqual(F.needsRebuild(null, 25, 'c1'), true);
});

// ---------------------------------------------------------------------------
// Retirement: shown more than five times with nothing back
// ---------------------------------------------------------------------------

test('a silent word survives five impressions and leaves on the sixth', () => {
    const p = pool(200);
    const l = listOf(25, 200);
    const target = words(l)[0];

    const five = repeat(l, { word: target, event: 'shown' }, 5, p, { now: 2000 });
    assert.ok(words(five).includes(target), 'must survive exactly five');
    assert.strictEqual(five.words.length, 25);

    const six = F.applyEvents(five, [{ word: target, event: 'shown' }], p, { now: 3000 });
    assert.ok(!words(six).includes(target), 'must leave on the sixth');
    assert.ok(six.retired.includes(target));
    assert.strictEqual(six.words.length, 25, 'and be replaced, so the list holds its size');
});

for (const ev of ['open', 'up', 'down', 'saved']) {
    test(`an "${ev}" immunises a word against retirement`, () => {
        const p = pool(200);
        const l = listOf(25, 200);
        const target = words(l)[0];
        let cur = F.applyEvents(l, [{ word: target, event: ev }], p);
        cur = repeat(cur, { word: target, event: 'shown' }, 20, p);
        assert.ok(words(cur).includes(target));
    });
}

test('interaction is credited before the silence test, within one batch', () => {
    const p = pool(200);
    const l = listOf(25, 200);
    const target = words(l)[0];
    // Five quiet impressions, then a batch that would tip it over - but the
    // reader opened the card in that same batch.
    const five = repeat(l, { word: target, event: 'shown' }, 5, p);
    const after = F.applyEvents(five, [
        { word: target, event: 'shown' },
        { word: target, event: 'open' }
    ], p);
    assert.ok(!words(after).includes(target),
        'shown lands first in this order, so it goes - order is the reader\'s, not ours');

    const other = F.applyEvents(five, [
        { word: target, event: 'open' },
        { word: target, event: 'shown' }
    ], p);
    assert.ok(words(other).includes(target), 'opened first: stays');
});

test('hover alone does not immunise - only a qualified open does', () => {
    const p = pool(200);
    const l = listOf(25, 200);
    const target = words(l)[0];
    let cur = F.applyEvents(l, [{ word: target, event: 'hover' }], p);
    cur = repeat(cur, { word: target, event: 'shown' }, 6, p);
    assert.ok(!words(cur).includes(target));
});

test('a retired word is not drawn again while the pool holds out', () => {
    const p = pool(60);
    let l = listOf(25, 60);
    const target = words(l)[0];
    l = repeat(l, { word: target, event: 'shown' }, 6, p);
    assert.ok(!words(l).includes(target));
    // Retire ten more, and confirm none of them ever comes back.
    for (let i = 0; i < 10; i++) {
        const next = words(l).find(w => !l.retired.includes(w));
        l = repeat(l, { word: next, event: 'shown' }, 6, p);
        assert.ok(!words(l).includes(next));
    }
    assert.strictEqual(l.retired.filter(w => words(l).includes(w)).length, 0);
});

test('when everything is retired the list recovers instead of starving', () => {
    const p = pool(30);
    let l = listOf(25, 30);
    // Grind every word down; with only 30 words and 25 slots the retired list
    // must be forgiven or the list would bleed out to nothing.
    for (let round = 0; round < 8; round++) {
        for (const w of words(l).slice()) {
            l = repeat(l, { word: w, event: 'shown' }, 6, p);
        }
    }
    assert.ok(l.words.length >= 20, 'kept a working list, got ' + l.words.length);
});

// ---------------------------------------------------------------------------
// The full-list loop: saving grows, learning frees
// ---------------------------------------------------------------------------

test('saved grows the list one word at a time and stops at the ceiling', () => {
    const p = pool(500);
    let l = listOf(25, 500);
    assert.strictEqual(F.isFull(l), false);

    for (let i = 0; i < 25; i++) {
        const before = l.words.length;
        l = F.applyEvents(l, [{ word: words(l)[i], event: 'saved' }], p);
        assert.strictEqual(l.words.length, before + 1);
    }
    assert.strictEqual(l.words.length, 50);
    assert.strictEqual(F.isFull(l), true);

    // Full: further saves keep the word but add nothing.
    const after = F.applyEvents(l, [{ word: words(l)[0], event: 'saved' }], p);
    assert.strictEqual(after.words.length, 50);
    assert.ok(words(after).includes(words(l)[0]), 'the saved word itself stays');
});

test('known above the base frees a slot; known at the base refills', () => {
    const p = pool(500);
    let l = listOf(25, 500);
    for (let i = 0; i < 25; i++) l = F.applyEvents(l, [{ word: words(l)[i], event: 'saved' }], p);
    assert.strictEqual(l.words.length, 50);

    // Above the base: learning a word must actually free the slot, or a full
    // list could never be cleared. This is the whole point of the design.
    l = F.applyEvents(l, [{ word: words(l)[0], event: 'known' }], p);
    assert.strictEqual(l.words.length, 49);
    assert.strictEqual(F.isFull(l), false);

    // Keep going down to the base.
    while (l.words.length > 25) l = F.applyEvents(l, [{ word: words(l)[0], event: 'known' }], p);
    assert.strictEqual(l.words.length, 25);

    // At the base: the working set tops itself back up.
    const target = words(l)[0];
    l = F.applyEvents(l, [{ word: target, event: 'known' }], p);
    assert.strictEqual(l.words.length, 25);
    assert.ok(!words(l).includes(target));
});

test('a learned word is never drawn back in', () => {
    const p = pool(60);
    let l = listOf(25, 60);
    const learned = new Set();
    for (let i = 0; i < 15; i++) {
        const target = words(l)[0];
        learned.add(target);
        l = F.applyEvents(l, [{ word: target, event: 'known' }], p, { known: learned });
    }
    assert.strictEqual(words(l).filter(w => learned.has(w)).length, 0);
});

test('known for a word outside the list changes nothing', () => {
    const p = pool(200);
    const l = listOf(25, 200);
    const after = F.applyEvents(l, [{ word: 'not-in-the-list', event: 'known' }], p);
    assert.deepStrictEqual(words(after), words(l));
});

// ---------------------------------------------------------------------------
// Resizing
// ---------------------------------------------------------------------------

test('growing keeps every word already in play', () => {
    const p = pool(500);
    const l = listOf(25, 500);
    const before = words(l);
    const grown = F.resize(l, 100, p, { rng: seededRng([0.3, 0.6]), now: 5000 });
    assert.strictEqual(grown.words.length, 100);
    assert.strictEqual(grown.size, 100);
    for (const w of before) assert.ok(words(grown).includes(w), w + ' was dropped');
});

test('shrinking keeps interacted-with words over silent ones', () => {
    const p = pool(500);
    let l = listOf(100, 500);
    // Ten the reader has engaged with.
    const kept = words(l).slice(0, 10);
    for (const w of kept) l = F.applyEvents(l, [{ word: w, event: 'up' }], p);

    const small = F.resize(l, 10, p, { now: 6000 });
    assert.strictEqual(small.words.length, 10);
    assert.deepStrictEqual(words(small).slice().sort(), kept.slice().sort());
});

test('raising the size while full clears the full state', () => {
    const p = pool(500);
    let l = listOf(25, 500);
    for (let i = 0; i < 25; i++) l = F.applyEvents(l, [{ word: words(l)[i], event: 'saved' }], p);
    assert.strictEqual(F.isFull(l), true);

    const bigger = F.resize(l, 50, p, { rng: seededRng([0.2, 0.8]), now: 7000 });
    assert.strictEqual(F.isFull(bigger), false, 'ceiling rose to 100, list holds 50');
    assert.strictEqual(bigger.words.length, 50);
});

test('resizing to All empties the list', () => {
    const l = F.resize(listOf(25, 200), 0, pool(200), { now: 8000 });
    assert.deepStrictEqual(l.words, []);
    assert.strictEqual(l.size, 0);
});

// ---------------------------------------------------------------------------
// Refill sources
// ---------------------------------------------------------------------------

test('refill never returns a word already held, known, or retired', () => {
    const p = pool(100);
    const l = F.withDefaults({
        size: 20, datasetKey: 'c1',
        words: [{ w: 'w0' }, { w: 'w1' }],
        retired: ['w2', 'w3']
    });
    const filled = F.refill(l, p, 20, { known: new Set(['w4', 'w5']), now: 9000 });
    assert.strictEqual(filled.words.length, 20);
    for (const banned of ['w2', 'w3', 'w4', 'w5']) {
        assert.strictEqual(words(filled).filter(w => w === banned).length, 0, banned + ' slipped in');
    }
    assert.strictEqual(new Set(words(filled)).size, 20, 'no duplicates');
});

test('refill reaches for due-for-review words first', () => {
    const p = pool(100);
    const l = F.withDefaults({ size: 5, datasetKey: 'c1', words: [] });
    const filled = F.refill(l, p, 5, { due: ['w90', 'w91'], now: 9000 });
    assert.ok(words(filled).includes('w90'));
    assert.ok(words(filled).includes('w91'));
    assert.strictEqual(filled.words.length, 5);
});

test('a due word that is known or retired is still refused', () => {
    const p = pool(100);
    const l = F.withDefaults({ size: 3, datasetKey: 'c1', words: [], retired: ['w90'] });
    const filled = F.refill(l, p, 3, { due: ['w90', 'w91'], known: new Set(['w91']), now: 9000 });
    assert.ok(!words(filled).includes('w90'));
    assert.ok(!words(filled).includes('w91'));
    assert.strictEqual(filled.words.length, 3);
});

// ---------------------------------------------------------------------------
// Settings-page edits
// ---------------------------------------------------------------------------

test('removeWord swaps a word out without claiming it is learned', () => {
    const p = pool(200);
    const l = listOf(25, 200);
    const target = words(l)[3];
    const after = F.removeWord(l, target, p, { now: 10000 });
    assert.ok(!words(after).includes(target));
    assert.ok(after.retired.includes(target));
    assert.strictEqual(after.words.length, 25, 'refilled back to base');
});

test('markLearned frees a slot above the base', () => {
    const p = pool(500);
    let l = listOf(25, 500);
    for (let i = 0; i < 5; i++) l = F.applyEvents(l, [{ word: words(l)[i], event: 'saved' }], p);
    assert.strictEqual(l.words.length, 30);
    const after = F.markLearned(l, words(l)[0], p, { now: 11000 });
    assert.strictEqual(after.words.length, 29);
});

test('addWord respects the ceiling, the pool, and duplicates', () => {
    const p = pool(500);
    let l = listOf(25, 500);
    const outside = pool(500).find(w => !words(l).includes(w));

    l = F.addWord(l, outside, p, { now: 12000 });
    assert.ok(words(l).includes(outside));
    assert.strictEqual(l.words.length, 26);

    const dup = F.addWord(l, outside, p, { now: 12000 });
    assert.strictEqual(dup.words.length, 26, 'a duplicate must not take a second slot');

    const absent = F.addWord(l, 'not-in-any-dataset', p, { now: 12000 });
    assert.strictEqual(absent.words.length, 26);

    let full = l;
    while (full.words.length < 50) {
        const next = pool(500).find(w => !words(full).includes(w));
        full = F.addWord(full, next, p, { now: 12000 });
    }
    assert.strictEqual(F.isFull(full), true);
    const over = F.addWord(full, pool(500).find(w => !words(full).includes(w)), p, { now: 12000 });
    assert.strictEqual(over.words.length, 50, 'the ceiling holds');
});

test('addWord forgives a retirement, so a word asked for can come back', () => {
    const p = pool(200);
    let l = listOf(25, 200);
    const target = words(l)[0];
    l = repeat(l, { word: target, event: 'shown' }, 6, p);
    assert.ok(l.retired.includes(target));
    l = F.addWord(l, target, p, { now: 13000 });
    assert.ok(words(l).includes(target));
    assert.ok(!l.retired.includes(target));
});

test('reshuffle redraws at the same size and dataset', () => {
    const p = pool(500);
    const l = listOf(25, 500);
    const fresh = F.reshuffle(l, p, { rng: seededRng([0.85, 0.15, 0.55]), now: 14000 });
    assert.strictEqual(fresh.words.length, 25);
    assert.strictEqual(fresh.size, 25);
    assert.strictEqual(fresh.datasetKey, 'c1');
    assert.notDeepStrictEqual(words(fresh), words(l));
});

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

test('wordSet is what the scan filters on', () => {
    const l = listOf(25, 200);
    const set = F.wordSet(l);
    assert.strictEqual(set.size, 25);
    assert.ok(set.has(words(l)[0]));
    assert.ok(!set.has('definitely-not-here'));
});

test('the retired list stays capped', () => {
    const l = F.withDefaults({
        size: 10, datasetKey: 'c1', words: [],
        retired: Array.from({ length: F.MAX_RETIRED + 500 }, (_, i) => 'r' + i)
    });
    assert.strictEqual(l.retired.length, F.MAX_RETIRED);
});

test('applyEvents never mutates the list it was given', () => {
    const p = pool(200);
    const l = listOf(25, 200);
    const snapshot = JSON.stringify(l);
    F.applyEvents(l, [{ word: words(l)[0], event: 'shown' }], p);
    F.applyEvents(l, [{ word: words(l)[0], event: 'known' }], p);
    assert.strictEqual(JSON.stringify(l), snapshot);
});

test('malformed events are ignored rather than throwing', () => {
    const p = pool(200);
    const l = listOf(25, 200);
    const after = F.applyEvents(l, [null, {}, { word: '' }, 'nope', { event: 'shown' }], p);
    assert.deepStrictEqual(words(after), words(l));
});
