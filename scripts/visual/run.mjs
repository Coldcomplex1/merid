#!/usr/bin/env node
// The whole artwork pipeline, end to end, in one command.
//
// There are six stages, two API keys, a Python environment and a browser tab
// you sit in front of for ten minutes. Individually none of them is hard.
// Together they are a sequence you have to get right in one sitting, and the
// old instructions for it ran to a page and a half of a document nobody reads
// twice. This is that page and a half, executed.
//
// Two rules it keeps:
//
//   Say what is missing BEFORE anything runs. The old failure was finding out
//   at minute 40, three stages deep, that sharp was never installed - a
//   thirty-second fix discovered after the expensive part. Every prerequisite
//   is checked while it is still cheap to fix.
//
//   Stop at the first thing that breaks, and say what to do about it. Never
//   carry on with a stage's output missing, because the stage after it will
//   produce a smaller, quieter, wronger version of the same result.
//
//   node scripts/visual/run.mjs                trial-free full run, review 50
//   node scripts/visual/run.mjs --sample 80    look at more of them
//   node scripts/visual/run.mjs --all          review every eligible entry
//   node scripts/visual/run.mjs --no-photos    symbols only: no Pexels, no CLIP
//   node scripts/visual/run.mjs --dry-run      do everything except commit/push
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HERE = 'scripts/visual';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const NO_PHOTOS = argv.includes('--no-photos');
const REVIEW_ALL = argv.includes('--all');
const SAMPLE = (() => {
    const i = argv.indexOf('--sample');
    if (i < 0) return REVIEW_ALL ? null : '50';
    const n = Number(argv[i + 1]);
    if (!Number.isFinite(n) || n < 5) {
        console.error('[run] --sample needs a number of at least 5');
        process.exit(1);
    }
    return String(n);
})();

// npm on Windows is npm.cmd and spawnSync will not start a .cmd without a
// shell. Only npm gets one: git's arguments include a commit message with
// spaces in it, which a shell would take apart.
const NPM = { shell: process.platform === 'win32' };

let step = 0;
const say = m => console.log(m);
const head = m => {
    step++;
    say('\n=== ' + step + '. ' + m + ' ' + '='.repeat(Math.max(0, 56 - m.length)));
};

function stop(why, ...fix) {
    say('\nSTOPPED: ' + why);
    if (fix.length) { say('\nWhat to do:'); for (const f of fix) say('  ' + f); }
    process.exit(1);
}

/** Run a command, streaming its output. Returns the raw result. */
function run(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { cwd: opts.cwd || ROOT, stdio: 'inherit', shell: !!opts.shell });
}

/** Run a stage and stop the chain if it fails. */
function stage(label, cmd, args) {
    head(label);
    const r = run(cmd, args);
    if (r.error) stop('could not run ' + cmd + ': ' + r.error.message);
    if (r.status !== 0) {
        stop(label + ' failed - read the message above. It names the thing to fix.',
            'when you have fixed it, run this same command again;',
            'every stage resumes from where it stopped, and cached model answers cost no quota');
    }
}

const git = (...args) => {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    return r.status === 0 ? String(r.stdout || '').trim() : null;
};

/** The first of these interpreters that exists, or null. */
function findPython() {
    const tries = process.platform === 'win32'
        ? [['py', ['-3']], ['python', []]]
        : [['python3', []], ['python', []]];
    for (const [cmd, pre] of tries) {
        const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8' });
        if (r.status === 0) return { cmd, pre };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Preflight. Everything that can be known before a single API call is made.
// ---------------------------------------------------------------------------

head('Check everything before spending an hour on it');

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch === null) stop('this is not a git repository', 'cd into the merid folder first');
say('branch: ' + branch);

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
    stop('Node ' + process.versions.node + ' - this repository is built on Node 22',
        'install the current LTS from nodejs.org');
}
say('node: ' + process.versions.node);

const problems = [];
const warnings = [];

// The one key nothing works without. Two stages classify with it and a third
// assigns every concept symbol; without it there is no index worth shipping.
const gem = process.env.GEMINI_API_KEY || '';
if (!gem) {
    problems.push([
        'GEMINI_API_KEY is not set in this terminal',
        process.platform === 'win32'
            ? "$env:GEMINI_API_KEY='your-key'"
            : "export GEMINI_API_KEY='your-key'",
        'get one at https://aistudio.google.com/apikey'
    ]);
} else if (!gem.startsWith('AIzaSy')) {
    // The trap that has cost the most time: an ephemeral Live API token looks
    // like a key, is accepted by the shell, and is rejected by every call.
    problems.push([
        'GEMINI_API_KEY does not start with AIzaSy, so it is not an API key',
        'a key beginning "AQ." is an ephemeral Live API token and cannot call this API',
        'make a real one at https://aistudio.google.com/apikey'
    ]);
} else {
    say('gemini key: present');
}

if (NO_PHOTOS) {
    say('--no-photos: stages 03, 04 and 05 are skipped. Every entry takes a symbol.');
} else {
    // Not fatal. Openverse and Wikimedia need no key at all, and between them
    // they carry most of a run; Pexels only widens the pool.
    if (!process.env.PEXELS_API_KEY) {
        warnings.push('PEXELS_API_KEY is not set - Openverse and Wikimedia still run, ' +
            'but with a smaller pool to choose from');
    } else {
        say('pexels key: present');
    }

    try {
        require.resolve('sharp');
        say('sharp: installed');
    } catch (e) {
        problems.push([
            'sharp is not installed, and stage 06 needs it to encode the pictures',
            'run this in the REPOSITORY ROOT, not in merid-extension-final:',
            '  npm i -D sharp',
            'use -D, not --no-save: npm removes earlier --no-save packages'
        ]);
    }

    const py = findPython();
    if (!py) {
        problems.push([
            'no python3 on PATH, and stage 04 scores the candidates with it',
            'install Python 3, then:',
            '  python3 -m venv .venv && source .venv/bin/activate',
            '  pip install open_clip_torch pillow torch',
            'or run without photographs at all:  node ' + HERE + '/run.mjs --no-photos'
        ]);
    } else {
        const probe = spawnSync(py.cmd, [...py.pre, '-c', 'import open_clip, torch, PIL'],
            { encoding: 'utf8' });
        if (probe.status !== 0) {
            problems.push([
                'python is here but open_clip/torch/pillow are not, and stage 04 needs all three',
                '  pip install open_clip_torch pillow torch',
                'stage 05 reads stage 04\'s output and will not run without it, so this is not',
                'a stage that can simply be skipped - the alternative is symbols only:',
                '  node ' + HERE + '/run.mjs --no-photos'
            ]);
        } else {
            say('python + CLIP: ready (' + py.cmd + ')');
        }
    }
}

if (problems.length) {
    say('\n' + '='.repeat(62));
    say(problems.length + ' thing(s) to fix before this can run:');
    for (const [title, ...lines] of problems) {
        say('\n  * ' + title);
        for (const l of lines) say('      ' + l);
    }
    say('\nNothing has been run and nothing has been changed.');
    say('='.repeat(62));
    process.exit(1);
}

for (const w of warnings) say('NOTE: ' + w);

// ---------------------------------------------------------------------------
// The stages.
// ---------------------------------------------------------------------------

stage('Classify: what can a photograph honestly mean? (~5 min)',
    'node', [HERE + '/01-classify.mjs']);

stage('Query: what to go looking for (~5 min)',
    'node', [HERE + '/02-query.mjs']);

// The stage that decides how most cards look. Seven entries in eight end up
// wearing a concept symbol, so this is the main path, not the fallback.
stage('Concepts: a symbol for every abstract entry (~15 min)',
    'node', [HERE + '/02b-iconmap.mjs']);

if (!NO_PHOTOS) {
    stage('Fetch: candidate photographs from three archives (~40-60 min)',
        'node', [HERE + '/03-fetch.mjs']);

    const py = findPython();
    stage('Score: CLIP, every candidate against its own query (~15-25 min)',
        py.cmd, [...py.pre, HERE + '/04-rank.py']);

    // ---- the part with a person in it -------------------------------------
    head('Review: ' + (REVIEW_ALL ? 'every eligible entry' : SAMPLE + ' entries, ~10 min'));
    say('A browser tab opens on a queue of words with three candidate pictures each.');
    say('Press 1/2/3 to pick, Enter for the first, x for none of them.');
    say('Press "Finish" on the page when you are done and this carries straight on.\n');
    const reviewArgs = [HERE + '/05-review.mjs'];
    if (!REVIEW_ALL && SAMPLE) reviewArgs.push('--sample', SAMPLE);
    const rv = run('node', reviewArgs);
    // Ctrl-C is a legitimate way to end the reviewing and always has been - the
    // instructions said so for months - so it is not a failure here. It arrives
    // as SIGINT, or as status 130 through a shell.
    const interrupted = rv.signal === 'SIGINT' || rv.status === 130 || rv.status === null;
    if (!interrupted && rv.status !== 0) {
        stop('the review stage failed - read the message above');
    }

    // ---- and the part that protects it ------------------------------------
    //
    // Straight after the reviewing, before anything else can go wrong.
    // decisions.json is the only file in this pipeline a machine cannot make
    // again: everything else in state/ is a cache of a computation. This is an
    // hour of somebody's attention, and it has lived in an uncommitted folder
    // on one machine before.
    head('Commit the reviewing, immediately');
    const decisions = path.join(ROOT, 'scripts', 'visual', 'state', 'decisions.json');
    if (!fs.existsSync(decisions)) {
        stop('no decisions.json after the review stage - nothing was reviewed',
            'run it on its own and check the queue:  node ' + HERE + '/05-review.mjs');
    }
    let reviewed = 0;
    try { reviewed = Object.keys(JSON.parse(fs.readFileSync(decisions, 'utf8'))).length; }
    catch (e) { stop('decisions.json is not readable JSON - do not overwrite it, send it to me'); }
    say(reviewed + ' decisions on disk');

    const rel = 'scripts/visual/state/decisions.json';
    if (DRY) {
        say('dry run - not committing');
    } else if (!git('status', '--porcelain', '--', rel)) {
        say('already committed and unchanged');
    } else {
        // -f because state/ is gitignored with an explicit exception for this
        // one file; -f makes the exception hold whatever the ignore rules do.
        git('add', '-f', rel);
        const r = run('git', ['commit', '-m', 'Record which picture was chosen for each word']);
        if (r.status !== 0) say('the commit did not go through - check `git status` before going on');
    }
}

// ---------------------------------------------------------------------------
// Build, verify, push. ship.mjs already does this half properly - it knows how
// to get past the package.json edit that `npm i -D sharp` leaves behind, it
// asks stage 06 what cutoff the reviewing actually supports, and it refuses to
// push artwork the extension's own tests or build reject.
// ---------------------------------------------------------------------------

head('Build the artwork, check it, and push it');
const shipArgs = [HERE + '/ship.mjs'];
if (DRY) shipArgs.push('--dry-run');
const ship = run('node', shipArgs);
if (ship.status !== 0) process.exit(ship.status || 1);

say('\n' + '='.repeat(62));
say('Done.');
say('');
say('  Load the extension:  chrome://extensions -> Developer mode -> Load unpacked');
say('                       -> ' + path.join(ROOT, 'merid-extension-final'));
say('  Upload to the store: merid-extension-final/dist.zip');
say('');
say('Worth two minutes before you upload: hover "delegate", "buttress" and');
say('"yoke" in BOTH the SAT and the C1/C2 dataset settings. Each meaning must');
say('get a different picture - it is the part of this design most likely to be');
say('quietly wrong.');
say('='.repeat(62));
