/**
 * profile.js - pure, DOM-free personalization core.
 *
 * Holds everything Merid learns about one user: which words they engage with,
 * which CEFR levels suit them, which topics they read, and an online logistic
 * regression that turns those signals into a "how likely is this user to want
 * this word here" score.
 *
 * Loaded two ways (same pattern as vocab-core.js):
 *   - As a content script / service-worker script, attaching to `globalThis.VMProfile`.
 *   - As a CommonJS module in `node --test` (`require('../lib/profile.js')`).
 *
 * Keep this file free of `chrome.*`, `window`, `document` and any network use.
 * All persistence is the caller's job - this module only transforms plain data.
 *
 * DESIGN NOTES
 *
 * 1. Determinism is preserved. Personalization does NOT decide replace/skip
 *    directly; it adjusts the *frequency* that vocab-core's existing
 *    `gateByFrequency` hash gate consumes. Same word + same page still yields
 *    the same answer on every re-render and MutationObserver pass.
 *
 * 2. Cold start is explicit. With no feedback the multiplier is exactly 1.0,
 *    so a brand-new user gets today's v1.6.1 behaviour. Learned scores fade in
 *    over the first `COLD_START_EVENTS` feedback events - three rejections must
 *    never be allowed to dominate the system.
 *
 * 3. Signals are weighted by cost to the user. Clicking "I know this" is a
 *    deliberate, expensive action and counts far more than a hover.
 *
 * @typedef {Object} WordStat
 * @property {number} shown   Times the word was rendered on a page.
 * @property {number} hover   Times its tooltip was opened.
 * @property {number} up      Explicit thumbs-up.
 * @property {number} down    Explicit thumbs-down.
 * @property {number} saved   Times saved to the deck.
 * @property {number} known   Times marked "I know this".
 * @property {number} aiOk    Times the AI context check approved it.
 * @property {number} aiBad   Times the AI context check rejected it.
 * @property {number} lastSeen Epoch ms of the last render.
 *
 * @typedef {Object} Profile
 * @property {number} v
 * @property {Object.<string, WordStat>} words
 * @property {number[]} weights
 * @property {Object.<string, {up:number, down:number}>} levels
 * @property {Object.<string, {up:number, down:number}>} topics
 * @property {number} events
 * @property {number} updatedAt
 */

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;      // Node / tests
    } else {
        root.VMProfile = api;      // content script / service worker
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PROFILE_VERSION = 1;

    // Feedback events recognized by `recordEvent`. The value is how strongly the
    // event counts as positive (+) or negative (-) evidence when training. These
    // are deliberately asymmetric: explicit actions outrank passive ones, and
    // "I know this" is the strongest negative because the user is telling us the
    // word has nothing left to teach them.
    const EVENT_WEIGHTS = {
        shown: 0,      // exposure only - tracked, but not evidence by itself
        hover: 0.3,   // mild interest
        up: 1.0,
        saved: 1.0,
        aiOk: 0.4,
        aiBad: -0.6,
        down: -1.0,
        known: -1.2
    };

    const EVENT_NAMES = Object.keys(EVENT_WEIGHTS);

    // Number of feedback events before learned scores are fully trusted.
    const COLD_START_EVENTS = 25;

    // Frequency multiplier bounds. A word the user loves can appear ~2x as
    // often; one they dislike drops to ~0.25x but never to zero, so a single
    // bad day cannot permanently erase a word from the rotation.
    const MIN_MULTIPLIER = 0.25;
    const MAX_MULTIPLIER = 2.0;

    // Spaced repetition: a word shown within this window is damped, so the
    // reader is not shown the same headword on every page of a browsing session.
    const REPEAT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

    // Cap the per-word table so a heavy user's profile cannot grow unbounded
    // (it is mirrored to Firestore, which has a 1 MiB document limit).
    const MAX_WORDS_TRACKED = 1500;
    const PRUNE_TO = 1200;

    const LEARNING_RATE = 0.08;
    const FEATURE_COUNT = 8;

    // -----------------------------------------------------------------
    // Construction / migration
    // -----------------------------------------------------------------

    function emptyWordStat() {
        return {
            shown: 0, hover: 0, up: 0, down: 0, saved: 0, known: 0, aiOk: 0, aiBad: 0,
            lastSeen: 0,
            stage: 0   // spaced-repetition step, only advanced for saved words
        };
    }

    // ---------------------------------------------------------------------
    // Spaced repetition for saved words.
    //
    // "Save to Deck" used to be a dead end for the reading experience: the
    // word went into a list and the page never brought it back. These are the
    // gaps after which a saved word becomes worth meeting again, growing each
    // time the reader actually sees it - the standard expanding schedule.
    // ---------------------------------------------------------------------
    const DAY_MS = 24 * 60 * 60 * 1000;
    const REVIEW_INTERVALS_MS = [1 * DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 21 * DAY_MS, 60 * DAY_MS];

    // A due word beats the normal ceiling: resurfacing it is the whole point,
    // and it competes against words the reader has never asked for.
    const REVIEW_MULTIPLIER = 3;

    /**
     * Is this a saved word the reader has not met for long enough that seeing
     * it again would be useful? Never true for words they marked known, and
     * never true for words they never saved.
     */
    function isDueForReview(profile, word, now) {
        const p = withDefaults(profile);
        const w = p.words[String(word || '').toLowerCase().trim()];
        if (!w || w.saved <= 0 || w.known > 0) return false;
        if (!w.lastSeen) return true; // saved elsewhere (site/deck) and never shown here
        const idx = Math.min(w.stage, REVIEW_INTERVALS_MS.length - 1);
        return (Number(now) || Date.now()) - w.lastSeen >= REVIEW_INTERVALS_MS[idx];
    }

    /** Words currently due, most overdue first. Drives the popup's review count. */
    function dueForReview(profile, now) {
        const p = withDefaults(profile);
        const t = Number(now) || Date.now();
        return Object.keys(p.words)
            .filter(w => isDueForReview(p, w, t))
            .sort((a, b) => (p.words[a].lastSeen || 0) - (p.words[b].lastSeen || 0));
    }

    function createProfile() {
        return {
            v: PROFILE_VERSION,
            words: {},
            // weights[0] is the bias; the rest align with `featureVector` order.
            weights: new Array(FEATURE_COUNT).fill(0),
            levels: {},
            topics: {},
            events: 0,
            updatedAt: 0
        };
    }

    /**
     * Coerce anything read from storage into a valid profile. Never throws and
     * never returns null - a corrupt profile degrades to a fresh one rather
     * than breaking the page.
     */
    function withDefaults(raw) {
        const base = createProfile();
        if (!raw || typeof raw !== 'object') return base;

        const out = base;
        if (raw.words && typeof raw.words === 'object') {
            for (const key of Object.keys(raw.words)) {
                const w = raw.words[key];
                if (!w || typeof w !== 'object') continue;
                const stat = emptyWordStat();
                for (const field of Object.keys(stat)) {
                    const n = Number(w[field]);
                    if (Number.isFinite(n) && n >= 0) stat[field] = n;
                }
                out.words[key] = stat;
            }
        }
        if (Array.isArray(raw.weights) && raw.weights.length === FEATURE_COUNT) {
            out.weights = raw.weights.map(n => (Number.isFinite(Number(n)) ? Number(n) : 0));
        }
        for (const bucket of ['levels', 'topics']) {
            if (raw[bucket] && typeof raw[bucket] === 'object') {
                for (const key of Object.keys(raw[bucket])) {
                    const b = raw[bucket][key];
                    if (!b || typeof b !== 'object') continue;
                    out[bucket][key] = {
                        up: Math.max(0, Number(b.up) || 0),
                        down: Math.max(0, Number(b.down) || 0),
                        known: Math.max(0, Number(b.known) || 0)
                    };
                }
            }
        }
        const events = Number(raw.events);
        if (Number.isFinite(events) && events >= 0) out.events = events;
        const updatedAt = Number(raw.updatedAt);
        if (Number.isFinite(updatedAt) && updatedAt >= 0) out.updatedAt = updatedAt;
        return out;
    }

    // -----------------------------------------------------------------
    // Topic derivation
    //
    // The topic is inferred from the hostname and URL path with a small keyword
    // table covering both Vietnamese and English section names, because that is
    // what Vietnamese news sites actually use in their URLs
    // (vnexpress.net/kinh-doanh, tuoitre.vn/cong-nghe, ...).
    // -----------------------------------------------------------------

    const TOPIC_RULES = [
        { topic: 'business', words: ['kinh-doanh', 'kinhdoanh', 'tai-chinh', 'taichinh', 'chung-khoan', 'doanh-nghiep', 'business', 'finance', 'market', 'economy', 'startup'] },
        { topic: 'tech', words: ['cong-nghe', 'congnghe', 'so-hoa', 'sohoa', 'tech', 'technology', 'software', 'digital', 'ai'] },
        { topic: 'science', words: ['khoa-hoc', 'khoahoc', 'suc-khoe', 'suckhoe', 'science', 'health', 'medicine', 'research', 'nature'] },
        { topic: 'academic', words: ['giao-duc', 'giaoduc', 'tuyen-sinh', 'education', 'academic', 'university', 'scholar', 'journal', 'edu'] },
        { topic: 'news', words: ['thoi-su', 'thoisu', 'the-gioi', 'thegioi', 'phap-luat', 'news', 'politics', 'world'] },
        { topic: 'casual', words: ['giai-tri', 'giaitri', 'the-thao', 'thethao', 'doi-song', 'doisong', 'du-lich', 'entertainment', 'sport', 'life', 'travel', 'video'] }
    ];

    /**
     * Bucket a URL into a coarse topic. Unknown pages fall back to 'general' so
     * the topic feature stays defined for every scan.
     *
     * Matching is hyphen-boundary aware, never a raw substring test: the URL is
     * split into segments on everything except letters, digits and hyphens, and
     * a keyword must occupy whole hyphen-delimited parts of a segment. A plain
     * `includes` would classify "giai-tri" (entertainment) as tech because it
     * contains "ai", and "khoa-hoc" as casual because it contains "hoc".
     */
    function topicFromUrl(url) {
        const s = String(url || '').toLowerCase();
        if (!s) return 'general';
        // Keep hyphens: Vietnamese section slugs are hyphenated ("kinh-doanh").
        const segments = s.split(/[^a-z0-9-]+/).filter(Boolean);
        if (!segments.length) return 'general';
        const haystacks = segments.map(seg => '-' + seg + '-');
        for (const rule of TOPIC_RULES) {
            for (const w of rule.words) {
                const needle = '-' + w + '-';
                if (haystacks.some(h => h.includes(needle))) return rule.topic;
            }
        }
        return 'general';
    }

    // -----------------------------------------------------------------
    // Recording feedback
    // -----------------------------------------------------------------

    /** Laplace-smoothed positive rate for a {up, down} bucket. */
    function bucketRate(bucket) {
        if (!bucket) return 0.5;
        const up = bucket.up || 0;
        const down = bucket.down || 0;
        return (up + 1) / (up + down + 2);
    }

    /**
     * Drop the least valuable tracked words once the table outgrows its cap.
     * Words carrying explicit feedback are kept ahead of pure-exposure entries;
     * ties break on recency.
     */
    function pruneWords(profile) {
        const keys = Object.keys(profile.words);
        if (keys.length <= MAX_WORDS_TRACKED) return profile;
        const valueOf = (k) => {
            const w = profile.words[k];
            const explicit = w.up + w.down + w.saved + w.known;
            return explicit * 1e13 + (w.lastSeen || 0);
        };
        keys.sort((a, b) => valueOf(b) - valueOf(a));
        const kept = {};
        for (let i = 0; i < PRUNE_TO; i++) kept[keys[i]] = profile.words[keys[i]];
        profile.words = kept;
        return profile;
    }

    /**
     * Record one interaction and train the ranker on it. Returns a NEW profile
     * object; the input is not mutated, so callers can diff for persistence.
     *
     * @param {Profile} profile
     * @param {{word:string, event:string, level?:string, topic?:string,
     *          features?:number[], now?:number}} ev
     */
    function recordEvent(profile, ev) {
        const next = withDefaults(profile);
        const word = String((ev && ev.word) || '').toLowerCase().trim();
        const event = String((ev && ev.event) || '');
        if (!word || !EVENT_NAMES.includes(event)) return next;

        const now = Number(ev.now) || Date.now();
        // Due-ness has to be read BEFORE lastSeen moves, or every impression
        // would look freshly seen and the schedule would never advance.
        const wasDue = event === 'shown' && isDueForReview(next, word, now);
        const stat = next.words[word] || emptyWordStat();
        stat[event] = (stat[event] || 0) + 1;
        if (event === 'shown') {
            // Advance only when a real interval elapsed. A word that is "due"
            // merely because it has never been shown here (saved on another
            // device and synced in) must not skip a step on first sight.
            if (wasDue && stat.lastSeen > 0) {
                stat.stage = Math.min(stat.stage + 1, REVIEW_INTERVALS_MS.length - 1);
            }
            stat.lastSeen = now;
        }
        // Saving a word restarts its schedule: the reader just told us they
        // want to learn it, so the first review should come soon, not in 60
        // days. They saved it from its own card, so they have just seen it -
        // the clock starts now, not from whenever it was last rendered.
        if (event === 'saved') {
            stat.stage = 0;
            stat.lastSeen = now;
        }
        next.words[word] = stat;

        const weight = EVENT_WEIGHTS[event];
        if (weight !== 0) {
            const positive = weight > 0;
            const level = String((ev && ev.level) || '').toUpperCase();
            if (level) {
                const b = next.levels[level] || { up: 0, down: 0, known: 0 };
                b[positive ? 'up' : 'down'] += Math.abs(weight);
                // Counted separately from `down` because the two mean opposite
                // things for level advice: "I know this" says the dataset is
                // too easy, a thumbs-down says the word was a bad fit.
                if (event === 'known') b.known = (b.known || 0) + 1;
                next.levels[level] = b;
            }
            const topic = String((ev && ev.topic) || '');
            if (topic) {
                const b = next.topics[topic] || { up: 0, down: 0 };
                b[positive ? 'up' : 'down'] += Math.abs(weight);
                next.topics[topic] = b;
            }
            next.events += 1;

            // Online logistic-regression step. `features` is the vector that was
            // used to decide showing this word; when the caller did not keep it
            // we recompute from the pre-event profile so training still happens.
            const x = Array.isArray(ev.features) && ev.features.length === FEATURE_COUNT
                ? ev.features
                : featureVector(profile, { word, level: ev.level, topic: ev.topic, now });
            trainStep(next.weights, x, positive ? 1 : 0, Math.abs(weight));
        }

        next.updatedAt = now;
        return pruneWords(next);
    }

    /** One SGD step on the logistic loss, scaled by the event's confidence. */
    function trainStep(weights, x, target, confidence) {
        const p = sigmoid(dot(weights, x));
        const err = target - p;
        const lr = LEARNING_RATE * (confidence || 1);
        for (let i = 0; i < weights.length; i++) {
            weights[i] += lr * err * x[i];
            // Keep weights bounded so one pathological session cannot blow up
            // the model; also acts as cheap regularization.
            if (weights[i] > 4) weights[i] = 4;
            else if (weights[i] < -4) weights[i] = -4;
        }
        return weights;
    }

    function dot(a, b) {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * (b[i] || 0);
        return s;
    }

    function sigmoid(z) {
        if (z >= 0) return 1 / (1 + Math.exp(-z));
        const e = Math.exp(z);
        return e / (1 + e);
    }

    // -----------------------------------------------------------------
    // Scoring
    // -----------------------------------------------------------------

    /**
     * Build the feature vector for one candidate word. Every feature is
     * centered near 0 and bounded to roughly [-1, 1] so a single raw count can
     * never dominate the dot product.
     *
     * Index map (must stay in sync with FEATURE_COUNT):
     *   0 bias
     *   1 explicit word affinity   (up/saved vs down/known)
     *   2 AI verdict history       (aiOk vs aiBad for this word)
     *   3 engagement rate          (hover per show - did they ever look?)
     *   4 level affinity           (CEFR bucket rate)
     *   5 topic affinity           (topic bucket rate)
     *   6 recency damping         (negative when shown very recently)
     *   7 exposure fatigue        (negative when shown a lot with no response)
     */
    function featureVector(profile, ctx) {
        const p = withDefaults(profile);
        const word = String((ctx && ctx.word) || '').toLowerCase().trim();
        const now = Number(ctx && ctx.now) || Date.now();
        const w = p.words[word] || emptyWordStat();

        const pos = w.up + w.saved;
        const neg = w.down + w.known;
        const explicit = (pos + neg) > 0 ? (pos - neg) / (pos + neg) : 0;

        const ai = (w.aiOk + w.aiBad) > 0 ? (w.aiOk - w.aiBad) / (w.aiOk + w.aiBad) : 0;

        // Hover rate relative to a 1-in-4 baseline: looking at a word more often
        // than that is interest, less is indifference.
        const engagement = w.shown > 0
            ? Math.max(-1, Math.min(1, (w.hover / w.shown - 0.25) * 2))
            : 0;

        const level = String((ctx && ctx.level) || '').toUpperCase();
        const levelAff = level ? (bucketRate(p.levels[level]) - 0.5) * 2 : 0;

        const topic = String((ctx && ctx.topic) || '');
        const topicAff = topic ? (bucketRate(p.topics[topic]) - 0.5) * 2 : 0;

        let recency = 0;
        if (w.lastSeen > 0) {
            const age = now - w.lastSeen;
            if (age < REPEAT_WINDOW_MS) recency = -(1 - age / REPEAT_WINDOW_MS);
        }

        // Shown repeatedly but never hovered, saved, or rated: the user is
        // scrolling past it. Saturates at 10 unanswered impressions.
        const silent = w.shown - (w.hover + w.up + w.down + w.saved + w.known);
        const fatigue = silent > 0 ? -Math.min(1, silent / 10) : 0;

        return [1, explicit, ai, engagement, levelAff, topicAff, recency, fatigue];
    }

    /**
     * Probability (0..1) that this user wants to see this word here.
     * 0.5 means "no opinion" - which is exactly what a fresh profile returns.
     */
    function scoreCandidate(profile, ctx) {
        const p = withDefaults(profile);
        return sigmoid(dot(p.weights, featureVector(p, ctx)));
    }

    /**
     * Confidence in the learned model, 0..1, ramping over the first
     * COLD_START_EVENTS feedback events.
     */
    function confidence(profile) {
        const p = withDefaults(profile);
        return Math.max(0, Math.min(1, p.events / COLD_START_EVENTS));
    }

    /**
     * Turn the score into a multiplier on the user's chosen frequency.
     *
     * This is the single integration point with the existing engine: callers
     * pass `frequency * multiplier` into `VMCore.gateByFrequency`, which keeps
     * the deterministic hash gate - and therefore stable re-renders - intact.
     *
     * With an empty profile this returns exactly 1.0.
     */
    function frequencyMultiplier(profile, ctx) {
        const p = withDefaults(profile);
        const conf = confidence(p);
        if (conf <= 0) return 1;
        const score = scoreCandidate(p, ctx);
        // score 0.5 -> 1x, score 1 -> MAX, score 0 -> MIN, then faded in by
        // confidence so early sessions stay close to the default behaviour.
        const raw = score >= 0.5
            ? 1 + (score - 0.5) * 2 * (MAX_MULTIPLIER - 1)
            : MIN_MULTIPLIER + (score / 0.5) * (1 - MIN_MULTIPLIER);
        return 1 + (raw - 1) * conf;
    }

    /**
     * Effective frequency for one candidate, clamped to the 0..100 range
     * `gateByFrequency` expects. Words the user explicitly marked "known" are
     * suppressed entirely - that list is a hard filter, not a preference.
     */
    function adjustedFrequency(profile, ctx, baseFrequency) {
        const base = Math.max(0, Math.min(100, Number(baseFrequency) || 0));
        if (base <= 0) return 0;
        const p = withDefaults(profile);
        const word = String((ctx && ctx.word) || '').toLowerCase().trim();
        if (p.words[word] && p.words[word].known > 0) return 0;

        let mult = frequencyMultiplier(p, ctx);
        // A saved word that has come due outranks the learned preference: the
        // reader explicitly asked to learn it, and the recency feature would
        // otherwise keep damping exactly the words worth meeting again.
        if (isDueForReview(p, word, ctx && ctx.now)) mult = Math.max(mult, REVIEW_MULTIPLIER);
        return Math.max(0, Math.min(100, base * mult));
    }

    // -----------------------------------------------------------------
    // Level advice
    //
    // The reader picks a dataset once and rarely revisits it. Their own
    // behaviour says whether it still fits: marking a lot of its words "I know
    // this" means it has run dry, while rating a lot of them down means it is
    // ahead of them.
    // -----------------------------------------------------------------
    const LEVEL_ORDER = ['SAT', 'B2', 'C1', 'C2'];
    const LEVEL_MIN_SAMPLES = 12;   // below this, behaviour is still noise
    const LEVEL_UP_RATIO = 0.4;     // "known" share that means "too easy"
    const LEVEL_DOWN_RATIO = 0.5;   // dislike share that means "too hard"

    /**
     * Suggest moving up or down a level, or null when the current one fits or
     * there is not enough evidence yet.
     *
     * @returns {{direction:'up'|'down', from:string, to:string,
     *            knownShare:number, samples:number}|null}
     */
    function suggestLevel(profile, currentTag) {
        const p = withDefaults(profile);
        const tag = String(currentTag || '').toUpperCase();
        const idx = LEVEL_ORDER.indexOf(tag);
        if (idx === -1) return null;              // "All"/custom: nothing to advise
        const b = p.levels[tag];
        if (!b) return null;

        const samples = b.up + b.down;
        if (samples < LEVEL_MIN_SAMPLES) return null;

        const knownShare = (b.known || 0) / Math.max(1, samples);
        if (knownShare >= LEVEL_UP_RATIO) {
            // Skip B2 when it is not shipped as a dataset.
            for (let i = idx + 1; i < LEVEL_ORDER.length; i++) {
                return { direction: 'up', from: tag, to: LEVEL_ORDER[i], knownShare, samples };
            }
            return null;
        }
        const dislikeShare = b.down / Math.max(1, samples);
        if (dislikeShare >= LEVEL_DOWN_RATIO && knownShare < 0.1 && idx > 0) {
            return { direction: 'down', from: tag, to: LEVEL_ORDER[idx - 1], knownShare, samples };
        }
        return null;
    }

    // -----------------------------------------------------------------
    // Cross-device merge
    // -----------------------------------------------------------------

    /**
     * Combine two profiles for the same user, e.g. this device's and the copy
     * stored in their account.
     *
     * Counters are SUMMED rather than overwritten: both sides recorded real
     * things the user really did, so last-write-wins would throw away a whole
     * device's history. `lastSeen` takes the later timestamp (the word was most
     * recently shown then), and the two weight vectors are averaged - they were
     * trained on overlapping evidence, so the mean is a reasonable consensus
     * and is self-correcting as feedback continues on the merged profile.
     *
     * Commutative and associative over counters, so sync order does not matter.
     */
    function mergeProfiles(a, b) {
        const pa = withDefaults(a);
        const pb = withDefaults(b);
        const out = createProfile();

        for (const key of Object.keys(pa.words).concat(Object.keys(pb.words))) {
            if (out.words[key]) continue;
            const wa = pa.words[key] || emptyWordStat();
            const wb = pb.words[key] || emptyWordStat();
            const merged = emptyWordStat();
            for (const f of Object.keys(merged)) {
                // lastSeen/stage are positions on a schedule, not tallies:
                // summing them would push a word years into the future.
                merged[f] = (f === 'lastSeen' || f === 'stage')
                    ? Math.max(wa[f], wb[f])
                    : wa[f] + wb[f];
            }
            out.words[key] = merged;
        }

        for (const bucket of ['levels', 'topics']) {
            for (const key of Object.keys(pa[bucket]).concat(Object.keys(pb[bucket]))) {
                if (out[bucket][key]) continue;
                const ba = pa[bucket][key] || { up: 0, down: 0, known: 0 };
                const bb = pb[bucket][key] || { up: 0, down: 0, known: 0 };
                out[bucket][key] = {
                    up: ba.up + bb.up,
                    down: ba.down + bb.down,
                    known: (ba.known || 0) + (bb.known || 0)
                };
            }
        }

        for (let i = 0; i < FEATURE_COUNT; i++) {
            out.weights[i] = (pa.weights[i] + pb.weights[i]) / 2;
        }
        out.events = pa.events + pb.events;
        out.updatedAt = Math.max(pa.updatedAt, pb.updatedAt);
        return pruneWords(out);
    }

    // -----------------------------------------------------------------
    // Prompt-facing summary
    // -----------------------------------------------------------------

    /**
     * Compact, human-readable description of the user for the LLM prompt.
     * Deliberately short - this is prepended to every AI check, so every token
     * here is billed on every request. Returns '' for a profile with nothing
     * worth saying, so a new user's prompt is unchanged.
     *
     * Contains no page content and no identifiers: only aggregate preferences.
     */
    function describeProfile(profile, opts) {
        const p = withDefaults(profile);
        const maxRejects = (opts && opts.maxRejects) || 8;
        const parts = [];

        const levels = Object.keys(p.levels)
            .map(k => ({ k, rate: bucketRate(p.levels[k]), n: p.levels[k].up + p.levels[k].down }))
            .filter(x => x.n >= 2)
            .sort((a, b) => b.rate - a.rate);
        if (levels.length) parts.push('prefers ' + levels[0].k + '-level words');

        // Ranked by engagement VOLUME, not by like-rate: this line tells the
        // model which subject areas to draw vocabulary from, and a topic the
        // user reads daily is relevant context even when they reject half the
        // words in it. The like/dislike signal is already carried by the
        // topic-affinity feature in the ranker.
        const topics = Object.keys(p.topics)
            .map(k => ({ k, n: p.topics[k].up + p.topics[k].down }))
            .filter(x => x.n >= 2)
            .sort((a, b) => b.n - a.n)
            .slice(0, 3)
            .map(x => x.k);
        if (topics.length) parts.push('reads mostly ' + topics.join(', '));

        const rejected = Object.keys(p.words)
            .filter(k => {
                const w = p.words[k];
                return (w.down + w.known) > (w.up + w.saved);
            })
            .sort((a, b) => {
                const wa = p.words[a], wb = p.words[b];
                return (wb.down + wb.known) - (wa.down + wa.known);
            })
            .slice(0, maxRejects);
        if (rejected.length) parts.push('has rejected: ' + rejected.join(', '));

        return parts.join('; ');
    }

    return {
        PROFILE_VERSION, EVENT_WEIGHTS, EVENT_NAMES, FEATURE_COUNT,
        COLD_START_EVENTS, MIN_MULTIPLIER, MAX_MULTIPLIER, REPEAT_WINDOW_MS,
        MAX_WORDS_TRACKED,
        createProfile, withDefaults, emptyWordStat,
        topicFromUrl, TOPIC_RULES,
        recordEvent, pruneWords, mergeProfiles,
        REVIEW_INTERVALS_MS, REVIEW_MULTIPLIER, isDueForReview, dueForReview,
        LEVEL_ORDER, LEVEL_MIN_SAMPLES, suggestLevel,
        featureVector, scoreCandidate, confidence,
        frequencyMultiplier, adjustedFrequency,
        describeProfile, bucketRate,
        // exposed for tests
        sigmoid, dot, trainStep
    };
});
