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
import { readJson, statePath } from './entries.mjs';

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

/** Stage 04: entries scored at all, and entries whose best candidate cleared. */
export function scoredCount(dir = statePath()) {
    return Object.keys(entriesOf(dir, 'ranked.json')).length;
}
export function clearCount(dir = statePath()) {
    return Object.values(entriesOf(dir, 'ranked.json')).filter(v => v && v.anyClear).length;
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
