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
    uncoveredCount, needFor, worstStep, reachBySource, fetchReport } from '../lib/gates.mjs';

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

// ---- stage 02b: the count that decides whether anything ships at all --------
//
// Coverage is the one gate whose failure is total. Below 90% the extension's
// own test is red, and ship.mjs will not push while it is - so a perfect
// artwork run with a half-finished 02b puts nothing on the repository. Three
// sources cover an entry, and this has to agree with the two that stage 06 uses
// an hour later or the check is worthless.
console.log('\nstage 02b: entries with something to draw');
const CORPUS = ['a-1111', 'b-2222', 'c-3333', 'd-4444', 'e-5555', 'f-6666'];
fs.writeFileSync(path.join(DIR, 'iconmap.json'), JSON.stringify({
    v: 1, entries: { 'a-1111': 'growth', 'b-2222': 'doubt' }
}));
fs.writeFileSync(path.join(DIR, 'queries.json'), JSON.stringify({
    v: 1,
    entries: {
        'c-3333': { depictable: true, query: 'x', kind: 'object' },
        'd-4444': { depictable: true, query: 'y', kind: 'action' },
        // Searched for, and stage 02 recorded no kind - so if this one ends
        // without a photograph there is nothing to draw for it.
        'e-5555': { depictable: true, query: 'z' },
        // Refused, and 02b has not given it a concept either.
        'f-6666': { depictable: false, query: '' }
    }
}));
const cov = uncoveredCount(DIR, CORPUS);
ok(cov.corpus === 6 && cov.covered === 4 && cov.uncovered === 2,
    'a concept from 02b or a kind from 02 counts; neither does not',
    cov.covered + ' of ' + cov.corpus + ' covered');
ok(Math.ceil(cov.corpus * 0.90) === 6 && cov.covered < 6,
    'and 4 of 6 is under the 90% the extension test enforces');

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

// ---- which archive, not just "the archives" ----------------------------------
//
// Three archives fail for three different reasons and are fixed by three
// different things. "The archives are the bottleneck" is a diagnosis nobody can
// act on; "pexels reached 0" is a missing key.
console.log('\nwhich archive reached which words');
fs.writeFileSync(path.join(DIR, 'candidates.json'), JSON.stringify({
    v: 1,
    entries: {
        'a-1111': { candidates: [{ source: 'wikimedia' }, { source: 'wikimedia' }] },
        'b-2222': { candidates: [{ source: 'wikimedia' }, { source: 'openverse' }] },
        'c-3333': { candidates: [{ source: 'openverse' }] },
        'd-4444': { candidates: [] }
    }
}));
const reach = reachBySource(DIR);
ok(reach.wikimedia === 2,
    'an archive is counted once per entry, not once per picture',
    'wikimedia ' + reach.wikimedia + ' (it supplied three candidates over two entries)');
ok(reach.openverse === 2, 'and every archive that reached an entry is counted');
ok(!reach.pexels,
    'an archive that reached nothing is absent, which is the thing worth seeing',
    JSON.stringify(reach));

// ---- why an archive reached few words ---------------------------------------
//
// Reach alone cannot tell a rate limit from an empty archive, and the two want
// opposite things done about them: one is a budget to raise, the other is
// nothing anybody can configure. Sending somebody to fetch a token for the
// second is an errand that cannot work.
console.log('\nwhy an archive reached what it reached');
ok(Object.keys(fetchReport(DIR)).length === 0,
    'no report yet reads as empty rather than throwing');

fs.writeFileSync(path.join(DIR, 'fetch-report.json'), JSON.stringify({
    v: 1,
    entries: 30,
    sources: {
        wikimedia: { reach: 12, enabled: true, asked: 30, skipped: 0, refused: 0 },
        openverse: { reach: 6, enabled: true, asked: 30, skipped: 0, refused: 0 },
        pexels: { reach: 2, enabled: true, asked: 2, skipped: 28, refused: 0 }
    }
}));
const report = fetchReport(DIR).sources;
ok(report.openverse.asked === 30 && report.openverse.refused === 0,
    'an archive asked every time and never refused simply had nothing',
    'openverse reached ' + report.openverse.reach + ' of 30, asked 30, refused 0');
ok(report.pexels.skipped === 28,
    'while a budget that ran out is a different thing entirely, and says so',
    'pexels asked ' + report.pexels.asked + ', skipped ' + report.pexels.skipped);

// ---- which step lost them ---------------------------------------------------
//
// The report that sends somebody off to spend an hour. Getting it wrong is
// worse than saying nothing: the first version compared "has a candidate"
// against the whole eligible pool, decided the archives were at fault, and
// recommended fetching more candidates - for words stage 02 had refused and no
// archive had ever been asked about.
console.log('\nwhere a run loses its pictures');

// The shape that caused it. 49 eligible, 9 with a candidate - which looks like
// an archive failure end-to-end, and is not: stage 02 only sent 11 of them.
const modelHeavy = worstStep({ pool: 49, searchable: 11, withCand: 9, clear: 7 });
ok(modelHeavy.name === 'the MODEL',
    'a model that refuses most of the pool is not an archive failure',
    modelHeavy.name + ': ' + modelHeavy.got + ' of ' + modelHeavy.of);
ok(modelHeavy.got === 11 && modelHeavy.of === 49,
    'and it is reported against the step it belongs to, not against the corpus');

// The same end-to-end numbers, the opposite cause: stage 02 sent nearly
// everything and the archives came back empty.
const archiveHeavy = worstStep({ pool: 49, searchable: 44, withCand: 9, clear: 7 });
ok(archiveHeavy.name === 'the ARCHIVES',
    'the same 9 of 49 IS an archive failure when the model sent them all',
    archiveHeavy.name + ': ' + archiveHeavy.got + ' of ' + archiveHeavy.of);

const scoringHeavy = worstStep({ pool: 49, searchable: 45, withCand: 42, clear: 4 });
ok(scoringHeavy.name === 'the SCORING',
    'and a bar nothing clears is the scoring, however well the fetch went',
    scoringHeavy.name + ': ' + scoringHeavy.got + ' of ' + scoringHeavy.of);

// Worst survival RATE, not worst headcount. Here the model drops fifty words
// and the scoring drops forty-one, so by headcount the model looks worse - but
// the model still passes half of what it sees while the scoring passes under a
// tenth. The scoring is the thing to go and fix.
const rate = worstStep({ pool: 100, searchable: 50, withCand: 45, clear: 4 });
ok(rate.name === 'the SCORING' && rate.got === 4 && rate.of === 45,
    'the step that keeps the smallest share wins, not the one that loses the most',
    rate.name + ': ' + rate.got + ' of ' + rate.of + ' (the model lost 50, this lost 41)');

// A measurement taken before stage 02 was recorded separately must not be
// dressed up as one that was.
const old = worstStep({ pool: 49, withCand: 9, clear: 7 });
ok(old && old.complete === false,
    'an older measurement says it cannot separate stage 02', JSON.stringify(old));
ok(worstStep({ pool: 0, withCand: 0, clear: 0 }) === null,
    'and nothing at all is null rather than a guess');

if (!process.env.MERID_KEEP) fs.rmSync(DIR, { recursive: true, force: true });
console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
process.exit(failures ? 1 : 0);
