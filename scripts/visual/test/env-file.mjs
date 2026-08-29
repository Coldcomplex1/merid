#!/usr/bin/env node
// Keys read from a file, so a three-hour run can be finished tomorrow.
//
// The failure this covers is not exotic - it is the one that stopped a run
// dead: "GEMINI_API_KEY is not set in this terminal" on a machine where the key
// had been set, in a window that was since closed, or under the plural name the
// repository's own .env.example documents. A run that has to pause overnight
// for a quota to reset meets it every time.
//
// Two properties matter more than the parsing. The environment has to WIN, so
// that a one-off override still overrides; and every stage has to see it, not
// only the ones run.mjs drives - which is why the loader lives in the module
// they all import rather than in run.mjs.
//
// MERID_ENV_FILE points the loader at this test's fixture. Writing a real .env
// at the repository root would mean moving the reader's own keys aside and
// hoping to put them back, on a file that cannot be regenerated.
//
//   node scripts/visual/test/env-file.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DIR = path.join(HERE, '..', 'state', 'test-env');
const FIXTURE = path.join(DIR, 'env-fixture');

let failures = 0;
function ok(cond, what, detail) {
    console.log((cond ? '  ok   ' : '  FAIL ') + what + (detail ? ' -> ' + detail : ''));
    if (!cond) failures++;
}

/**
 * What a child process sees, asked of the module the stages import.
 *
 * A child rather than an import here: the loader runs once, at module
 * evaluation, so a test in this process could only ever observe the first
 * answer. Every case needs a fresh process, which is also exactly how a stage
 * meets it.
 */
function seen(names, env = {}) {
    const code = 'import("' + path.join(ROOT, 'scripts/visual/lib/entries.mjs').split(path.sep).join('/') +
        '").then(m => console.log(JSON.stringify({' +
        'env: Object.fromEntries(' + JSON.stringify(names) + '.map(n => [n, process.env[n] ?? null])),' +
        'from: m.FROM_DOTENV })))';
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: ROOT, encoding: 'utf8',
        // A clean slate: the keys under test must come from the file or from
        // what this call puts there, never from the machine running the test.
        env: (() => {
            const base = { ...process.env, MERID_ENV_FILE: FIXTURE };
            for (const n of names) delete base[n];
            return { ...base, ...env };
        })()
    });
    try { return JSON.parse(r.stdout); }
    catch (e) { return { env: {}, from: [], error: (r.stdout || '') + (r.stderr || '') }; }
}

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

// ---- the ordinary case ------------------------------------------------------
console.log('\na file with keys in it');
fs.writeFileSync(FIXTURE, [
    '# The pipeline keys, written once.',
    '',
    'GEMINI_API_KEY=AQ.Ab-from-the-file',
    'PEXELS_API_KEY = spaced-out',
    "OPENVERSE_TOKEN='single quoted'",
    'export MERID_CLIP_FLOOR="0.18"',
    'MALFORMED LINE WITH NO EQUALS',
    ''
].join('\n'));

const NAMES = ['GEMINI_API_KEY', 'PEXELS_API_KEY', 'OPENVERSE_TOKEN', 'MERID_CLIP_FLOOR'];
const got = seen(NAMES);
ok(got.env.GEMINI_API_KEY === 'AQ.Ab-from-the-file',
    'a key in the file reaches a stage that never saw a terminal',
    got.error || String(got.env.GEMINI_API_KEY));
ok(got.env.PEXELS_API_KEY === 'spaced-out', 'spaces around the = are not part of the value');
ok(got.env.OPENVERSE_TOKEN === 'single quoted', 'one layer of quotes is stripped');
ok(got.env.MERID_CLIP_FLOOR === '0.18', 'an export prefix is tolerated, and double quotes too');
ok(Array.isArray(got.from) && got.from.length === 4,
    'and it reports which names it set, for the preflight to print',
    JSON.stringify(got.from));

// ---- the property that keeps a one-off override working ---------------------
//
// Without this, `$env:MERID_CLIP_FLOOR='0.16'` for a single run would be
// silently replaced by whatever the file said last week - which is worse than
// not having the file at all, because it looks like it worked.
console.log('\nthe terminal wins');
const over = seen(NAMES, { GEMINI_API_KEY: 'from-the-terminal', MERID_CLIP_FLOOR: '0.16' });
ok(over.env.GEMINI_API_KEY === 'from-the-terminal',
    'a name already set is left alone', String(over.env.GEMINI_API_KEY));
ok(over.env.MERID_CLIP_FLOOR === '0.16',
    'including a setting meant for one run only', String(over.env.MERID_CLIP_FLOOR));
ok(over.env.PEXELS_API_KEY === 'spaced-out',
    'and the names it did not set still come from the file');
ok(!over.from.includes('GEMINI_API_KEY'),
    'what it reports having set stays true', JSON.stringify(over.from));

// An empty value is a name that is not really set - a PowerShell window where
// $env:GEMINI_API_KEY='' was typed by accident, or a variable exported hollow.
// Treating it as "already set" would leave the run keyless with a file full of
// keys sitting next to it.
const hollow = seen(NAMES, { GEMINI_API_KEY: '' });
ok(hollow.env.GEMINI_API_KEY === 'AQ.Ab-from-the-file',
    'a name set to nothing is filled in rather than left hollow',
    String(hollow.env.GEMINI_API_KEY));

// ---- no file, and an unreadable one -----------------------------------------
//
// Neither is a reason to stop a three-hour run. Both used to be impossible to
// hit because there was no file; both are now on the path of every stage.
console.log('\nnothing to read');
fs.rmSync(FIXTURE, { force: true });
const none = seen(NAMES);
ok(none.env.GEMINI_API_KEY === null && Array.isArray(none.from) && none.from.length === 0,
    'no file at all is silence, not an error', none.error || 'clean');

fs.mkdirSync(FIXTURE, { recursive: true });     // a directory where a file should be
const wrong = seen(NAMES);
ok(Array.isArray(wrong.from) && wrong.from.length === 0,
    'and neither is something unreadable in its place', wrong.error || 'clean');

if (!process.env.MERID_KEEP) fs.rmSync(DIR, { recursive: true, force: true });
console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
process.exit(failures ? 1 : 0);
