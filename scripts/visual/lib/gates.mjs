// What each stage handed on to the next, counted from the files it wrote.
//
// The pipeline's quiet failure is a stage that succeeds on almost nothing.
// Stage 02 ran out of the day's Gemini quota, wrote queries for 18 of 943
// words, and 03, 04 and 05 then did their jobs perfectly on the 18. Every exit
// status was 0, the run printed "Done", and it shipped fifteen pictures against
// a target of eight hundred. Nothing in the chain was watching the SIZE of what
// it passed along.
//
// These are the counters that watch it. They read the state files rather than
// the stages' output on purpose: the count is the thing being checked, and a
// printed line can be reworded while a JSON key cannot. They live here rather
// than inside run.mjs so they can be tested against a state directory that has
// been deliberately cut short at each stage, which is the only way to know a
// counter reads the key it thinks it reads.
import path from 'node:path';
import { readJson, statePath, loadEntries } from './entries.mjs';

const entriesOf = (dir, file) => readJson(path.join(dir, file), { entries: {} }).entries || {};

/** Stage 01: entries that may carry a photograph at all. */
export function concreteCount(dir = statePath()) {
    return Object.values(entriesOf(dir, 'classification.json'))
        .filter(v => v && v.kind === 'concrete').length;
}

/**
 * Stage 02: entries with something to search for.
 *
 * Both halves matter. `depictable` false is the model saying a photograph would
 * be dishonest here, and it deliberately comes with an empty query; an entry
 * with neither is one stage 03 can never visit.
 */
export function searchableCount(dir = statePath()) {
    return Object.values(entriesOf(dir, 'queries.json'))
        .filter(v => v && v.depictable && v.query).length;
}

/** Stage 03: entries with at least one candidate picture on disk. */
export function candidateCount(dir = statePath()) {
    return Object.values(entriesOf(dir, 'candidates.json'))
        .filter(v => v && (v.candidates || []).length).length;
}

/**
 * Stage 03, per archive: how many entries each one reached.
 *
 * "The archives are the bottleneck" is a diagnosis nobody can act on. There are
 * three of them, and which one is absent decides the fix entirely: a Pexels key
 * that was never accepted, an Openverse token that would lift a rate limit, or
 * Wikimedia genuinely having nothing for these words. Counted per entry rather
 * than per candidate - ten pictures for one word is not reach.
 */
export function reachBySource(dir = statePath()) {
    const out = {};
    for (const e of Object.values(entriesOf(dir, 'candidates.json'))) {
        for (const src of new Set((e.candidates || []).map(c => c.source))) {
            out[src] = (out[src] || 0) + 1;
        }
    }
    return out;
}

/**
 * What each archive did during the last fetch: reached, asked, skipped, refused.
 *
 * reachBySource above answers "how many entries did this archive supply", which
 * is half the question. The other half is why the number is what it is, and the
 * two halves want opposite actions:
 *
 *   refused > 0        a rate limit. Lower the budget, or raise the allowance.
 *   skipped > 0        the budget ran out before the words did.
 *   asked high,        the archive answered and had nothing for those words.
 *   refused 0,         No key, token or budget changes that - it is the only
 *   reach low          one of the three that is not a configuration problem.
 *
 * Written by stage 03 rather than parsed out of its output, for the usual
 * reason: the numbers are the thing being read, and they are read by a
 * different process an hour later.
 */
export function fetchReport(dir = statePath()) {
    return readJson(path.join(dir, 'fetch-report.json'), {}) || {};
}

/** Stage 04: entries scored at all, and entries whose best candidate cleared. */
export function scoredCount(dir = statePath()) {
    return Object.keys(entriesOf(dir, 'ranked.json')).length;
}
export function clearCount(dir = statePath()) {
    return Object.values(entriesOf(dir, 'ranked.json')).filter(v => v && v.anyClear).length;
}

/**
 * Stage 02b: how much of the corpus has something to draw at all.
 *
 * Not a photograph - a photograph is the exception. Every entry ends with one
 * of three things: a picture, a concept from 02b, or the kind of thing it is
 * from 02 ("object", "action", "role"). An entry with none of the three gets a
 * card with no picture panel, and merid-extension-final's own test refuses a
 * build where more than a tenth of the corpus is in that state.
 *
 * Which makes this the one count that can turn a flawless artwork run into zero
 * pictures on the repository: ship.mjs will not push while npm test is red. It
 * is checked against the same three sources 06 uses, so the number here is the
 * number that test will compute an hour later.
 *
 * Photographs are not counted: they are not built yet when this is asked, and
 * every entry that gets one had a kind from 02 anyway, so it is covered either
 * way. That makes this a lower bound on the coverage 06 will report.
 */
export function uncoveredCount(dir = statePath(), corpusSlugs = null) {
    const slugs = corpusSlugs || loadEntries().map(e => e.slug);
    const icons = entriesOf(dir, 'iconmap.json');
    const queries = entriesOf(dir, 'queries.json');
    const KINDS = new Set(['object', 'action', 'role']);
    let covered = 0;
    for (const slug of slugs) {
        const q = queries[slug];
        if (icons[slug] || (q && KINDS.has(q.kind))) covered++;
    }
    return { corpus: slugs.length, covered, uncovered: slugs.length - covered };
}

/**
 * How many a stage has to have handed on for the run to be worth continuing.
 *
 * Under a target the answer is exact and unforgiving: fewer words with a query
 * than pictures asked for cannot reach the target even if every later stage is
 * perfect, so the target itself is the floor. Without a target there is no
 * number to hold it to, and the test becomes a proportion - a stage that
 * dropped most of what it was handed went wrong, whatever the absolute count.
 */
export function needFor(target, of, share) {
    if (target !== null && target !== undefined) return target;
    return Math.ceil(of * share);
}

/**
 * Which step of the chain loses the most of what it was handed.
 *
 * Four numbers come out of a probe - eligible, depictable, fetched, scored -
 * and the useful question is not "how many were lost" but "where". Measured
 * step by step, each against the one before it, because an end-to-end
 * comparison blames the wrong stage: comparing "has a candidate" against the
 * whole eligible pool blamed the archives for words stage 02 had already
 * refused and never sent them. Stage 03 only visits what stage 02 called
 * depictable; a word refused there is absent from candidates.json without any
 * archive having failed.
 *
 * Worst SURVIVAL RATE rather than worst absolute loss: a step that keeps 20 of
 * 100 is the problem even when a later step drops more in raw count.
 *
 * `searchable` may be absent on a measurement taken before it was recorded, in
 * which case that step is skipped rather than guessed at - and the caller says
 * so instead of quietly reporting one of the other two.
 *
 * @returns {{name: string, got: number, of: number, complete: boolean}|null}
 */
export function worstStep({ pool, searchable, withCand, clear }) {
    const complete = searchable !== undefined && searchable !== null;
    const steps = [
        complete ? { name: 'the MODEL', of: pool, got: searchable } : null,
        { name: 'the ARCHIVES', of: complete ? searchable : pool, got: withCand },
        { name: 'the SCORING', of: withCand, got: clear }
    ].filter(st => st && st.of > 0 && Number.isFinite(st.got));
    if (!steps.length) return null;
    const worst = steps.sort((a, b) => (a.got / a.of) - (b.got / b.of))[0];
    return { ...worst, complete };
}

/**
 * The low end of a one-sided 90% Wilson interval.
 *
 * Nine out of ten is not 90%. It is a sample of ten, and the honest reading of
 * it is "somewhere upwards of 72%". Printing the raw fraction is what makes a
 * fifty-word sample look like it settled something it did not, and the whole
 * point of the sample is to decide the fate of entries nobody will ever check.
 * So the report leads with this number and the cutoff is chosen on it.
 *
 * Two callers now, which is why it lives here rather than inside stage 06.
 * Stage 06 asks "how often was the top candidate right above this score"; the
 * probe in try.mjs asks "what fraction of eligible words end with a picture".
 * Both are a proportion measured on a sample and then made to decide the fate
 * of a few hundred entries, and both have to be read at their low end.
 */
export function wilsonLow(hits, n) {
    if (!n) return 0;
    const z = 1.2816;
    const p = hits / n;
    const d = 1 + z * z / n;
    const centre = p + z * z / (2 * n);
    const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return Math.max(0, (centre - spread) / d);
}
