#!/usr/bin/env node
// Everything between "the artwork is on my disk" and "the artwork is on GitHub",
// in one command.
//
// The steps are not hard, but there are six of them and each has a way of going
// wrong that stops the whole thing: a pull that will not apply because
// `npm i -D sharp` edited package.json, an editor that opens and will not close,
// a cutoff number that has to be copied out of the previous run's output. None
// of that is interesting and all of it has already cost an afternoon.
//
// It stops at the first failure and says what to do. It pushes only if the
// extension's own tests and its build both pass, because a push that breaks the
// build is worse than no push.
//
//   node scripts/visual/ship.mjs             build, verify, commit, push
//   node scripts/visual/ship.mjs --dry-run   do everything except commit/push
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = path.join(ROOT, 'merid-extension-final');
const DRY = process.argv.includes('--dry-run');

let step = 0;
const say = m => console.log(m);
const head = m => { step++; say('\n=== ' + step + '. ' + m + ' ' + '='.repeat(Math.max(0, 56 - m.length))); };

function stop(why, ...fix) {
    say('\nSTOPPED: ' + why);
    if (fix.length) { say('\nWhat to do:'); for (const f of fix) say('  ' + f); }
    process.exit(1);
}

// npm on Windows is npm.cmd, and spawnSync will not run a .cmd without a
// shell - recent Node refuses outright rather than guessing. Without this the
// npm steps never ran at all: no output, no failing test, just a non-zero
// status, which this script then reported as "the tests fail".
//
// Only npm gets the shell. git does not, because one of its arguments is a
// commit message with spaces in it, and a shell would take that apart.
const NPM = { shell: process.platform === 'win32' };

/** Run a command, streaming its output. Returns false rather than throwing. */
function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        cwd: opts.cwd || ROOT, stdio: 'inherit', shell: !!opts.shell
    });
    if (r.error) say('  could not run ' + cmd + ': ' + r.error.message);
    return r.status === 0;
}

/** Run a command and capture its output (still printed). */
function capture(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        cwd: opts.cwd || ROOT, encoding: 'utf8', shell: !!opts.shell
    });
    let out = (r.stdout || '') + (r.stderr || '');
    // A command that could not be started produces no output at all, and
    // reporting that as a test failure sent someone looking for a broken test
    // that did not exist.
    if (r.error) out += '\n' + cmd + ' could not be started: ' + r.error.message;
    process.stdout.write(out);
    return { ok: r.status === 0, out };
}

const git = (...args) => {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    return r.status === 0 ? String(r.stdout || '').trim() : null;
};

// ---------------------------------------------------------------------------

head('Where are we');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch === null) stop('this is not a git repository', 'cd into the merid folder first');
say('branch: ' + branch);

if (git('rev-parse', '--verify', 'MERGE_HEAD') !== null) {
    stop('a merge is still in progress',
        'git commit --no-edit', 'then run this again');
}

const decisions = path.join(ROOT, 'scripts', 'visual', 'state', 'decisions.json');
if (!fs.existsSync(decisions)) {
    stop('no scripts/visual/state/decisions.json - there is nothing to build from',
        'node scripts/visual/05-review.mjs --sample 50');
}
let reviewed = 0;
try { reviewed = Object.keys(JSON.parse(fs.readFileSync(decisions, 'utf8'))).length; } catch (e) { /* shrug */ }
say('review decisions on disk: ' + reviewed);

head('Make the pull possible');
// `npm i -D sharp` edits package.json, and that edit blocks every pull that
// touches it. sharp stays in node_modules either way, so the manifest edit is
// the part to let go of.
for (const f of ['package.json', 'package-lock.json']) {
    const dirty = git('status', '--porcelain', '--', f);
    if (dirty) {
        say('discarding local edit to ' + f + ' (sharp stays installed in node_modules)');
        if (!DRY) git('checkout', '--', f);
    }
}

// The reviewing, committed rather than complained about.
//
// This script exists to be run straight after 05-review.mjs, and 05-review.mjs
// writes exactly one file. Refusing to go on until the reader commits it by
// hand meant the documented sequence - review, then ship - stopped dead every
// single time, on the one file in this pipeline that must never be discarded.
// The advice it printed was even worse than the stop: "git checkout -- <file>"
// on decisions.json throws the reviewing away.
const DECISIONS_REL = 'scripts/visual/state/decisions.json';
if (git('status', '--porcelain', '--', DECISIONS_REL)) {
    let n = 0;
    try {
        n = Object.keys(JSON.parse(
            fs.readFileSync(path.join(ROOT, DECISIONS_REL), 'utf8')) || {}).length;
    } catch (e) { /* counted for the message only */ }
    say('committing the reviewing (' + n + ' decisions) - it cannot be recomputed');
    if (!DRY) {
        // -f: state/ is gitignored with an explicit exception for this file, and
        // -f makes the exception hold whatever the ignore rules do.
        git('add', '-f', DECISIONS_REL);
        if (!run('git', ['commit', '-m', 'Record which picture was chosen for each word'])) {
            stop('could not commit the reviewing - read the message above',
                'check `git status`, then run this again');
        }
    }
}

const stillDirty = (git('status', '--porcelain') || '')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('??'))
    // A dry run says it would commit the reviewing and then does not, so it
    // must not go on to complain about the file it just accounted for -
    // otherwise --dry-run reports a blockage the real run does not have.
    .filter(l => !(DRY && l.includes(DECISIONS_REL)));
if (stillDirty.length) {
    stop('there are other uncommitted changes, and a pull would fight them:\n  ' +
        stillDirty.join('\n  '),
        'commit them:  git add -A && git commit -m "..."',
        'or drop them: git checkout -- <file>   (NOT decisions.json - that is the reviewing)');
}

head('Pull');
// --no-edit so no editor ever opens.
if (!run('git', ['pull', '--no-edit'])) {
    stop('the pull failed - read the message above',
        'if it mentions conflicts: fix the files, git add them, git commit --no-edit');
}

head('Ask stage 06 what cutoff the reviewing supports');
const probe = capture('node', ['scripts/visual/06-build.mjs', '--dry-run']);
if (!probe.ok) stop('stage 06 could not run - read the message above');
const rec = probe.out.match(/--accept-above (0\.\d+)/);
const cutoff = rec ? rec[1] : null;
if (cutoff) {
    say('\ncutoff the sample supports: ' + cutoff);
} else {
    // The quiet path to a build with almost no photographs in it, and the one
    // that actually happened: eleven entries reviewed, no cutoff measurable,
    // nothing accepted unseen, twelve pictures shipped out of six hundred
    // candidates. It used to be one line in the middle of a long run.
    say('');
    say('  ' + '!'.repeat(58));
    say('  No cutoff is safe on this reviewing, so NOTHING will be accepted');
    say('  unseen - only the entries you looked at yourself become pictures.');
    say('');
    say('  Stage 06 needs a spread of about fifty decisions before it can say');
    say('  what an unreviewed entry at a given score is worth. Review more and');
    say('  run this again - the pictures already chosen are kept:');
    say('');
    say('    node scripts/visual/05-review.mjs --sample 80');
    say('    node scripts/visual/ship.mjs');
    say('  ' + '!'.repeat(58));
}

head('Build the artwork');
const args = ['scripts/visual/06-build.mjs'];
if (cutoff) args.push('--accept-above', cutoff);
if (DRY) args.push('--dry-run');
if (!run('node', args)) stop('stage 06 failed - read the message above');

const visDir = path.join(EXT, 'vis');
const pics = fs.existsSync(visDir)
    ? fs.readdirSync(visDir).filter(f => /\.(avif|webp)$/.test(f)).length : 0;
if (!DRY && !pics) {
    stop('stage 06 wrote no pictures',
        'check the output above - most likely nothing cleared stage 04');
}
say('\npictures in vis/: ' + pics);

head('Check it before pushing it');
// Captured rather than streamed, so a failure can be repeated at the bottom.
// node:test prints hundreds of lines and the four that matter scroll off; the
// first version of this told the reader to "send me the failure" and left them
// to go and find it.
const t = capture('npm', ['test'], { cwd: EXT, ...NPM });
if (!t.ok) {
    // Indented too: when node:test runs several files, each file is the
    // top-level test and the tests inside it are indented subtests.
    const lines = t.out.split('\n');
    const bad = lines
        .map((l, i) => (/^\s*not ok /.test(l) ? lines.slice(i, i + 12).join('\n') : null))
        .filter(Boolean);
    // And if there is no "not ok" anywhere, npm failed for some reason that is
    // not a failing test - a missing module, a native build, npm itself. The
    // first version printed nothing at all in that case, which is the one case
    // where the reader most needs to see something.
    stop('the extension tests fail with this artwork - not pushing\n\n' +
        (bad.length
            ? bad.slice(0, 4).join('\n\n')
            : 'No "not ok" line in the output, so this is probably not a failing\n' +
              'test at all. The last 25 lines were:\n\n' +
              lines.filter(l => l.trim()).slice(-25).join('\n')),
        'send me everything from "STOPPED" down and I will fix it');
}
const b = capture('npm', ['run', 'build'], { cwd: EXT, ...NPM });
if (!b.ok) {
    const why = b.out.split('\n').filter(l => /Error|over the|budget|cap/.test(l)).slice(0, 6);
    stop('the build refuses this artwork - not pushing' +
        (why.length ? '\n\n  ' + why.join('\n  ') : ''),
        'usually the 9KB per-picture cap or the 6MB budget');
}

head('Commit and push');
if (DRY) { say('dry run - nothing committed'); process.exit(0); }
git('add', 'merid-extension-final/vis', 'merid-extension-final/visual-index.json');
const staged = git('diff', '--cached', '--name-only');
if (!staged) {
    say('nothing new to commit - the artwork on GitHub already matches this build');
} else {
    if (!run('git', ['commit', '-m', 'Add the artwork'])) stop('the commit failed - read above');
    if (!run('git', ['push'])) {
        stop('the push failed - read the message above',
            'if it says the branch moved: git pull --no-edit, then run this again');
    }
}

say('\n' + '='.repeat(62));
say('Done. ' + pics + ' pictures are on GitHub.');
say('Load the extension from: ' + EXT);
say('='.repeat(62));
