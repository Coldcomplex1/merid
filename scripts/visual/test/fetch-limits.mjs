#!/usr/bin/env node
// What stage 03 does when a source says no, against the real 03-fetch.mjs.
//
// This is the failure that does not look like one. A source that runs out of
// allowance still returns HTTP - just 429 - so nothing crashes, nothing is
// logged as an error, and every candidate that does arrive is fine. What used
// to happen instead is that the run got FOUR HOURS LONGER: the loop slept
// RATE_WAIT_MS, retried, was refused again, and did the whole thing over on the
// next word. Four hundred words, a minute each.
//
// Nobody would have caught that by reading the code, because the sleep is
// correct in isolation and the arithmetic that makes it fatal lives in a README
// (Pexels' free tier is 200 requests an HOUR; this file used to ask at 180 a
// MINUTE). So it is measured: run 03 against archives that refuse, and time it.
//
// Nothing is mocked inside stage 03. It is spawned as itself, pointed at
// test/fake-archives.mjs through the MERID_*_URL variables it already accepts,
// and its real output is read back.
//
//   node scripts/visual/test/fetch-limits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startFakeArchives } from './fake-archives.mjs';
import { loadEntries } from '../lib/entries.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const STATE = path.join(HERE, '..', 'state', 'test-fetch-limits');

// Enough entries that a stall of one rest per entry is unmistakable, few enough
// that the honest path stays quick.
const N = 12;
const REST_MS = 700;

// The two sources this test is not measuring are given a rate that never gets
// in the way, so the only thing separating a fast run from a slow one is what
// stage 03 does about being refused. The real defaults are exercised by the
// budget case at the end.
const FAST = { MERID_WIKIMEDIA_PER_MIN: '6000', MERID_OPENVERSE_PER_MIN: '6000' };

let failures = 0;
function ok(cond, what, detail) {
    console.log((cond ? '  ok   ' : '  FAIL ') + what + (detail ? ' -> ' + detail : ''));
    if (!cond) failures++;
}

/**
 * A queries.json for the first N entries of the real corpus.
 *
 * Straight from loadEntries - the very function stage 03 filters against - so
 * every slug written here survives that filter. Building the rows from the CSV
 * by hand instead cost an hour: loadEntries dedupes on the headword across
 * three datasets, so one of twelve hand-picked C1 rows was shadowed, never
 * reached stage 03, and showed up as an off-by-one in three assertions that
 * were each about something else entirely.
 */
function writeQueries() {
    fs.rmSync(STATE, { recursive: true, force: true });
    fs.mkdirSync(STATE, { recursive: true });

    const entries = {};
    for (const entry of loadEntries().slice(0, N)) {
        entries[entry.slug] = {
            depictable: true,
            kind: 'object',
            query: 'a photograph of ' + entry.word,
            negative: []
        };
    }
    fs.writeFileSync(path.join(STATE, 'queries.json'),
        JSON.stringify({ v: 1, entries }, null, 2) + '\n');
    return Object.keys(entries).length;
}

/**
 * Run the real stage 03 against the fake archives.
 *
 * spawn and await, never spawnSync: the archives are an http server in THIS
 * process, and spawnSync blocks this process's event loop until the child
 * exits - so the child's very first request would go unanswered forever and the
 * test would hang instead of failing. Which it did, once.
 */
function runFetch(base, env = {}, { killAfter = N * REST_MS * 3 } = {}) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/visual/03-fetch.mjs'], {
            cwd: ROOT,
            env: {
                ...process.env,
                MERID_STATE: STATE,
                MERID_OPENVERSE_URL: base,
                MERID_WIKIMEDIA_URL: base,
                MERID_PEXELS_URL: base,
                MERID_RATE_WAIT_MS: String(REST_MS),
                PEXELS_API_KEY: 'test-key',
                ...env
            }
        });
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        child.on('error', reject);

        // The regression this file exists for makes stage 03 slow, not broken -
        // and a run that sleeps per entry on a starved budget does not finish in
        // any useful time at all. Without this the whole test hangs, which reads
        // as infrastructure trouble rather than as the answer. Kill it and let
        // the assertions below report a stall as the failure it is.
        const bell = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, killAfter);
        let killed = false;
        child.on('close', status => {
            clearTimeout(bell);
            resolve({
                ms: Date.now() - started, out, status,
                killed,
                ...(killed ? { out: out + '\n[test] killed after ' + killAfter + 'ms' } : {})
            });
        });
    });
}

/**
 * What stage 03 wrote, or nothing if it never got that far.
 *
 * Tolerant on purpose. A run this test kills for stalling has written no
 * candidates.json at all, and throwing here would replace a readable list of
 * failures with one stack trace about a missing file - burying the assertion
 * that actually explains what went wrong.
 */
const candidatesFor = () => {
    try {
        const json = JSON.parse(fs.readFileSync(path.join(STATE, 'candidates.json'), 'utf8'));
        return Object.values(json.entries || {});
    } catch (e) {
        return [];
    }
};

async function main() {
    const wanted = writeQueries();
    console.log('[test] ' + wanted + ' entries, resting a refused source for ' + REST_MS + 'ms\n');

    // ---------------------------------------------------------------------
    // 1. A source that refuses everything must not slow the run down.
    // ---------------------------------------------------------------------
    console.log('Pexels refuses every call:');
    const refusing = await startFakeArchives({ rateLimitPexels: true });
    const a = await runFetch(refusing.base, FAST);
    const callsA = refusing.calls();
    refusing.stop();

    ok(a.status === 0 && !a.killed,
        'stage 03 finished',
        a.killed ? 'KILLED - it was still running after ' + a.ms + 'ms' : 'exit ' + a.status);

    // The old code slept RATE_WAIT_MS on EVERY entry. This is not a benchmark -
    // it separates "rests the source" from "rests the run", which is a factor
    // of N, and the two sources that answer are running at a rate that costs
    // nothing so nothing else is in the measurement.
    const stallCeiling = wanted * REST_MS;
    ok(a.ms < stallCeiling,
        'the run does not sleep once per entry',
        a.ms + 'ms, and one sleep per entry would be >= ' + stallCeiling + 'ms');

    // Refused once or twice, not once per entry: each 429 rests the source for
    // REST_MS, and it is skipped rather than re-asked while it rests.
    ok(callsA.pexelsCalls < wanted,
        'the refused source is not asked again for every entry',
        callsA.pexelsCalls + ' calls over ' + wanted + ' entries');

    // ---------------------------------------------------------------------
    // 2. ...and the other two carry on answering while it rests.
    // ---------------------------------------------------------------------
    ok(callsA.wikimediaCalls === wanted,
        'wikimedia was asked for every entry regardless',
        callsA.wikimediaCalls + '/' + wanted);
    ok(callsA.openverseCalls > 0, 'openverse was asked too', String(callsA.openverseCalls));

    const withCandidates = candidatesFor().filter(e => e.candidates.length > 0).length;
    ok(withCandidates === wanted,
        'every entry still ended up with candidates',
        withCandidates + '/' + wanted);
    const sources = new Set(candidatesFor().flatMap(e => e.candidates.map(c => c.source)));
    ok(!sources.has('pexels'), 'and none of them came from the refused source');
    ok(sources.has('wikimedia') && sources.has('openverse'),
        'they came from the two that answered', [...sources].join(', '));

    ok(/rate-limited, resting it/.test(a.out),
        'the run says which source it rested, and that the others carry on');

    // ---------------------------------------------------------------------
    // 3. A source refused once rejoins; it is not lost for the run.
    // ---------------------------------------------------------------------
    console.log('\nPexels refuses only its first call:');
    writeQueries();
    const flaky = await startFakeArchives({ rateLimitFirstCall: true });
    // Pexels given a rate that never limits it, so the only thing that can keep
    // it away from the later entries is the rest - which is the point. At its
    // real 180/hour the gap between turns is twenty seconds and would hide the
    // rest completely.
    const b = await runFetch(flaky.base, { ...FAST, MERID_PEXELS_PER_HOUR: '36000' });
    flaky.stop();

    ok(b.status === 0 && !b.killed, 'stage 03 finished',
        b.killed ? 'KILLED - still running after ' + b.ms + 'ms' : 'exit ' + b.status);
    const back = candidatesFor()
        .filter(e => e.candidates.some(c => c.source === 'pexels')).length;
    ok(back > 0,
        'the source rejoins after its rest and contributes again',
        back + ' entries have a pexels candidate');

    // ---------------------------------------------------------------------
    // 4. The budget is a budget: an entry is skipped, not waited for.
    // ---------------------------------------------------------------------
    console.log('\nPexels budgeted to one call an hour:');
    writeQueries();
    const slow = await startFakeArchives();
    const c = await runFetch(slow.base, { ...FAST, MERID_PEXELS_PER_HOUR: '1' });
    const callsC = slow.calls();
    slow.stop();

    ok(c.status === 0 && !c.killed, 'stage 03 finished',
        c.killed ? 'KILLED - still running after ' + c.ms + 'ms' : 'exit ' + c.status);
    ok(callsC.pexelsCalls <= 1,
        'a budget of one an hour spends one call, not twelve',
        callsC.pexelsCalls + ' calls');
    ok(c.ms < wanted * REST_MS,
        'and the entries it could not reach cost nothing',
        c.ms + 'ms for ' + wanted + ' entries');
    ok(/pexels/.test(c.out) && /skipped/.test(c.out),
        'the summary says how many entries each source reached');

    report();
}

function report() {
    // MERID_KEEP leaves the fixture behind so a failure can be re-run by hand:
    //   MERID_STATE=scripts/visual/state/test-fetch-limits node scripts/visual/03-fetch.mjs
    if (!process.env.MERID_KEEP) fs.rmSync(STATE, { recursive: true, force: true });
    else console.log('\nfixture kept at ' + path.relative(ROOT, STATE));
    console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
