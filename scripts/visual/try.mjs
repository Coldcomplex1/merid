#!/usr/bin/env node
// A trial run: the whole chain, on a handful of words, in one command.
//
// Each stage takes --limit, but that cannot be used for this. 01 limits the
// entries it asks the model about, 02 limits the concrete ones, 03 limits the
// searchable ones - so "--limit 10" three times gives three different tens
// whose overlap can be empty, which is exactly what happened the first time
// this was tried. Here one set of words travels the whole way through.
//
// Working files go to state/trial/ and the real run's state is never touched,
// so this can be run as often as you like, including halfway through a real
// run.
//
// The default words are chosen to be hard rather than representative, in three
// groups, because the two ways this goes wrong look nothing alike:
//
//   Verbs with a physical sense and an abstract meaning - skirt, table, eclipse.
//   These are the ones that got a photograph of the wrong word: "skirt: to evade
//   a question" was illustrated with a hiking trail. They should end as symbols.
//
//   Plain objects and roles - anchor, monk, aisle. These should end as
//   photographs, and the picture should be OF the thing rather than of a scene
//   containing it somewhere.
//
//   Harder concrete words - buffet, ballad, clergy. Photographable in principle,
//   easy to illustrate with something adjacent instead.
//
// Usage:
// --sample N is a different question asked of the same machinery: not "does the
// chain work" but "what FRACTION of eligible words ends with a picture on this
// machine". That number is the one that decides whether a target of 800 is
// reachable, and guessing it at 87% is what let a pool of 771 be treated as
// enough for 800 and produce fifteen. Measured here in about twelve minutes,
// and it doubles as proof that CLIP runs at all before two hours are spent.
//
//   node scripts/visual/try.mjs                    the default hard set
//   node scripts/visual/try.mjs anchor monk aisle  words you choose
//   node scripts/visual/try.mjs --review           open the review UI afterwards
//   node scripts/visual/try.mjs --sample 80        measure the yield, for --target
//   node scripts/visual/try.mjs --sample 80 --fresh   ...ignoring an earlier measurement
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findPython, loadEntries } from './lib/entries.mjs';
import { wilsonLow, concreteCount, candidateCount, clearCount } from './lib/gates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const args = process.argv.slice(2);
const REVIEW = args.includes('--review');
const words = args.filter(a => !a.startsWith('--'));

// Measure now, not last week. state/probe/ survives between runs, and every
// stage resumes from it - which is right for a stage and wrong for a
// measurement: change the licence filter or the CLIP floor, run the probe
// again, and it hands back the number it found before the change. That trap
// has cost this project a day more than once.
const FRESH = args.includes('--fresh');

const SAMPLE = (() => {
    const i = args.indexOf('--sample');
    if (i < 0) return null;
    const n = Number(args[i + 1]);
    if (!Number.isInteger(n) || n < 20) {
        console.error('[try] --sample needs a whole number of at least 20 - below that the');
        console.error('      measured fraction says almost nothing. 80 is a good number.');
        process.exit(1);
    }
    return n;
})();

/**
 * Where a sample measures the yield.
 *
 * A wide one, and not the 3.5 default, because the pool a target of several
 * hundred needs is a wide pool - and the words a lower threshold admits are
 * exactly the ones most likely to end without a picture. Measuring at 3.5 and
 * spending the number on a pool built at 2.2 would flatter the estimate at the
 * one place being wrong is expensive.
 */
const SAMPLE_AT = process.env.MERID_CONCRETE_AT || '2.0';

// A sample keeps its own state directory. The trial's twelve words are chosen
// to be hard, so mixing the two would leave a cache that answers neither
// question honestly.
const TRIAL_STATE = path.join(HERE, 'state', SAMPLE ? 'probe' : 'trial');

const DEFAULT_WORDS = [
    'skirt', 'grasp', 'eclipse', 'table', 'stem',   // physical verb, abstract sense
    'delegate',                                      // two senses, one of each kind
    'anchor', 'monk', 'aisle',                       // plain objects and roles
    'buffet', 'ballad', 'clergy'                     // harder, but still photographable
];

/**
 * N words drawn from the whole corpus, the same N every time.
 *
 * Seeded on purpose: a yield that moves when nothing else changed is a yield
 * nobody can act on, and re-running the probe after fixing a rate limit has to
 * compare against the same words. The corpus order is stable (the CSVs are
 * read in a fixed order), so an index draw is enough.
 */
function sampleWords(n) {
    const all = loadEntries();
    let seed = 0x9e3779b9;
    const next = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const idx = all.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    // By WORD, because MERID_ONLY filters on the word: a headword with two
    // senses brings both, which is correct - both are entries the run would
    // have to find a picture for.
    const picked = new Set();
    for (const i of idx) {
        if (picked.size >= n) break;
        picked.add(all[i].word.toLowerCase());
    }
    return [...picked];
}

const chosen = SAMPLE ? sampleWords(SAMPLE) : (words.length ? words : DEFAULT_WORDS);
// Resolved rather than named: an activated venv is the interpreter the reader
// meant, and on Windows the obvious `py -3` ignores it. Shared with run.mjs so
// the trial and the real run cannot disagree about which Python they are using.
const PY = findPython();

function run(cmd, argv, extraEnv) {
    return new Promise(resolve => {
        const child = spawn(cmd, argv, {
            cwd: ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, MERID_STATE: TRIAL_STATE, MERID_ONLY: chosen.join(','), ...extraEnv },
            shell: false
        });
        let out = '';
        child.stdout.on('data', d => { out += d; process.stdout.write(d); });
        child.stderr.on('data', d => { out += d; process.stderr.write(d); });
        child.on('error', e => resolve({ code: 1, out: String(e.message) }));
        child.on('exit', code => resolve({ code, out }));
    });
}

function line(n = 74) { console.log('-'.repeat(n)); }

async function main() {
    if (FRESH) fs.rmSync(TRIAL_STATE, { recursive: true, force: true });
    fs.mkdirSync(TRIAL_STATE, { recursive: true });

    // The concreteness norms are 1.6MB and stage 01 fetches them on first use.
    // Share the real run's copy rather than downloading a second one.
    const realNorms = path.join(HERE, 'state', 'brysbaert-concreteness.txt');
    const trialNorms = path.join(TRIAL_STATE, 'brysbaert-concreteness.txt');
    if (fs.existsSync(realNorms) && !fs.existsSync(trialNorms)) {
        fs.copyFileSync(realNorms, trialNorms);
    }

    if (SAMPLE) {
        console.log('Measuring on ' + chosen.length + ' random words, at CONCRETE_AT=' + SAMPLE_AT +
            ' and the scoring bar a --target run uses.');
        console.log('About twelve minutes. This also proves CLIP runs here before a long run does.');
    } else {
        console.log('Trial on ' + chosen.length + ' words: ' + chosen.join(', '));
    }
    console.log('Working files: ' + path.relative(ROOT, TRIAL_STATE) + '  (the real run is untouched)');
    line();

    // No Python at all is worth saying here rather than throwing on PY.cmd four
    // stages later, after the trial has already spent its model requests.
    if (!PY) {
        console.error('No Python 3 found, and stage 04 scores the candidates with it.');
        console.error('If you have a virtualenv, activate it first; otherwise install Python 3.');
        process.exit(1);
    }

    const stages = [
        ['node', ['scripts/visual/01-classify.mjs']],
        ['node', ['scripts/visual/02-query.mjs']],
        // --per-entry 10 under --sample, because that is what a --target run
        // uses (run.mjs passes it) and a probe that fetches fewer candidates
        // measures a worse run than the one it is sizing. Same mistake as
        // measuring at a different CLIP floor, which this file already avoids.
        ['node', SAMPLE
            ? ['scripts/visual/03-fetch.mjs', '--per-entry', '10']
            : ['scripts/visual/03-fetch.mjs']],
        [PY.cmd, [...PY.pre, 'scripts/visual/04-rank.py']]
    ];
    // A sample measures the yield of a WIDE pool under the settings a target run
    // uses, because a measurement taken under different settings is a
    // measurement of a different thing. Stage 04's default bar - floor 0.24,
    // margin 0.03 - is the bar for a queue a person is going to look at; a
    // target run lowers both, and the number being measured here is the one
    // that run will divide by.
    const env = SAMPLE ? {
        MERID_CONCRETE_AT: SAMPLE_AT,
        MERID_CLIP_FLOOR: process.env.MERID_CLIP_FLOOR || '0.20',
        MERID_CLIP_MARGIN: process.env.MERID_CLIP_MARGIN || '0'
    } : undefined;
    for (const [cmd, argv] of stages) {
        console.log('\n$ ' + cmd + ' ' + argv.join(' '));
        const { code } = await run(cmd, argv, env);
        if (code !== 0) {
            console.error('\nStage failed. Nothing below this point is worth reading.');
            process.exit(code || 1);
        }
    }

    if (SAMPLE) { measure(); return; }
    report();

    if (REVIEW) {
        console.log('\nOpening the review UI on the trial words. Ctrl-C when done.');
        await run('node', ['scripts/visual/05-review.mjs', '--all', '--port', '8788']);
    } else {
        console.log('\nTo look at the pictures:');
        console.log('  MERID_STATE=' + path.relative(ROOT, TRIAL_STATE) +
            ' node scripts/visual/05-review.mjs --all --port 8788');
        console.log('  (PowerShell: $env:MERID_STATE=\'' + path.relative(ROOT, TRIAL_STATE) +
            '\'; node scripts/visual/05-review.mjs --all --port 8788)');
    }
}

/**
 * What the sample says about a target, in the terms a target is asked in.
 *
 * Three numbers come out of the chain and one goes back in. The yield is the
 * fraction of ELIGIBLE words - not of the corpus - that end with a picture,
 * because that is the fraction stage 01 has to divide a target by to size its
 * pool. Reported at its low end, not its face value: 21 of 34 is not "62%", it
 * is "somewhere upwards of 51%", and a pool sized on 62% when the truth is 51%
 * is a pool that misses. Sizing on the low end costs fetch time; sizing on the
 * face value costs the target.
 */
function measure() {
    // The same counters run.mjs gates each stage with, rather than a second
    // reading of the same four files. A probe that measured "entries with a
    // candidate" differently from the gate that checks it would produce a yield
    // that predicts the wrong thing, and nothing would ever say so.
    let sampled = 0;
    try {
        sampled = Object.keys(JSON.parse(fs.readFileSync(
            path.join(TRIAL_STATE, 'classification.json'), 'utf8')).entries || {}).length;
    } catch (e) { /* reported as zero below */ }
    const pool = concreteCount(TRIAL_STATE);
    const withCand = candidateCount(TRIAL_STATE);
    const clear = clearCount(TRIAL_STATE);

    const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
    console.log('\n');
    line();
    console.log('WHAT ' + sampled + ' RANDOM ENTRIES SAY ABOUT A TARGET');
    line();
    console.log('  eligible for a photograph   ' + String(pool).padStart(4) +
        '   ' + pct(pool, sampled) + ' of the corpus at CONCRETE_AT=' + SAMPLE_AT);
    console.log('  got at least one candidate  ' + String(withCand).padStart(4) +
        '   ' + pct(withCand, pool) + ' of those');
    console.log('  one candidate cleared 04    ' + String(clear).padStart(4) +
        '   ' + pct(clear, pool) + ' of those');

    if (!pool) {
        console.log('');
        console.log('  Nothing in this sample was eligible, so there is no yield to report.');
        console.log('  That is a stage 01 result, not a stage 03 or 04 one.');
        line();
        process.exitCode = 1;
        return;
    }

    const y = wilsonLow(clear, pool);
    const yCand = wilsonLow(withCand, pool);
    const round = v => Math.max(0.05, Math.floor(v * 100) / 100);
    const use = round(y);

    // Written as well as printed, so run.mjs reads a number rather than
    // scraping one out of twelve minutes of output. The same rule the stage
    // gates follow: a printed line can be reworded, a JSON key cannot.
    fs.writeFileSync(path.join(TRIAL_STATE, 'yield.json'), JSON.stringify({
        v: 1, at: SAMPLE_AT, measured: new Date().toISOString(),
        sampled, pool, withCand, clear,
        yield: round(y), yieldWithCandidate: round(yCand)
    }, null, 2) + '\n');
    console.log('');
    console.log('  yield        ' + (clear / pool).toFixed(2) + ' measured, ' + use.toFixed(2) +
        ' at the low end of a 90% interval');
    console.log('               (a sample of ' + pool + ' cannot promise more than the low end,');
    console.log('                and a pool sized on the face value is a pool that misses)');
    console.log('');
    for (const target of [400, 800, 1000]) {
        console.log('  ' + String(target).padStart(4) + ' pictures need a pool of about ' +
            String(Math.ceil(target / use)).padStart(5) +
            '   (' + Math.ceil(target / round(yCand)) + ' if stage 06 has to take every');
        console.log('       ' + ' '.repeat(31) + 'entry with a candidate, which --target does when short)');
    }
    console.log('');
    console.log('  Stage 01 says whether this vocabulary can carry that pool. Run:');
    console.log('');
    console.log('    node scripts/visual/run.mjs --target 800 --yield ' + use.toFixed(2));
    console.log('');
    line();
    if (!clear) {
        console.log('NOTHING cleared stage 04. Before spending two hours: check the [04] lines');
        console.log('above for a model that never loaded, and try a lower bar -');
        console.log('  $env:MERID_CLIP_FLOOR=\'0.18\'; $env:MERID_CLIP_MARGIN=\'0\'');
        console.log('then run this again. A target run sets both itself, so a zero here is');
        console.log('worth understanding rather than working around.');
        line();
    }
}

/** Everything the chain decided about each word, on one screen. */
function report() {
    const read = f => {
        try { return JSON.parse(fs.readFileSync(path.join(TRIAL_STATE, f), 'utf8')); }
        catch (e) { return { entries: {} }; }
    };
    const classification = read('classification.json');
    const queries = read('queries.json');
    const iconmap = read('iconmap.json');
    const ranked = read('ranked.json');
    const candidates = read('candidates.json');

    console.log('\n');
    line();
    console.log('WHAT THE CHAIN DECIDED');
    line();

    const slugs = new Set([
        ...Object.keys(classification.entries || {}),
        ...Object.keys(queries.entries || {})
    ]);

    let photos = 0;
    let glyphs = 0;
    for (const slug of [...slugs].sort()) {
        const cls = (classification.entries || {})[slug];
        const q = (queries.entries || {})[slug];
        const r = (ranked.entries || {})[slug];
        const c = (candidates.entries || {})[slug];
        const word = (c && c.word) || slug.replace(/-[0-9a-z]{4}$/, '');
        const definition = (c && c.definition) || '';

        console.log('\n' + word.toUpperCase() + (definition ? '  -  ' + definition.slice(0, 62) : ''));
        console.log('  classified : ' + (cls ? cls.kind + ' (' + cls.source + ')' : '-'));

        if (!q || !q.query) {
            const bucket = (iconmap.entries || {})[slug];
            const why = q && q.reason === 'subject' ? 'subject matter'
                : q && q.depictable === false ? 'the model said no photograph could show it'
                    : 'not sent to search';
            console.log('  picture    : none - ' + why);
            console.log('  symbol     : ' + (bucket || '(first letter)'));
            glyphs++;
            continue;
        }

        console.log('  searched   : ' + q.query + (q.kind ? '   [' + q.kind + ']' : ''));
        if ((q.negative || []).length) console.log('  not        : ' + q.negative.join(', '));

        if (!r || !r.candidates || !r.candidates.length) {
            console.log('  candidates : none came back');
            glyphs++;
            continue;
        }
        console.log('  scored against: a photo of ' + word + ', ' + definition.slice(0, 50));
        for (const cand of r.candidates.slice(0, 3)) {
            console.log('    ' + (cand.clear ? 'OK  ' : '  . ') +
                String(cand.score).padEnd(8) +
                (cand.margin === null || cand.margin === undefined
                    ? 'no distractors' : 'margin ' + String(cand.margin).padEnd(8)) +
                '  ' + cand.source + ' - ' + (cand.title || '').slice(0, 34));
        }
        if (r.anyClear) photos++; else glyphs++;
    }

    line();
    console.log('would get a photograph: ' + photos + '   would get a symbol: ' + glyphs);
    line();
    console.log('Read the "searched" line against the definition above it. If the search');
    console.log('describes a scene that means the definition, the chain is working. If it');
    console.log('describes a metaphor - a trail around a hill for "evade a question" - then');
    console.log('stage 01 called an abstract word concrete, and that is where to look.');
}

main().catch(e => { console.error(e); process.exit(1); });
