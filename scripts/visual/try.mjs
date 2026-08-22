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
//   node scripts/visual/try.mjs                    the default hard set
//   node scripts/visual/try.mjs anchor monk aisle  words you choose
//   node scripts/visual/try.mjs --review           open the review UI afterwards
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TRIAL_STATE = path.join(HERE, 'state', 'trial');

const args = process.argv.slice(2);
const REVIEW = args.includes('--review');
const words = args.filter(a => !a.startsWith('--'));

const DEFAULT_WORDS = [
    'skirt', 'grasp', 'eclipse', 'table', 'stem',   // physical verb, abstract sense
    'delegate',                                      // two senses, one of each kind
    'anchor', 'monk', 'aisle',                       // plain objects and roles
    'buffet', 'ballad', 'clergy'                     // harder, but still photographable
];

const chosen = words.length ? words : DEFAULT_WORDS;
const PY = process.platform === 'win32' ? 'python' : 'python3';

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
    fs.mkdirSync(TRIAL_STATE, { recursive: true });

    // The concreteness norms are 1.6MB and stage 01 fetches them on first use.
    // Share the real run's copy rather than downloading a second one.
    const realNorms = path.join(HERE, 'state', 'brysbaert-concreteness.txt');
    const trialNorms = path.join(TRIAL_STATE, 'brysbaert-concreteness.txt');
    if (fs.existsSync(realNorms) && !fs.existsSync(trialNorms)) {
        fs.copyFileSync(realNorms, trialNorms);
    }

    console.log('Trial on ' + chosen.length + ' words: ' + chosen.join(', '));
    console.log('Working files: ' + path.relative(ROOT, TRIAL_STATE) + '  (the real run is untouched)');
    line();

    const stages = [
        ['node', ['scripts/visual/01-classify.mjs']],
        ['node', ['scripts/visual/02-query.mjs']],
        ['node', ['scripts/visual/03-fetch.mjs']],
        [PY, ['scripts/visual/04-rank.py']]
    ];
    for (const [cmd, argv] of stages) {
        console.log('\n$ ' + cmd + ' ' + argv.join(' '));
        const { code } = await run(cmd, argv);
        if (code !== 0) {
            console.error('\nStage failed. Nothing below this point is worth reading.');
            process.exit(code || 1);
        }
    }

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
