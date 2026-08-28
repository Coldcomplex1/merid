#!/usr/bin/env node
// Stage 02 when the model stops answering.
//
// This is the failure that produced fifteen pictures against a target of eight
// hundred, and it is invisible from inside the stage's own summary. `usable`
// counts the queries ON DISK, cache included - so on a re-run after the pool
// was widened, a handful of old answers keep it comfortably above zero while
// every one of the nine hundred new words goes unanswered. The stage exited 0,
// stage 03 found a handful of words of work, and the shortage surfaced four
// stages later as a picture count nobody could explain.
//
// Not answering is not an answer. The stage has to say so and stop.
//
// No network and no key: --offline produces exactly the same shape as an
// exhausted quota - every batch comes back empty - which is the point of
// testing it this way rather than mocking an HTTP 429.
//
//   node scripts/visual/test/query-silence.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEntries } from '../lib/entries.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DIR = path.join(HERE, '..', 'state', 'test-query-silence');

let failures = 0;
function ok(cond, what, detail) {
    console.log((cond ? '  ok   ' : '  FAIL ') + what + (detail ? ' -> ' + detail : ''));
    if (!cond) failures++;
}

function write(file, value) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, file), JSON.stringify(value, null, 2));
}

/** Stage 02, offline, against the fixture state directory. */
function query() {
    const r = spawnSync(process.execPath, ['scripts/visual/02-query.mjs', '--offline'],
        { cwd: ROOT, env: { ...process.env, MERID_STATE: DIR }, encoding: 'utf8' });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

fs.rmSync(DIR, { recursive: true, force: true });
const entries = loadEntries();
const pool = entries.slice(0, 40);
if (pool.length < 40) throw new Error('need 40 entries to build the fixture');

// ---- the real shape: a few cached answers, a widened pool -------------------
console.log('\na widened pool the model answers nothing for');
write('classification.json', {
    v: 1,
    entries: Object.fromEntries(pool.map(e => [e.slug, { kind: 'concrete', source: 'norms' }]))
});
// Five words already have a query from an earlier run, exactly as a resumed run
// would. These are what used to hold `usable` above zero and let the stage pass.
const cached = Object.fromEntries(pool.slice(0, 5).map(e =>
    [e.slug, { depictable: true, query: e.word + ' photograph', negative: [], kind: 'object' }]));
write('queries.json', { v: 1, entries: cached });

const silent = query();
ok(silent.status !== 0,
    'the stage fails when most of the batch comes back with nothing',
    'exit status was ' + silent.status);
ok(/answered \d+ of \d+ entries/.test(silent.out),
    'it says how many of the batch answered');
ok(/--offline never asks the model/.test(silent.out),
    'and names --offline as the cause when that is the cause');
ok(!/no searchable queries were produced/.test(silent.out),
    'not the "nothing at all" message: there ARE queries, from the earlier run');

// The queries already on disk have to survive it. This is the file a resumed
// run builds on, and a stage that failed by truncating it would turn one bad
// afternoon into a repeat of every request that ever succeeded.
const after = JSON.parse(fs.readFileSync(path.join(DIR, 'queries.json'), 'utf8'));
ok(Object.keys(after.entries).length >= 5,
    'the queries from the earlier run are still there afterwards',
    Object.keys(after.entries).length + ' entries');

// ---- nothing cached at all --------------------------------------------------
//
// The same silence with an empty queries.json is the older, blunter failure,
// and it keeps its own message: there is nothing for stages 03-05 to do at all.
console.log('\nthe same silence with nothing cached');
fs.rmSync(path.join(DIR, 'queries.json'), { force: true });
const empty = query();
ok(empty.status !== 0, 'still fails');
ok(/no searchable queries were produced/.test(empty.out),
    'and says the stages after it have nothing to do');

// ---- a small run is not held to it ------------------------------------------
//
// MERID_ONLY restricts every stage to a handful of words, which is how the
// trial run works. Ten unanswered entries out of ten is a broken key; three out
// of three is somebody trying five words with --offline to see what happens,
// and failing that is noise.
console.log('\na handful of words is not enough silence to judge');
const few = pool.slice(0, 3).map(e => e.word).join(',');
const r = spawnSync(process.execPath, ['scripts/visual/02-query.mjs', '--offline'],
    { cwd: ROOT, env: { ...process.env, MERID_STATE: DIR, MERID_ONLY: few }, encoding: 'utf8' });
ok(!/answered \d+ of \d+ entries. The rest got nothing back/.test((r.stdout || '') + (r.stderr || '')),
    'three unanswered words are not reported as the model going silent');

if (!process.env.MERID_KEEP) fs.rmSync(DIR, { recursive: true, force: true });
console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
process.exit(failures ? 1 : 0);
