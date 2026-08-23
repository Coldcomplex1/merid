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
import { execFileSync, spawnSync } from 'node:child_process';
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

/** Run a command, streaming its output. Returns false rather than throwing. */
function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { cwd: opts.cwd || ROOT, stdio: 'inherit', shell: false });
    return r.status === 0;
}

/** Run a command and capture its output (still printed). */
function capture(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { cwd: opts.cwd || ROOT, encoding: 'utf8', shell: false });
    const out = (r.stdout || '') + (r.stderr || '');
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
const stillDirty = (git('status', '--porcelain') || '')
    .split('\n').filter(l => l.trim() && !l.startsWith('??'));
if (stillDirty.length) {
    stop('there are other uncommitted changes, and a pull would fight them:\n  ' +
        stillDirty.join('\n  '),
        'commit them:  git add -A && git commit -m "..."',
        'or drop them: git checkout -- <file>');
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
say(cutoff
    ? '\ncutoff the sample supports: ' + cutoff
    : '\nno cutoff is safe on this reviewing - unreviewed entries will take a symbol');

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
if (!run('npm', ['test'], { cwd: EXT })) {
    stop('the extension tests fail with this artwork - not pushing',
        'send me the failure and I will fix it');
}
if (!run('npm', ['run', 'build'], { cwd: EXT })) {
    stop('the build refuses this artwork - not pushing',
        'usually the 9KB per-picture cap or the 6MB budget; send me the message');
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
