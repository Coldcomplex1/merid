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
//   node scripts/visual/run.mjs --target 800   end with 800 pictures, or say why not
//   node scripts/visual/run.mjs --target 800 --yield 0.51
//                                             skip the measuring step, using a
//                                             figure an earlier run measured
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
import { findPython, readJson, loadEntries, FROM_DOTENV, ENV_FILE } from './lib/entries.mjs';
import { geminiKeyEnv } from './lib/llm.mjs';
import { concreteCount, searchableCount, candidateCount, scoredCount, clearCount,
    uncoveredCount, needFor } from './lib/gates.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HERE = 'scripts/visual';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const NO_PHOTOS = argv.includes('--no-photos');

/**
 * How many photographs this run should end with.
 *
 * The alternative was a sequence: pick a threshold off a table, export it, run
 * stage 01 with --reclassify, run 02, run 03, export a CLIP floor, run 04, read
 * a second table, run ship with a cutoff copied across. Nine steps, two
 * environment variables that have to live in the same shell, and one flag whose
 * absence makes the whole thing report the old numbers without complaining.
 *
 * It produced fifteen pictures out of a target of eight hundred, three runs in
 * a row, and every one of them finished by printing "Done." A target says the
 * outcome once, and the run checks itself against it at each point where it
 * could still be salvaged - and fails, loudly, if it ends up short.
 */
const TARGET = (() => {
    const i = argv.indexOf('--target');
    if (i < 0) return null;
    const n = Number(argv[i + 1]);
    if (!Number.isInteger(n) || n < 1) {
        console.error('[run] --target needs a whole number of pictures, e.g. --target 800');
        process.exit(1);
    }
    return n;
})();
if (TARGET !== null && NO_PHOTOS) {
    console.error('[run] --target asks for photographs and --no-photos refuses them. Pass one.');
    process.exit(1);
}

/**
 * What fraction of an eligible word becomes a picture on THIS machine.
 *
 * Sizing the pool is a division by this number, and getting it wrong is how a
 * pool of 771 was treated as enough for 800 pictures. Left unset with a target,
 * the run measures it first - twelve minutes against two hours, and it also
 * proves CLIP works here before the two hours start. Given, that step is
 * skipped: a second run of the day already knows the answer.
 */
const YIELD = (() => {
    const i = argv.indexOf('--yield');
    if (i < 0) return null;
    const n = Number(argv[i + 1]);
    if (!Number.isFinite(n) || n <= 0 || n > 1) {
        console.error('[run] --yield needs a fraction between 0 and 1, e.g. --yield 0.51');
        console.error('      Measure it:  node scripts/visual/try.mjs --sample 80');
        process.exit(1);
    }
    return n;
})();
const PROBE_YIELD = path.join(ROOT, 'scripts', 'visual', 'state', 'probe', 'yield.json');
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

/** Stage 06's "built, but short of --target". Must match 06-build.mjs. */
const SHORT_EXIT = 3;

/**
 * What each stage handed on to the next, checked against what it was given.
 *
 * The chain used to check twice - after stage 01, and at the very end. In
 * between, a stage that produced almost nothing looked exactly like a stage
 * that worked: 02 ran out of the day's Gemini quota, wrote queries for 18 of
 * 943 words, and 03, 04 and 05 then did their jobs perfectly on the 18. Every
 * exit status was 0. The run printed "Done" and shipped fifteen pictures.
 *
 * So each gate counts what the stage just wrote. It reads the state file rather
 * than the stage's output because the count is the thing being checked, and a
 * printed line can be reworded while a JSON key cannot.
 */
const shortfalls = [];

/**
 * @param {boolean} o.hard  stop here, or say it and carry on?
 *
 * Hard only while stopping is CHEAPER than continuing. Before the fetch that is
 * true: its hour would be spent on a set that cannot reach the target, and the
 * usual cause is a daily quota that fixes itself overnight. After it, it is
 * false - the expensive stages are paid for, and stopping then means no artwork
 * at all, where carrying on means fewer pictures than asked for. Fewer beats
 * none, which is the same rule stage 06 follows when a target is out of reach.
 */
function gate(o) {
    const ok = o.got >= o.need;
    say('');
    say('[gate] ' + o.name + ': ' + o.got + ' of ' + o.of + ' - this run needs ' + o.need + '.');
    if (ok) return true;
    if (o.hard) stop(o.name + ' gives ' + o.got + ', short of the ' + o.need + ' needed.\n  ' + o.why,
        ...o.fix);
    say('  SHORT here: ' + o.why);
    say('  Carrying on anyway - the stages after this still turn what there is into');
    say('  pictures, and fewer pictures beats none. To widen it and run again:');
    for (const f of o.fix) say('    ' + f);
    shortfalls.push(o.name + ': ' + o.got + ' of ' + o.of + ', needed ' + o.need);
    return false;
}

/**
 * Run a stage, keep its output, and show it.
 *
 * Not live: the output appears when the stage ends. Only used for stage 01,
 * which takes about a minute and whose last line has to be read before an hour
 * is spent on the strength of it.
 */
function captureStage(label, cmd, args) {
    head(label);
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    process.stdout.write(out);
    if (r.error) stop('could not run ' + cmd + ': ' + r.error.message);
    if (r.status !== 0) stop(label + ' failed - read the message above.');
    return out;
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

// The same endpoints stage 03 uses, overridable the same way, so the check and
// the stage cannot end up talking about two different services - and so a test
// can point both at a fake archive.
const PEXELS_URL = process.env.MERID_PEXELS_URL || 'https://api.pexels.com';
const OPENVERSE_URL = process.env.MERID_OPENVERSE_URL || 'https://api.openverse.org';

/**
 * Whether an archive key actually works, asked of the archive.
 *
 * "Present" is not the question. getJson in 03-fetch treats every failure that
 * is not a 429 as "this source had nothing for that word" and moves on - which
 * is right for a search that found nothing and wrong for a key that is
 * refused, because the refusal then repeats silently for every entry in the
 * run. A key with a character missing costs one of three archives for two
 * hours, and the only sign of it is a per-source summary at the very end.
 *
 * One request answers it in the first ten seconds. Never fatal: Wikimedia
 * needs no key at all, so a bad Pexels key is a smaller run, not a stopped one.
 */
async function checkArchiveKey(url, headers) {
    try {
        const resp = await fetch(url, {
            headers: { 'User-Agent': 'merid-visual-vocab/1.0', ...headers }
        });
        // 429 means the key is good and the rate limit is not - stage 03 rests
        // a source and comes back to it, so this is a working key.
        if (resp.ok || resp.status === 429) return { ok: true };
        // What the refusal SAYS, not just its number. A 403 from Pexels and a
        // 403 from a corporate proxy or a sandbox that blocks the host are the
        // same status and opposite problems, and the reader cannot tell them
        // apart from a number - one means "fix your key", the other means "your
        // key is fine, your network is not". The body says which; Pexels
        // answers JSON, a proxy answers HTML or its own name.
        const body = await resp.text().catch(() => '');
        const said = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
        return { ok: false, status: resp.status, said };
    } catch (e) {
        // No network here says nothing about the key. Stage 03 will find out.
        return { unreachable: true, msg: e.message };
    }
}

/**
 * Whether the key can actually call the API, asked of Google rather than of its
 * first six characters.
 *
 * A prefix test is a guess, and it guessed wrong both ways: it blocked a key it
 * could not really judge, and it would have passed a well-shaped key on a
 * project with the API switched off. One request answers the question properly
 * and costs nothing against the quota.
 */
async function checkGeminiKey(key) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200';
    try {
        // x-goog-api-key, the way every other call in this repository
        // authenticates. See the note in scripts/visual/lib/llm.mjs.
        const resp = await fetch(url, { headers: { 'x-goog-api-key': key } });
        const json = await resp.json().catch(() => null);
        if (resp.ok) {
            const models = ((json && json.models) || []).length;
            return { ok: true, models };
        }
        return {
            ok: false,
            status: resp.status,
            msg: (json && json.error && json.error.message) || ('HTTP ' + resp.status)
        };
    } catch (e) {
        // No network, a proxy, a firewall. Not a reason to refuse to start: the
        // first stage will find out within seconds and say so itself.
        return { unreachable: true, msg: e.message };
    }
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
//
// Asked of the same function the pipeline asks, rather than of GEMINI_API_KEY
// alone. Both names are accepted, and .env.example documents the plural - so
// the old check refused to start runs whose key was sitting right there under
// the name this repository itself recommends.
const { keys: gemKeys, from: gemFrom } = geminiKeyEnv();
const gem = gemKeys[0] || '';
if (!gem) {
    const ps = process.platform === 'win32';
    const fix = [
        ps ? "$env:GEMINI_API_KEY='your-key'" : "export GEMINI_API_KEY='your-key'",
        'in THIS window, then run this command again in the same window.',
        ''
    ];
    if (ps) {
        // Three ways to have "already set it" and still be here, all of them
        // silent. Named, because the reader who hits this has usually done one
        // of them and has no way to tell which.
        fix.push('$env: only, and only that window:',
            '  set GEMINI_API_KEY=... does NOTHING in PowerShell - `set` is an alias for',
            '  Set-Variable there, so it makes a PowerShell variable, not an environment',
            '  one, and says nothing. That syntax is cmd.exe.',
            '  setx GEMINI_API_KEY ... only reaches windows opened AFTER it.',
            '  A key set in another window - including VS Code\'s terminal vs an outside',
            '  one - is not in this one.',
            '');
    }
    // The durable answer, and the one that matters for a run that may have to
    // be finished tomorrow when the day's quota resets.
    fix.push('Or write it once, in a file at the repository root called .env:',
        '  GEMINI_API_KEY=your-key',
        '  PEXELS_API_KEY=your-key',
        'every stage reads it, it survives closing the terminal, and .gitignore',
        'already keeps it out of git.',
        '');
    if (FROM_DOTENV.length) {
        fix.push('There IS a .env here and it set ' + FROM_DOTENV.join(', ') +
            ' - but no Gemini key.');
    } else if (fs.existsSync(ENV_FILE)) {
        fix.push('There is a ' + path.basename(ENV_FILE) + ' here, but nothing in it was used -',
            'check it for',
            'typos in the names, and remember the terminal wins over the file.');
    }
    fix.push('Get a key at https://aistudio.google.com/apikey');
    problems.push(['no Gemini key: neither GEMINI_API_KEY nor GEMINI_API_KEYS is set', ...fix]);
} else {
    // Where it came from, said out loud. When this line disagrees with what the
    // reader thinks they set - the wrong name, or a .env from last week winning
    // because this window has nothing - that is the whole diagnosis, and it
    // costs one clause.
    const extra = [FROM_DOTENV.includes(gemFrom) ? 'from .env' : '',
        gemKeys.length > 1 ? gemKeys.length + ' keys' : ''].filter(Boolean);
    const source = gemFrom + (extra.length ? ' (' + extra.join(', ') + ')' : '');
    const check = await checkGeminiKey(gem);
    if (check.ok) {
        say('gemini key: works, ' + check.models + ' models available  [' + source + ']');
    } else if (check.unreachable) {
        warnings.push('could not reach Google to check the key in ' + gemFrom + ' (' + check.msg + ').\n' +
            '      Carrying on - stage 01 will say within seconds if the key is no good.');
    } else {
        const fix = [
            'Google says: ' + check.msg + ' (HTTP ' + check.status + ')',
            ''
        ];
        // Both prefixes are real keys. The older "AIzaSy..." and the newer
        // "AQ.Ab..." auth key Google has moved to are equally valid, and an
        // earlier version of this check refused the second on sight - which is
        // how a working key got turned away. The status says more than the
        // prefix does: 400 is a malformed key, 401 is a credential Google
        // recognises and will not accept.
        if (check.status === 401) {
            fix.push('401 means the credential was recognised and refused, not that it is the',
                'wrong shape. Usually: the key was deleted or regenerated, or it belongs to a',
                'project the Generative Language API is not enabled on.');
        } else if (check.status === 400) {
            fix.push('400 usually means the key is malformed - a truncated copy-paste, or quotes',
                'or a trailing space that came along with it.');
        }
        if (/PERMISSION_DENIED|SERVICE_DISABLED/i.test(check.msg)) {
            fix.push('', 'That reads as the Generative Language API being off for the project',
                'behind this key, rather than the key itself being wrong.');
        }
        fix.push('',
            'Make one at https://aistudio.google.com/apikey - a key beginning "AQ.Ab" is',
            'fine, that is the format Google issues now.');
        problems.push(['the key in ' + source + ' was rejected by Google', ...fix]);
    }
}

if (NO_PHOTOS) {
    say('--no-photos: stages 03, 04 and 05 are skipped. Every entry takes a symbol.');
} else {
    // Neither of these is fatal, and it is worth saying why rather than leaving
    // the reader to guess which of the three sources they have actually got.
    //
    //   Wikimedia needs nothing at all - no key, no account.
    //   Openverse works anonymously; a token is free and raises the limit.
    //   Pexels is the only one that is off without a key.
    if (!process.env.PEXELS_API_KEY) {
        warnings.push('PEXELS_API_KEY is not set - Openverse and Wikimedia still run, ' +
            'but with a smaller pool to choose from');
    } else {
        const r = await checkArchiveKey(
            PEXELS_URL + '/v1/search?query=test&per_page=1',
            { Authorization: process.env.PEXELS_API_KEY });
        if (r.ok) say('pexels key: works');
        else if (r.unreachable) say('pexels key: present (could not reach Pexels to check: ' + r.msg + ')');
        else {
            warnings.push('the PEXELS_API_KEY was REJECTED (HTTP ' + r.status + ') - Openverse and\n' +
                '      Wikimedia still run, so this is not fatal, but one of the three archives\n' +
                '      will be silent for the whole run.\n' +
                (r.said ? '      Pexels said: ' + r.said + '\n' : '') +
                '      If that reads like a proxy or a firewall rather than Pexels, the key is\n' +
                '      fine and the network is not. Otherwise: https://www.pexels.com/api/new/');
        }
    }

    if (!process.env.OPENVERSE_TOKEN) {
        warnings.push('OPENVERSE_TOKEN is not set - Openverse still answers anonymously, at a\n' +
            '      lower rate. It is free and takes a minute:\n' +
            '      https://api.openverse.org/v1/auth_tokens/register/');
    } else {
        const r = await checkArchiveKey(
            OPENVERSE_URL + '/v1/images/?q=test&page_size=1',
            { Authorization: 'Bearer ' + process.env.OPENVERSE_TOKEN });
        if (r.ok) say('openverse token: works');
        else if (r.unreachable) say('openverse token: present (could not reach Openverse to check)');
        else {
            warnings.push('the OPENVERSE_TOKEN was REJECTED (HTTP ' + r.status + ') - Openverse\n' +
                '      falls back to answering anonymously, at a lower rate. Nothing stops,\n' +
                '      but the token is doing nothing for you.' +
                (r.said ? '\n      Openverse said: ' + r.said : ''));
        }
    }

    say('wikimedia: no key needed');

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
            'no Python 3 found, and stage 04 scores the candidates with it',
            'install Python 3, then:',
            process.platform === 'win32'
                ? '  py -3 -m venv .venv && .\\.venv\\Scripts\\Activate.ps1'
                : '  python3 -m venv .venv && source .venv/bin/activate',
            '  pip install open_clip_torch pillow torch',
            'or run without photographs at all:  node ' + HERE + '/run.mjs --no-photos'
        ]);
    } else {
        const probe = spawnSync(py.cmd, [...py.pre, '-c', 'import open_clip, torch, PIL'],
            { encoding: 'utf8' });
        if (probe.status !== 0) {
            problems.push([
                'open_clip/torch/pillow are missing, and stage 04 needs all three',
                '',
                // Named, because the interpreter is the thing that is usually
                // wrong rather than the packages. A reader with an activated
                // venv and open_clip installed into it was being told open_clip
                // was missing, and had no way to see that the question had gone
                // to a different Python entirely.
                'asked: ' + [py.cmd, ...py.pre].join(' '),
                process.env.VIRTUAL_ENV
                    ? '(that is the venv in VIRTUAL_ENV, so this really is the active one)'
                    : '(no virtualenv is active - if you meant to use one, activate it first)',
                '',
                'Install into THAT interpreter:',
                '  ' + [py.cmd, ...py.pre].join(' ') + ' -m pip install open_clip_torch pillow torch',
                '',
                'stage 05 reads stage 04\'s output and will not run without it, so this is not',
                'a stage that can simply be skipped - the alternative is symbols only:',
                '  node ' + HERE + '/run.mjs --no-photos'
            ]);
        } else {
            say('python + CLIP: ready (' + [py.cmd, ...py.pre].join(' ') + ')');
        }
    }
}

// Warnings first, and before the exit below rather than after it: someone about
// to go and install sharp should learn on the same screen that a free Openverse
// token would be worth picking up while they are at it. Printing these only on
// the clean path meant they were shown last, to a reader who had already
// finished setting up.
for (const w of warnings) say('NOTE: ' + w);

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

// ---------------------------------------------------------------------------
// The stages.
// ---------------------------------------------------------------------------

// The measuring step, which is the only reason a target can be promised at all.
//
// Everything after this is arithmetic: the pool is the target divided by this
// number, and stage 01 says on the spot whether the vocabulary can carry that
// pool. Without it the divisor is a guess of 0.87, which is where "a pool of
// 771 is enough for 800 pictures" came from.
let useYield = YIELD;
if (TARGET !== null && useYield === null) {
    stage('Measure: what fraction of eligible words ends with a picture (~12 min)',
        'node', [HERE + '/try.mjs', '--sample', '80']);
    const probe = readJson(PROBE_YIELD, null);
    if (!probe || !probe.yield) {
        stop('the measuring step did not leave a yield behind',
            'read its output above - it says which stage produced nothing',
            'or skip it with a figure of your own:  --yield 0.5');
    }
    // Zero is not a small yield, it is a broken stage - most often CLIP loading
    // no model at all. Dividing by the 0.05 floor would send stage 01 off to
    // build a pool of sixteen thousand and stop there, blaming the vocabulary
    // for something that has nothing to do with it.
    if (!probe.clear) {
        stop('nothing in the sample of ' + probe.pool + ' eligible words ended with a picture.',
            'this is stage 03 or stage 04, not the size of the pool. Read the [04] lines',
            'in the output above: a model that loaded no weights scores everything at zero.',
            '',
            'when it is fixed, run this again - the sample is cached and costs nothing twice.');
    }
    useYield = probe.yield;
    say('');
    say('measured yield: ' + useYield + '  (' + probe.clear + ' of ' + probe.pool +
        ' eligible words in the sample ended with a picture, read at the low end)');
    const need = Math.ceil(TARGET / useYield);
    say('so ' + TARGET + ' pictures need a pool of about ' + need + '.');

    // A yield low enough to ask for more words than exist. Stage 01 would say
    // "this vocabulary cannot carry that many photographs", which is true and
    // misleading in the same breath: the vocabulary is not the thing that went
    // wrong, the rate at which words turn into pictures is.
    const corpus = loadEntries().length;
    if (need > corpus) {
        stop(TARGET + ' pictures at a yield of ' + useYield + ' would need ' + need +
            ' eligible words,\n  and the whole corpus is ' + corpus + '.',
            'that is a yield problem, not a pool problem. At this rate the most this',
            'corpus can give is about ' + Math.floor(corpus * useYield) + ' pictures.',
            '',
            'the sample above says where it is being lost - the archives finding',
            'nothing, or stage 04 refusing what they found. Widening either is worth',
            'more here than any threshold:',
            '  node ' + HERE + '/03-fetch.mjs --per-entry 12',
            '  $env:MERID_CLIP_FLOOR=\'0.16\'',
            '',
            'or ask for what it can carry:  node ' + HERE + '/run.mjs --target ' +
                Math.floor(corpus * useYield * 0.9));
    }
}

if (TARGET === null) {
    stage('Classify: what can a photograph honestly mean? (~5 min)',
        'node', [HERE + '/01-classify.mjs']);
} else {
    const out = captureStage(
        'Classify: widen until ' + TARGET + ' entries could carry a photograph (~2 min)',
        'node', [HERE + '/01-classify.mjs', '--for-target', String(TARGET),
            '--yield', String(useYield)]);

    // The first place this run can still be saved cheaply. Stage 01 picks its
    // threshold from an ESTIMATE of what the model will add; if the model then
    // adds less, everything downstream quietly works on too small a pool and an
    // hour of fetching produces the old answer. Checked here, against what
    // stage 01 actually ended up with.
    const m = out.match(/=> concrete (\d+)/);
    const pool = m ? Number(m[1]) : 0;
    if (!m) {
        stop('stage 01 did not report how many entries it made concrete',
            'send me its output - the chain cannot check itself without that line');
    }
    const needPool = Math.ceil(TARGET / useYield);
    say('\npool that may carry a photograph: ' + pool + '  (need ' + needPool +
        ' for ' + TARGET + ' pictures at a yield of ' + useYield + ')');
    if (pool < needPool) {
        stop('the pool is ' + pool + ', short of the ' + needPool + ' this target needs.\n' +
            '  Fetching and scoring on this would take an hour and could not reach it.',
            'stage 01 has already walked its thresholds down as far as they go - the',
            'table above shows what each one gave - so there is no wider pool to ask',
            'for. What is left is the target itself:',
            '',
            '  node ' + HERE + '/run.mjs --target ' + Math.floor(pool * useYield) +
                ' --yield ' + useYield,
            '',
            'or a better yield, which is worth more than a wider pool: the sample',
            'measured ' + useYield + ', and --per-entry 12 or a lower MERID_CLIP_FLOOR',
            'both raise it.');
    }
}

stage('Query: what to go looking for (~5 min)',
    'node', [HERE + '/02-query.mjs']);

// The gate that would have caught this run four stages before anyone noticed.
// A query is what stage 03 goes to the archives WITH, so a word without one is
// a word that can never have a photograph, however well everything downstream
// works.
//
// Nothing to gate under --no-photos: it asks for symbols, and symbols come from
// 02b, which does not read this file.
if (!NO_PHOTOS) {
    const pool = concreteCount();
    gate({
        name: 'words with something to search for',
        got: searchableCount(),
        of: pool,
        // A quarter, not a half, when there is no target. Stage 02 legitimately
        // refuses a lot of what stage 01 lets through - that is its job, and at
        // a lowered CONCRETE_AT it refuses more of it - so a proportion strict
        // enough to be useful under a target would stop healthy runs without
        // one. Under a target the floor is exact and there is no such worry.
        need: needFor(TARGET, pool, 0.25),
        // Hard only under a target, where the promise is a number and this
        // stage has already made it unreachable. Without one there is no
        // promise to break, and an hour of fetching for however many words
        // there are is what the reader asked for.
        hard: TARGET !== null,
        why: 'stage 03 spends an hour at the archives and can only ever visit these.',
        fix: [
            'read the "[02] unanswered:" line above. If it is most of the batch, the',
            'day\'s Gemini free-tier quota is gone - that is the usual cause, and the',
            'only fix is tomorrow. Nothing is lost: every answer so far is cached, so',
            'running this same command again picks up exactly where it stopped.',
            '',
            'node ' + HERE + '/run.mjs' + (TARGET !== null ? ' --target ' + TARGET : '')
        ]
    });
}

// The stage that decides how most cards look. Seven entries in eight end up
// wearing a concept symbol, so this is the main path, not the fallback.
stage('Concepts: a symbol for every abstract entry (~15 min)',
    'node', [HERE + '/02b-iconmap.mjs']);

// The gate on the step that can make a perfect run ship nothing.
//
// npm test refuses a build under 90% coverage and ship.mjs refuses to push when
// npm test is red - so 02b stopping half way is not a worse-looking feature, it
// is zero pictures on the repository however well stages 03 to 06 went. Every
// entry needs a photograph, a concept from 02b, or a kind from 02; the ones
// with none of the three are the uncovered ones, and they are countable here,
// an hour before the push that would be refused.
{
    const cov = uncoveredCount();
    gate({
        name: 'entries with a symbol or a kind to fall back on',
        got: cov.covered,
        of: cov.corpus,
        need: Math.ceil(cov.corpus * 0.90),
        hard: true,
        why: 'npm test refuses a build under 90%, and ship.mjs will not push a red test.',
        fix: [
            'stage 02b has not finished. It resumes and costs no quota for what it',
            'already answered:',
            '',
            '  node ' + HERE + '/02b-iconmap.mjs',
            '',
            'if it stops again with most of a batch unanswered, that is the day\'s',
            'Gemini quota, and tomorrow is the fix.'
        ]
    });
}

if (!NO_PHOTOS) {
    // More candidates an entry, and a lower bar for one of them to count as a
    // match. Both only under a target: they trade certainty for reach, which is
    // the trade a target is asking for and not one to make by default.
    const fetchArgs = [HERE + '/03-fetch.mjs'];
    if (TARGET !== null) fetchArgs.push('--per-entry', '10');
    stage('Fetch: candidate photographs from three archives (~40-60 min)',
        'node', fetchArgs);

    {
        const searchable = searchableCount();
        gate({
            name: 'words with at least one candidate picture',
            got: candidateCount(),
            of: searchable,
            need: needFor(TARGET, searchable, 0.5),
            hard: false,
            why: 'the archives answered for fewer words than this run needs pictures.',
            fix: [
                'a rate limit at one of the three is the usual cause - the per-source',
                'summary stage 03 just printed says which one went quiet:',
                '',
                '  $env:MERID_PEXELS_PER_HOUR=\'180\'   # if Pexels was the quiet one',
                '  $env:OPENVERSE_TOKEN=\'...\'          # free, raises Openverse\'s limit',
                '  node ' + HERE + '/03-fetch.mjs --per-entry 12',
                '',
                'stage 03 resumes: it re-fetches only the words it has nothing for.'
            ]
        });
    }

    const py = findPython();
    if (TARGET !== null && !process.env.MERID_CLIP_FLOOR) {
        // Set here rather than asked of the reader: an environment variable in
        // the wrong shell is one of the ways the old sequence failed silently.
        process.env.MERID_CLIP_FLOOR = '0.20';
        say('\nMERID_CLIP_FLOOR=0.20 for this run, so more entries have a candidate that counts.');
    }
    if (TARGET !== null && !process.env.MERID_CLIP_MARGIN) {
        // The bar stage 04 sets is TWO tests, and lowering only the first one
        // leaves the second one throwing entries away in silence. The margin
        // asks the picture to beat the distractors stage 02 named by 0.03,
        // which is a fine thing to ask of a candidate being offered to a person
        // and the wrong thing to ask when the queue has to fill a target: a
        // photograph that ties with a distractor is still usually the right
        // photograph, and the alternative for that word is no picture at all.
        process.env.MERID_CLIP_MARGIN = '0';
        say('MERID_CLIP_MARGIN=0 as well - the margin is the other half of that bar.');
    }
    stage('Score: CLIP, every candidate against its own query (~15-25 min)',
        py.cmd, [...py.pre, HERE + '/04-rank.py']);

    {
        const scored = scoredCount();
        gate({
            name: 'words whose best candidate cleared the scoring',
            got: clearCount(),
            of: scored,
            need: needFor(TARGET, scored, 0.4),
            hard: false,
            why: 'only these can become a picture without somebody looking at them first.',
            fix: [
                '  $env:MERID_CLIP_FLOOR=\'0.18\'',
                '  python ' + HERE + '/04-rank.py            # re-scores, downloads nothing',
                '',
                'or fetch more to choose between, which costs another hour:',
                '  node ' + HERE + '/03-fetch.mjs --per-entry 12'
            ]
        });
    }

    // ---- the part with a person in it -------------------------------------
    //
    // Skipped under a target unless one was asked for. A target is a request to
    // fill the corpus without sitting through a queue, and stopping to wait for
    // a browser tab is the opposite of that - stage 06 will take the top
    // candidate on the strength of its score and say plainly that nobody
    // checked. Reviewing is still worth doing; it is just a separate errand,
    // and `--sample N` alongside `--target` asks for both.
    const wantsReview = TARGET === null || REVIEW_ALL || argv.includes('--sample');
    if (!wantsReview) {
        head('Review: skipped');
        say('--target fills the corpus from the scores rather than from a queue.');
        say('Nothing below was looked at by a person, and stage 06 will say so.');
        say('');
        say('To review as well, either now or later:');
        say('  node ' + HERE + '/05-review.mjs --sample 80');
    } else {
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
    }

    // ---- and the part that protects it ------------------------------------
    //
    // Straight after the reviewing, before anything else can go wrong.
    // decisions.json is the only file in this pipeline a machine cannot make
    // again: everything else in state/ is a cache of a computation. This is an
    // hour of somebody's attention, and it has lived in an uncommitted folder
    // on one machine before.
    // Immediately, and before stage 06 or the tests get a chance to fail. This
    // is not the only place that commits it - ship.mjs does too, as a backstop
    // for anyone running that on its own - but "immediately" is the property
    // being bought here, so both are deliberate.
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
if (TARGET !== null) shipArgs.push('--target', String(TARGET));
if (DRY) shipArgs.push('--dry-run');
const ship = run('node', shipArgs);
// SHORT_EXIT is stage 06 and ship.mjs saying "built it, checked it, pushed it,
// and it is fewer pictures than you asked for". That is a result, not a
// failure to run, and the place to report it is the block below - which is
// also the only place that knows what to do about it.
if (ship.status !== 0 && ship.status !== SHORT_EXIT) process.exit(ship.status || 1);

// ---------------------------------------------------------------------------
// Did it do what it was asked?
//
// Every run before this one ended by printing "Done." - including the three
// that shipped fifteen pictures against a target of eight hundred. A run that
// misses what it was asked for has not finished; it has stopped, and it should
// say so and exit like it.
// ---------------------------------------------------------------------------
if (TARGET !== null) {
    const visDir = path.join(ROOT, 'merid-extension-final', 'vis');
    const got = fs.existsSync(visDir)
        ? fs.readdirSync(visDir).filter(f => /\.(avif|webp)$/.test(f)).length : 0;
    say('');
    say('='.repeat(62));
    if (got >= TARGET) {
        say('Target met: ' + got + ' pictures (asked for ' + TARGET + ').');
    } else {
        say('SHORT: ' + got + ' pictures, asked for ' + TARGET + '.');
        say('');
        if (shortfalls.length) {
            // The gates already answered "which stage ran dry", each one at the
            // moment it happened. Repeating them here saves scrolling back
            // through an hour of output to find them.
            say('The stages that came up short, in the order they ran:');
            for (const f of shortfalls) say('  ' + f);
            say('');
        }
        say('Read the "[06] where the photographs went" block above - it says which');
        say('of the three it was:');
        say('');
        say('  too few words eligible   -> node ' + HERE + '/01-classify.mjs --for-target ' +
            (TARGET + 200));
        say('  too few scored candidates -> MERID_CLIP_FLOOR=0.18 python3 ' + HERE + '/04-rank.py');
        say('                            -> node ' + HERE + '/03-fetch.mjs --per-entry 12');
        say('  candidates that would not encode -> that count is on the same block');
        say('='.repeat(62));
        process.exit(1);
    }
    say('='.repeat(62));
}

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
