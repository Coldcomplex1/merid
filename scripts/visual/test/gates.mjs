#!/usr/bin/env node
// The counters run.mjs stops on, against a state directory cut short at each
// stage.
//
// A gate is only worth having if it counts the right key. Every one of these
// reads a JSON file written by a different stage, and a counter that quietly
// returns 0 - wrong key, wrong nesting, a field that moved - turns a gate into
// a stage that always stops, which is exactly as useless as no gate at all.
// The opposite mistake is worse: a counter that returns the number of ENTRIES
// rather than the number of USABLE entries reports 943 for a stage that
// produced 18, and the run carries on to ship fifteen pictures.
//
// So each fixture below is a real stage's output shape with a known number of
// usable rows and a known number of unusable ones, and the assertion is that
// the counter finds the usable ones and only those.
//
//   node scripts/visual/test/gates.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { concreteCount, searchableCount, candidateCount, scoredCount, clearCount,
    needFor } from '../lib/gates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '..', 'state', 'test-gates');

let failures = 0;
function ok(cond, what, detail) {
    console.log((cond ? '  ok   ' : '  FAIL ') + what + (detail ? ' -> ' + detail : ''));
    if (!cond) failures++;
}

function write(file, entries) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, file), JSON.stringify({ v: 1, entries }, null, 2));
}

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

// ---- nothing there at all ---------------------------------------------------
//
// The state of a machine that has never run the pipeline, and of one where a
// stage died before writing anything. Both have to read as zero rather than
// throw: a gate that crashes on a missing file turns "stage 03 has not run yet"
// into a stack trace.
console.log('\na state directory with nothing in it');
ok(concreteCount(DIR) === 0, 'no classification.json reads as zero, not an error');
ok(searchableCount(DIR) === 0, 'no queries.json reads as zero');
ok(candidateCount(DIR) === 0, 'no candidates.json reads as zero');
ok(scoredCount(DIR) === 0 && clearCount(DIR) === 0, 'no ranked.json reads as zero');

// ---- stage 01 ---------------------------------------------------------------
console.log('\nstage 01: what may carry a photograph');
write('classification.json', {
    'anchor-1111': { kind: 'concrete', source: 'norms' },
    'beacon-2222': { kind: 'concrete', source: 'llm' },
    'doubt-3333': { kind: 'abstract', source: 'norms' },
    'growth-4444': { kind: 'abstract', source: 'llm' },
    'method-5555': { kind: 'abstract', source: 'pos' }
});
ok(concreteCount(DIR) === 2, 'concrete entries are counted, abstract ones are not',
    'got ' + concreteCount(DIR) + ' of 5 entries');

// ---- stage 02 ---------------------------------------------------------------
//
// The shape that caused this whole exercise. An entry the model refused is
// depictable:false with an empty query - a real answer, and not a word stage 03
// can visit. An entry it never answered for is simply absent. Counting rows
// instead of usable rows reports five where the truth is two.
console.log('\nstage 02: words with something to search for');
write('queries.json', {
    'anchor-1111': { depictable: true, query: 'ship anchor on a dock' },
    'beacon-2222': { depictable: true, query: 'lighthouse beacon at night' },
    'doubt-3333': { depictable: false, query: '', reason: 'abstract' },
    'method-5555': { depictable: true, query: '' },
    'growth-4444': { depictable: false, query: 'plant growing' }
});
ok(searchableCount(DIR) === 2, 'only entries with BOTH a yes and a query count',
    'got ' + searchableCount(DIR) + ' of 5 entries');

// ---- stage 03 ---------------------------------------------------------------
//
// An entry with an empty candidates array is the archives answering "nothing
// for this word", which is how a rate-limited source looks from here. It is a
// row in the file either way.
console.log('\nstage 03: words with a candidate picture');
write('candidates.json', {
    'anchor-1111': { query: 'x', candidates: [{ file: 'candidates/a.img' }, { file: 'candidates/b.img' }] },
    'beacon-2222': { query: 'y', candidates: [{ file: 'candidates/c.img' }] },
    'method-5555': { query: 'z', candidates: [] },
    'doubt-3333': { query: 'w' }
});
ok(candidateCount(DIR) === 2, 'an entry the archives had nothing for does not count',
    'got ' + candidateCount(DIR) + ' of 4 entries');

// ---- stage 04 ---------------------------------------------------------------
console.log('\nstage 04: words whose best candidate cleared');
write('ranked.json', {
    'anchor-1111': { best: 0.31, anyClear: true },
    'beacon-2222': { best: 0.28, anyClear: true },
    'method-5555': { best: 0.19, anyClear: false },
    'doubt-3333': { best: 0.17, anyClear: false }
});
ok(scoredCount(DIR) === 4, 'every scored entry is counted as scored');
ok(clearCount(DIR) === 2, 'only the ones that cleared count as clear',
    'got ' + clearCount(DIR) + ' of 4 scored');

// ---- what a gate demands ----------------------------------------------------
//
// The rule that decides whether a run is worth continuing, stated once so both
// the target and the no-target case can be checked against it.
console.log('\nhow many a stage has to hand on');
ok(needFor(800, 943, 0.5) === 800,
    'under a target, the target itself is the floor - fewer queries than pictures');
ok(needFor(null, 943, 0.25) === 236,
    'without one, the test is a proportion of what the stage was given',
    'got ' + needFor(null, 943, 0.25));
ok(needFor(null, 0, 0.25) === 0, 'a stage given nothing is not held to anything');
ok(needFor(800, 18, 0.5) === 800,
    'and a target is not softened by a stage having little to work with');

// The gate that would have caught the run this was written for: 943 words
// eligible, queries for 18 of them, a target of 800.
ok(18 < needFor(800, 943, 0.25), 'queries for 18 of 943 against --target 800 stops the run');
// And the run that must NOT be stopped: stage 02 refusing a lot of a widened
// pool is stage 02 doing its job, not stage 02 failing.
ok(!(400 < needFor(null, 943, 0.25)),
    'queries for 400 of 943 with no target carries on rather than stopping');

if (!process.env.MERID_KEEP) fs.rmSync(DIR, { recursive: true, force: true });
console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
process.exit(failures ? 1 : 0);
