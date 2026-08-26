/**
 * focus.js - the focus list: the small, rotating set of words Merid is working
 * on with this reader right now.
 *
 * Merid used to scan every page against the whole dataset - 1,379 words at C1,
 * ~3,300 at "All" - so which words a reader actually met was decided by
 * whatever Vietnamese happened to be on the page. Meeting the same word twice
 * in a week was luck. The focus list replaces that with a deliberate working
 * set: N words drawn at random, and nothing outside them is ever swapped in.
 *
 * The list is not static. It watches what the reader does with each word and
 * rotates itself:
 *
 *   - shown more than SHOWN_LIMIT times with no interaction at all -> the word
 *     is not landing; retire it and draw another.
 *   - "Save to Deck" -> the reader wants this one; keep it AND add a new word,
 *     up to a ceiling of twice the base size.
 *   - "I know this" -> drop it, and refill only back down to the BASE size.
 *
 * That last asymmetry is the whole design. Saving pushes the list up towards
 * the ceiling; marking words learned pulls it back down. If learning a word
 * immediately pulled a new one in, marking words learned would free nothing and
 * a full list could never be emptied. Above the base is overflow to be cleared;
 * at or below it is the steady working set that keeps itself topped up.
 *
 * Loaded two ways (same pattern as vocab-core.js and profile.js):
 *   - As a script in the service worker / options page, attaching to
 *     `globalThis.VMFocus`.
 *   - As a CommonJS module in `node --test` (`require('../lib/focus.js')`).
 *
 * Keep this file free of `chrome.*`, `window`, `document` and any network use.
 * All persistence is the caller's job - this module only transforms plain data,
 * which is what lets the whole rotation policy be unit-tested directly.
 *
 * @typedef {Object} FocusEntry
 * @property {string} w        Lowercased English headword.
 * @property {number} shown    Impressions since this word joined the list.
 * @property {number} acted    Deliberate interactions since it joined.
 * @property {number} addedAt  Epoch ms it joined.
 *
 * @typedef {Object} FocusList
 * @property {number} v
 * @property {string} datasetKey  Which dataset the words were drawn from.
 * @property {number} size        Base size; the ceiling is twice this.
 * @property {FocusEntry[]} words
 * @property {string[]} retired   Retired for silence; not redrawn while the pool holds out.
 * @property {number} updatedAt
 */

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;      // Node / tests
    } else {
        root.VMFocus = api;        // service worker / options page
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const FOCUS_VERSION = 1;

    /** The sizes the two UIs offer as one-click buttons. Any integer works. */
    const FOCUS_PRESETS = [25, 50, 100, 200];

    /** "All" - no focus list at all, which is how Merid behaved before this. */
    const FOCUS_ALL = 0;

    /**
     * Floor for a typed size. Below ten words a reader would go whole articles
     * without meeting one, which reads as a broken extension rather than a
     * focused one.
     */
    const FOCUS_MIN = 10;

    /**
     * How many times a word may be put in front of the reader before silence
     * counts as an answer. Five is enough to be sure they saw it and chose not
     * to look - it survives a couple of impressions they scrolled past.
     */
    const SHOWN_LIMIT = 5;

    /**
     * How many retired words to remember. Retirement is what stops a word the
     * reader has already ignored five times from being drawn again next week;
     * without a cap the list would grow without bound in storage.
     */
    const MAX_RETIRED = 1000;

    /**
     * Events that count as the reader deliberately engaging with a word.
     *
     * `hover` is deliberately absent. It fires the moment the card opens, which
     * a pointer crossing the word on its way somewhere else does by accident -
     * and immunising a word against retirement is exactly what a mouse passing
     * over it should not buy. `open` is the qualified signal: the content
     * script emits it only on a click inside the card or a hover held long
     * enough to be reading.
     *
     * `aiOk`/`aiBad` are absent for a different reason: they are the context
     * check's opinion, not the reader's.
     */
    const INTERACTION_EVENTS = ['open', 'up', 'down', 'saved', 'known'];

    // -----------------------------------------------------------------
    // Construction / coercion
    // -----------------------------------------------------------------

    function emptyEntry(word, now) {
        return { w: String(word || '').toLowerCase().trim(), shown: 0, acted: 0, addedAt: Number(now) || 0 };
    }

    function createList(size, datasetKey, pool, opts) {
        const o = opts || {};
        const now = Number(o.now) || Date.now();
        const list = {
            v: FOCUS_VERSION,
            datasetKey: String(datasetKey || ''),
            size: Math.max(0, Math.floor(Number(size) || 0)),
            words: [],
            retired: [],
            updatedAt: now
        };
        if (list.size <= 0) return list;
        const drawn = drawFrom(eligible(pool, list, o), list.size, o);
        list.words = drawn.map(w => emptyEntry(w, now));
        return list;
    }

    /**
     * Coerce anything read from storage into a valid list. Never throws and
     * never returns null - a corrupt record degrades to an empty one rather
     * than breaking every scan on the device.
     */
    function withDefaults(raw) {
        const out = {
            v: FOCUS_VERSION, datasetKey: '', size: 0, words: [], retired: [], updatedAt: 0
        };
        if (!raw || typeof raw !== 'object') return out;

        out.datasetKey = typeof raw.datasetKey === 'string' ? raw.datasetKey : '';
        const size = Number(raw.size);
        if (Number.isFinite(size) && size >= 0) out.size = Math.floor(size);
        const updatedAt = Number(raw.updatedAt);
        if (Number.isFinite(updatedAt) && updatedAt >= 0) out.updatedAt = updatedAt;

        const seen = new Set();
        if (Array.isArray(raw.words)) {
            for (const item of raw.words) {
                if (!item || typeof item !== 'object') continue;
                const w = String(item.w || '').toLowerCase().trim();
                if (!w || seen.has(w)) continue;   // a duplicate would take two slots
                seen.add(w);
                const entry = emptyEntry(w, 0);
                for (const field of ['shown', 'acted', 'addedAt']) {
                    const n = Number(item[field]);
                    if (Number.isFinite(n) && n >= 0) entry[field] = n;
                }
                out.words.push(entry);
            }
        }
        if (Array.isArray(raw.retired)) {
            const retiredSeen = new Set();
            for (const r of raw.retired) {
                const w = String(r || '').toLowerCase().trim();
                if (!w || retiredSeen.has(w)) continue;
                retiredSeen.add(w);
                out.retired.push(w);
            }
            out.retired = out.retired.slice(-MAX_RETIRED);
        }
        return out;
    }

    // -----------------------------------------------------------------
    // Size arithmetic
    // -----------------------------------------------------------------

    /**
     * The most words the list may hold: twice the size the reader chose.
     *
     * The headroom is what "Save to Deck" spends. A reader who keeps saving
     * fills it, at which point Merid says so and they either mark some words
     * learned (freeing slots) or raise the size (raising the ceiling with it).
     */
    function maxSizeFor(size) {
        const n = Math.max(0, Math.floor(Number(size) || 0));
        return n * 2;
    }

    function isFull(list) {
        const l = withDefaults(list);
        return l.size > 0 && l.words.length >= maxSizeFor(l.size);
    }

    /**
     * Clean a size the reader typed. `poolCount` is how many words the active
     * dataset actually holds - asking for more than exist is the same as asking
     * for all of them, so the ceiling is the pool rather than an arbitrary
     * number. Anything unreadable falls back to "All", which is the one answer
     * that can never leave a reader with a broken-looking page.
     */
    function clampSize(n, poolCount) {
        const raw = Number(n);
        if (!Number.isFinite(raw) || raw <= 0) return FOCUS_ALL;
        const pool = Math.max(0, Math.floor(Number(poolCount) || 0));
        const size = Math.floor(raw);
        if (pool > 0 && size >= pool) return FOCUS_ALL;   // "every word" is All
        return Math.max(FOCUS_MIN, size);
    }

    /** Does this stored list still answer the question being asked of it? */
    function needsRebuild(list, size, datasetKey) {
        const l = withDefaults(list);
        if (l.v !== FOCUS_VERSION) return true;
        if (l.datasetKey !== String(datasetKey || '')) return true;
        // A size change is a resize, not a rebuild - resize() keeps the words
        // the reader has already been working on.
        return l.size <= 0 && Number(size) > 0;
    }

    /** The words currently in the list, for the scan's filter. */
    function wordSet(list) {
        return new Set(withDefaults(list).words.map(e => e.w));
    }

    // -----------------------------------------------------------------
    // Drawing new words
    // -----------------------------------------------------------------

    function defaultRng() { return Math.random(); }

    /**
     * Which words the list may draw from: everything in the dataset that is not
     * already in the list, not something the reader has marked known, and not
     * something already retired for silence.
     */
    function eligible(pool, list, opts) {
        const o = opts || {};
        const known = o.known instanceof Set
            ? o.known
            : new Set((Array.isArray(o.known) ? o.known : []).map(w => String(w).toLowerCase()));
        const current = new Set(list.words.map(e => e.w));
        const retired = new Set(list.retired);
        const out = [];
        for (const raw of Array.isArray(pool) ? pool : []) {
            const w = String(raw || '').toLowerCase().trim();
            if (!w || current.has(w) || known.has(w) || retired.has(w)) continue;
            out.push(w);
        }
        return out;
    }

    /**
     * Draw `n` words, preferring ones that have come due for review.
     *
     * The preference is not a nicety. Merid's spaced repetition brings a saved
     * word back after 1, 3, 7, 21 and 60 days - but with a focus list in front
     * of it, a saved word that is not in the list can never be shown, so it can
     * never come back at all. Words saved on another device, or on merid.site,
     * would be lost to the schedule entirely. Letting the refill reach for them
     * first is what keeps that feature alive.
     */
    function drawFrom(candidates, n, opts) {
        const o = opts || {};
        const rng = typeof o.rng === 'function' ? o.rng : defaultRng;
        const want = Math.max(0, Math.floor(Number(n) || 0));
        if (!want || !candidates.length) return [];

        const available = new Set(candidates);
        const picked = [];

        for (const raw of Array.isArray(o.due) ? o.due : []) {
            if (picked.length >= want) break;
            const w = String(raw || '').toLowerCase().trim();
            if (!available.has(w)) continue;
            available.delete(w);
            picked.push(w);
        }
        if (picked.length >= want) return picked;

        // Partial Fisher-Yates over what is left: correct for a uniform draw
        // without shuffling thousands of entries to take a handful.
        const rest = Array.from(available);
        const take = Math.min(want - picked.length, rest.length);
        for (let i = 0; i < take; i++) {
            const j = i + Math.floor(rng() * (rest.length - i));
            const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
            picked.push(rest[i]);
        }
        return picked;
    }

    /**
     * Top the list up to `target`, mutating it in place.
     *
     * When nothing is eligible, the retired list is what has run dry rather
     * than the dataset, so half of it is forgiven - oldest first - and the draw
     * is retried. A list that stays short is a fine outcome; a refill that
     * throws, or one that silently drops the reader to nothing, is not.
     */
    function refill(list, pool, target, opts) {
        const o = opts || {};
        const now = Number(o.now) || Date.now();
        const want = Math.max(0, Math.floor(Number(target) || 0)) - list.words.length;
        if (want <= 0) return list;

        let drawn = drawFrom(eligible(pool, list, o), want, o);
        if (!drawn.length && list.retired.length) {
            list.retired = list.retired.slice(Math.ceil(list.retired.length / 2));
            drawn = drawFrom(eligible(pool, list, o), want, o);
        }
        for (const w of drawn) list.words.push(emptyEntry(w, now));
        return list;
    }

    function retire(list, word) {
        const w = String(word || '').toLowerCase().trim();
        if (!w) return;
        const at = list.retired.indexOf(w);
        if (at !== -1) list.retired.splice(at, 1);
        list.retired.push(w);
        if (list.retired.length > MAX_RETIRED) {
            list.retired = list.retired.slice(-MAX_RETIRED);
        }
    }

    function indexOfWord(list, word) {
        const w = String(word || '').toLowerCase().trim();
        return list.words.findIndex(e => e.w === w);
    }

    // -----------------------------------------------------------------
    // Resizing
    // -----------------------------------------------------------------

    /**
     * Move to a new base size, keeping as much of the reader's work as possible.
     *
     * Growing tops the list up and touches nothing that is already in it -
     * going from 25 to 100 must not throw away the 25 words they have been
     * reading for a fortnight. Shrinking drops the least-invested first: words
     * that have never been interacted with go before words that have, and among
     * equals the ones that joined most recently go first.
     *
     * Only ever shrinks to the new BASE, never to the new ceiling. A reader who
     * moves 200 down to 100 is asking for a hundred words, not two hundred.
     */
    function resize(list, newSize, pool, opts) {
        const o = opts || {};
        const next = withDefaults(list);
        const size = Math.max(0, Math.floor(Number(newSize) || 0));
        next.size = size;
        next.updatedAt = Number(o.now) || Date.now();

        if (size <= 0) { next.words = []; return next; }

        if (next.words.length > size) {
            const ranked = next.words.slice().sort((a, b) => {
                const acted = (b.acted > 0 ? 1 : 0) - (a.acted > 0 ? 1 : 0);
                if (acted) return acted;
                if (b.acted !== a.acted) return b.acted - a.acted;
                return a.addedAt - b.addedAt;   // longest-held first
            });
            const keep = new Set(ranked.slice(0, size).map(e => e.w));
            next.words = next.words.filter(e => keep.has(e.w));
        } else if (next.words.length < size) {
            refill(next, pool, size, o);
        }
        return next;
    }

    // -----------------------------------------------------------------
    // The rotation policy
    // -----------------------------------------------------------------

    /**
     * Fold a batch of interaction events into the list. Returns a NEW list;
     * the input is not mutated, so callers can diff for persistence.
     *
     * Events are the same ones the personalization profile consumes, in the
     * same order the reader produced them - which matters: a batch carrying
     * `shown` and then `up` for one word must never retire it, so interaction
     * is credited before the silence test runs.
     *
     * @param {FocusList} list
     * @param {Array<{word:string, event:string}>} events
     * @param {string[]} pool  every headword in the active dataset
     * @param {{known?:Set|string[], due?:string[], rng?:function, now?:number}} [opts]
     */
    function applyEvents(list, events, pool, opts) {
        const o = opts || {};
        const next = withDefaults(list);
        if (next.size <= 0) return next;          // "All": nothing to rotate
        if (!Array.isArray(events) || !events.length) return next;

        const now = Number(o.now) || Date.now();
        const max = maxSizeFor(next.size);
        let changed = false;

        for (const ev of events) {
            if (!ev || typeof ev !== 'object') continue;
            const word = String(ev.word || '').toLowerCase().trim();
            const event = String(ev.event || '');
            if (!word) continue;

            // "I know this" is the one event that acts on a word whether or not
            // it is in the list: the reader may have marked it from a page
            // scanned before a rotation, or on another device.
            if (event === 'known') {
                const at = indexOfWord(next, word);
                if (at === -1) continue;
                next.words.splice(at, 1);
                changed = true;
                // Refill only back to the BASE, never to the ceiling. This is
                // what makes a full list clearable - see the note at the top.
                if (next.words.length < next.size) refill(next, pool, next.size, o);
                continue;
            }

            const at = indexOfWord(next, word);
            if (at === -1) continue;
            const entry = next.words[at];

            if (INTERACTION_EVENTS.indexOf(event) !== -1) {
                entry.acted++;
                changed = true;
            }

            if (event === 'saved') {
                // The reader asked for this word, so it stays and the list
                // grows - up to the ceiling, and no further.
                if (next.words.length < max) refill(next, pool, next.words.length + 1, o);
                continue;
            }

            if (event !== 'shown') continue;

            entry.shown++;
            changed = true;
            // Shown more than five times and never once engaged with: the word
            // is not landing. Retire it so it is not drawn again while the
            // dataset still has words the reader has not met.
            if (entry.shown > SHOWN_LIMIT && entry.acted === 0) {
                next.words.splice(at, 1);
                retire(next, word);
                if (next.words.length < next.size) refill(next, pool, next.size, o);
            }
        }

        if (changed) next.updatedAt = now;
        return next;
    }

    // -----------------------------------------------------------------
    // Edits made from the Settings page
    // -----------------------------------------------------------------

    /**
     * The reader says they have learned this word. Same rotation as "I know
     * this" on the card - the caller is responsible for the knownWords write
     * that goes with it.
     */
    function markLearned(list, word, pool, opts) {
        return applyEvents(list, [{ word, event: 'known' }], pool, opts);
    }

    /**
     * Take a word out without claiming it is learned: a plain swap. It is
     * retired so the refill does not hand the same word straight back.
     */
    function removeWord(list, word, pool, opts) {
        const o = opts || {};
        const next = withDefaults(list);
        const at = indexOfWord(next, word);
        if (at === -1) return next;
        next.words.splice(at, 1);
        retire(next, word);
        if (next.size > 0 && next.words.length < next.size) refill(next, pool, next.size, o);
        next.updatedAt = Number(o.now) || Date.now();
        return next;
    }

    /** Put a specific word in, if there is room and the dataset has it. */
    function addWord(list, word, pool, opts) {
        const o = opts || {};
        const next = withDefaults(list);
        const w = String(word || '').toLowerCase().trim();
        if (!w || next.size <= 0) return next;
        if (indexOfWord(next, w) !== -1) return next;
        if (next.words.length >= maxSizeFor(next.size)) return next;
        const inPool = (Array.isArray(pool) ? pool : [])
            .some(p => String(p || '').toLowerCase().trim() === w);
        if (!inPool) return next;
        // Asking for a word back forgives its retirement, or the next refill
        // would refuse to consider it ever again.
        const at = next.retired.indexOf(w);
        if (at !== -1) next.retired.splice(at, 1);
        next.words.push(emptyEntry(w, Number(o.now) || Date.now()));
        next.updatedAt = Number(o.now) || Date.now();
        return next;
    }

    /** Start over: a fresh draw at the current size, retirements forgiven. */
    function reshuffle(list, pool, opts) {
        const l = withDefaults(list);
        return createList(l.size, l.datasetKey, pool, opts);
    }

    return {
        FOCUS_VERSION, FOCUS_PRESETS, FOCUS_ALL, FOCUS_MIN,
        SHOWN_LIMIT, MAX_RETIRED, INTERACTION_EVENTS,
        createList, withDefaults, emptyEntry,
        maxSizeFor, isFull, clampSize, needsRebuild, wordSet,
        eligible, drawFrom, refill, resize,
        applyEvents, markLearned, removeWord, addWord, reshuffle
    };
});
