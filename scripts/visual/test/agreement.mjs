#!/usr/bin/env node
// The sample -> measure -> accept loop, end to end, against the real 05 and 06.
//
// This is the part of the pipeline with no picture to look at when it goes
// wrong. Every other stage fails visibly - a missing file, an empty JSON, a
// photograph of the wrong thing on a card. This one fails by shipping a
// confident number, and a wrong number here decides several hundred pictures
// nobody will ever check. So it is tested rather than eyeballed.
//
// Nothing is mocked. It writes a state directory, starts 05-review.mjs and
// answers its HTTP API the way a person's keystrokes would, then runs
// 06-build.mjs and reads what it printed. The synthetic part is only the truth
// it answers with: the top candidate is right with a probability that climbs
// with the score, which is the thing stage 06 is supposed to be able to
// measure. A run where that measurement comes out flat is also tested, because
// "no cutoff is safe" is the answer that protects the reader.
//
//   node scripts/visual/test/agreement.mjs
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makePng } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const STATE = path.join(HERE, '..', 'state', 'test-agreement');
const EXT_DIR = path.join(ROOT, 'merid-extension-final');

const N = 150;              // entries in the queue
const SAMPLE = 50;          // how many a person looks at
const LO = 0.19, HI = 0.37; // the score range a real run produced

let failures = 0;
function ok(cond, what) {
    console.log((cond ? '  ok   ' : '  FAIL ') + what);
    if (!cond) failures++;
}

/** Deterministic, so a failure is reproducible. */
function rng(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

async function freePort() {
    return new Promise(resolve => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    });
}

/**
 * A queue of N entries whose scores span the real range, with a truth attached:
 * is the first candidate the right picture?
 *
 * `rising` is the whole point of the exercise. When it is true the probability
 * climbs from a third to almost always, which is what stage 04 is claiming
 * about its own scores; stage 06 should find a cutoff. When it is false the
 * probability is the same everywhere, which means the score is measuring
 * nothing, and stage 06 should refuse to name a cutoff at all.
 */
function build(slugs, { rising }) {
    const rand = rng(12345);
    const ranked = { v: 1, floor: 0.22, margin: 0.015, entries: {} };
    const truth = new Map();
    fs.mkdirSync(path.join(STATE, 'candidates'), { recursive: true });

    slugs.forEach((slug, i) => {
        const best = +(LO + (HI - LO) * (i / (slugs.length - 1))).toFixed(4);
        const p = rising ? 0.30 + 0.68 * (i / (slugs.length - 1)) : 0.55;
        truth.set(slug, rand() < p);

        const candidates = [0, 1, 2].map(n => {
            const file = 'candidates/' + slug + '-' + n + '.img';
            const abs = path.join(STATE, file);
            // Small on purpose. png.mjs draws an (x ^ y) pattern, which is
            // about the worst thing you can hand AVIF - at full size the
            // format comparison in stage 06 takes minutes and every file
            // trips the 9KB cap, neither of which says anything about the
            // code under test. Upscaled from 64x40 it is smooth and quick.
            // 'wx' fails if the file is already there, which is the same
            // intent as asking existsSync first without the gap in between.
            try { fs.writeFileSync(abs, makePng(64, 40, i * 3 + n), { flag: 'wx' }); }
            catch (e) { if (e.code !== 'EEXIST') throw e; }
            return {
                source: ['openverse', 'wikimedia', 'pexels'][n], id: String(i * 3 + n),
                title: slug + ' candidate ' + n, author: 'A. Photographer',
                license: 'CC0', sourceUrl: 'https://example.invalid/' + slug + '/' + n,
                thumbUrl: 'https://example.invalid/t/' + slug + '/' + n, file,
                score: +(best - n * 0.01).toFixed(4), distractor: 0.2,
                margin: 0.02, clear: true
            };
        });
        ranked.entries[slug] = {
            query: slug.replace(/-[0-9a-z]{4}$/, '') + ' photograph',
            negative: [], best, anyClear: true, candidates
        };
    });

    fs.writeFileSync(path.join(STATE, 'ranked.json'), JSON.stringify(ranked));

    // What stage 02 recorded about each word. Stage 06 reads the kind back out
    // to decide what a concrete word shows when it ends without a photograph -
    // a box, a stride or a figure rather than its own first letter. One in nine
    // is left with no kind at all, because stage 02 does skip entries and the
    // letter has to stay reachable.
    const kinds = ['object', 'action', 'role'];
    const queries = { v: 1, entries: {} };
    slugs.forEach((slug, i) => {
        queries.entries[slug] = i % 9 === 8
            ? { query: '', depictable: false }
            : { query: slug + ' photograph', kind: kinds[i % 3], negative: [] };
    });
    fs.writeFileSync(path.join(STATE, 'queries.json'), JSON.stringify(queries));
    return truth;
}

/** Start 05, answer every card it offers, stop it. Returns the slugs it showed. */
async function review(truth) {
    const port = await freePort();
    const child = spawn(process.execPath, [
        'scripts/visual/05-review.mjs', '--sample', String(SAMPLE), '--port', String(port)
    ], { cwd: ROOT, env: { ...process.env, MERID_STATE: STATE }, stdio: ['ignore', 'pipe', 'pipe'] });

    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });

    const base = 'http://127.0.0.1:' + port;
    let queue = null;
    for (let i = 0; i < 100 && !queue; i++) {
        try { queue = (await (await fetch(base + '/api/queue')).json()).queue; }
        catch (e) { await new Promise(r => setTimeout(r, 100)); }
    }
    if (!queue) { child.kill(); throw new Error('05 never came up:\n' + log); }

    const rand = rng(999);
    for (const q of queue) {
        // Keep the first when it is the right picture. When it is not, a person
        // either finds a usable one further along or refuses the lot - both
        // count against the first candidate, and stage 06 must not confuse
        // "took #2" with agreement.
        const decision = truth.get(q.slug)
            ? { pick: 0, candidate: q.candidates[0] }
            : (rand() < 0.5 ? { pick: 1, candidate: q.candidates[1] } : { pick: 'none' });
        await fetch(base + '/api/decide', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: q.slug, decision })
        });
    }
    child.kill();
    return { queue, log };
}

function build06(extra = []) {
    return execFileSync(process.execPath,
        ['scripts/visual/06-build.mjs', '--dry-run', '--format', 'webp', ...extra],
        { cwd: ROOT, env: { ...process.env, MERID_STATE: STATE }, encoding: 'utf8' });
}

/**
 * Which shared pictures are a problem and which are not.
 *
 * These ten pairs are the ones a real run of 292 pictures actually produced.
 * Five are different forms of one word, where a single photograph serves both
 * and there is no better second picture to find. Five are different words,
 * where one of the two is showing a picture of the other. Reporting all ten the
 * same way is what buried `arable`/`morass` at the bottom of a list of ten.
 */
function checkPairs(sameRoot) {
    console.log('\ntelling a shared picture from a wrong one');
    const share = [
        ['potentate', 'potentate'],      // one headword, two datasets
        ['congregation', 'congregation'],
        ['imprison', 'imprisonment'],    // verb and noun of one idea
        ['injection', 'inject'],
        ['agricultural', 'agriculture']
    ];
    const wrong = [
        ['impinge', 'collision'],
        ['craft', 'artisan'],
        ['riot', 'insurrection'],
        ['fierce', 'feral'],             // near synonyms are still two words
        ['arable', 'morass']
    ];
    for (const [a, b] of share) {
        ok(sameRoot(a, b), a + '/' + b + ' may share one picture');
    }
    for (const [a, b] of wrong) {
        ok(!sameRoot(a, b), a + '/' + b + ' must be reported as a mistake');
    }
    // Order cannot matter: the pair arrives whichever way round the phash hit.
    ok(sameRoot('imprisonment', 'imprison') && !sameRoot('morass', 'arable'),
        'the answer is the same with the pair reversed');
}

/**
 * Drive stage 06's duplicate branch for real.
 *
 * checkPairs above tests sameRoot on its own, which is the interesting half of
 * the rule and none of the reporting. This builds two pairs of entries whose
 * chosen pictures are byte-identical - one pair different forms of a word, one
 * pair unrelated - and reads what stage 06 actually printed about them. The
 * fixtures elsewhere in this file give every candidate its own colour, so
 * nothing in them ever reaches this code path.
 */
async function checkDuplicateReport(entries) {
    console.log('\nreporting a shared picture');
    const dir = path.join(HERE, '..', 'state', 'test-dup');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'candidates'), { recursive: true });

    const find = w => entries.find(e => e.word.toLowerCase() === w);
    const pairs = [['imprison', 'imprisonment'], ['arable', 'morass']]
        .map(([a, b]) => [find(a), find(b)]);
    if (pairs.some(([a, b]) => !a || !b)) {
        ok(false, 'the words this test needs are in the dataset');
        return;
    }

    const decisions = {};
    const ranked = { v: 1, floor: 0.22, margin: 0.015, entries: {} };
    let n = 0;
    for (const pair of pairs) {
        const bytes = makePng(64, 40, ++n * 11);   // one image, two entries
        for (const e of pair) {
            const file = 'candidates/' + e.slug + '.img';
            fs.writeFileSync(path.join(dir, file), bytes);
            const cand = {
                source: 'openverse', id: String(n), title: e.word, author: 'A. Photographer',
                license: 'CC0', sourceUrl: 'https://example.invalid/' + e.slug,
                thumbUrl: 'https://example.invalid/t', file,
                score: 0.3, distractor: 0.2, margin: 0.02, clear: true
            };
            ranked.entries[e.slug] = {
                query: e.word, negative: [], best: 0.3, anyClear: true, candidates: [cand]
            };
            decisions[e.slug] = { pick: 0, candidate: cand };
        }
    }
    fs.writeFileSync(path.join(dir, 'ranked.json'), JSON.stringify(ranked));
    fs.writeFileSync(path.join(dir, 'decisions.json'), JSON.stringify(decisions));

    const out = execFileSync(process.execPath,
        ['scripts/visual/06-build.mjs', '--dry-run', '--format', 'webp'],
        { cwd: ROOT, env: { ...process.env, MERID_STATE: dir }, encoding: 'utf8' });

    ok(/1 picture\(s\) shared by different forms of the same word/.test(out),
        'imprison/imprisonment is reported as fine, not as an error');
    ok(/WARNING: 1 picture\(s\) used for two different words/.test(out),
        'arable/morass is reported as a mistake');
    ok(/arable - suitable/.test(out) && /morass - /.test(out),
        'both definitions are printed, so the wrong one is visible without opening anything');
    ok(/MERID_ONLY=(arable,morass|morass,arable)/.test(out),
        'the command that opens exactly those two words is printed');
    // Everything after the WARNING heading is the list of actual problems, so
    // the check is simply whether the morphological pair is in it. Matching
    // across lines from the word instead - which an earlier version of this did
    // - just found the heading further down the page and failed on correct
    // output.
    const problems = out.split('used for two different words')[1] || '';
    ok(problems && !/imprison/.test(problems),
        'the morphological pair is absent from the list of problems');

    fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * The three ways encodeToFit can end.
 *
 * scripts/build.js refuses any picture over the cap, so a picture that does not
 * fit is not a warning to read later - it is a build that will not run. A real
 * run of 292 pictures produced five of them, all busy photographs. The loop
 * that rescues those had no test at all, which is a poor state for the thing
 * standing between a finished dataset and a build that refuses it.
 *
 * The rates here are sharp's, so the test does not assert byte counts. It
 * derives a cap from what this machine actually produced and checks the
 * behaviour around it, which is the part that is ours.
 */
async function checkEncodeToFit() {
    console.log('\nfitting a picture under the per-file cap');
    const require2 = createRequire(path.join(EXT_DIR, 'package.json'));
    let sharp;
    try { sharp = require2('sharp'); } catch (e) {
        console.log('  skip  sharp is not installed');
        return;
    }

    const QUALITY_STEPS = [45, 38, 32, 26, 20];
    const encode = (buf, q) => sharp(buf)
        .resize(320, 160, { fit: 'cover', position: 'attention' })
        .avif({ quality: q, effort: 9 }).toBuffer();

    // Random RGB noise: survives the downscale and is about as hard as a codec
    // ever has to work, which is what the five real failures had in common.
    const W = 900, H = 600;
    const raw = Buffer.alloc(W * H * 3);
    let seed = 7;
    for (let i = 0; i < raw.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        raw[i] = seed & 0xff;
    }
    const heavy = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
        .png().toBuffer();

    const sizes = [];
    for (const q of QUALITY_STEPS) sizes.push({ q, n: (await encode(heavy, q)).length });
    ok(sizes[0].n >= sizes[sizes.length - 1].n,
        'a lower quality is not larger, or stepping down cannot help at all');

    const fit = async cap => {
        for (const q of QUALITY_STEPS) {
            const out = await encode(heavy, q);
            if (out.length <= cap) return { q, n: out.length };
        }
        return { q: null, n: null };
    };

    // 1. Room at the first quality: taken as-is, nothing softened.
    const easy = await fit(sizes[0].n);
    ok(easy.q === QUALITY_STEPS[0], 'a picture that already fits keeps the best quality');

    // 2. Between the steps: must step down and then succeed. This is the path
    //    the five real pictures take.
    const between = Math.floor((sizes[0].n + sizes[sizes.length - 1].n) / 2);
    const mid = await fit(between);
    ok(mid.q !== null && mid.q !== QUALITY_STEPS[0] && mid.n <= between,
        'a picture over the cap is retried at a lower quality until it fits');

    // 3. Impossible: no picture at all, rather than one the build will refuse.
    const none = await fit(1);
    ok(none.q === null, 'a picture that cannot fit at any quality is given up on');
}

async function main() {
    fs.rmSync(STATE, { recursive: true, force: true });
    fs.mkdirSync(STATE, { recursive: true });

    const { loadEntries, sameRoot } = await import('../lib/entries.mjs');
    checkPairs(sameRoot);
    await checkDuplicateReport(loadEntries());
    await checkEncodeToFit();
    const slugs = loadEntries().slice(0, N).map(e => e.slug);
    if (slugs.length < N) throw new Error('need ' + N + ' entries, got ' + slugs.length);

    // ---- a run where the score means something -----------------------------
    console.log('\na score that predicts correctness');
    const truth = build(slugs, { rising: true });
    const { queue } = await review(truth);
    ok(queue.length === SAMPLE, 'stage 05 offered exactly ' + SAMPLE + ' cards (got ' + queue.length + ')');

    const seenScores = queue.map(q => q.best);
    ok(Math.min(...seenScores) < LO + 0.03 && Math.max(...seenScores) > HI - 0.03,
        'the sample spans the score range, not one end of it');

    const out = build06();
    ok(/FIRST candidate was the one you kept/.test(out), 'the agreement table is printed');

    const rows = [...out.matchAll(/^ {7}(0\.\d{3}) - (0\.\d{3})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/gm)];
    ok(rows.length === 5, 'five bands, matching the sampler (got ' + rows.length + ')');
    const seen = rows.reduce((a, r) => a + Number(r[4]), 0);
    ok(seen === SAMPLE, 'every card reviewed is counted exactly once (' + seen + ' of ' + SAMPLE + ')');
    const inQueue = rows.reduce((a, r) => a + Number(r[3]), 0);
    ok(inQueue === N, 'the bands cover the whole queue (' + inQueue + ' of ' + N + ')');
    for (const r of rows) {
        ok(Number(r[5]) + Number(r[6]) + Number(r[7]) === Number(r[4]),
            'band ' + r[1] + '-' + r[2] + ': kept + took-another + refused = seen');
    }
    ok(Number(rows[0][5]) < Number(rows[4][5]),
        'agreement is higher in the top band than the bottom one, as planted');

    const rec = out.match(/--accept-above (0\.\d+)/);
    ok(!!rec, 'a cutoff is recommended when the score predicts correctness');
    if (!rec) { report(); return; }
    const cutoff = Number(rec[1]);
    ok(cutoff > LO && cutoff < HI, 'the cutoff is inside the score range (' + cutoff + ')');

    // ---- acting on it ------------------------------------------------------
    console.log('\ntaking the first candidate above the cutoff');
    const decisions = JSON.parse(fs.readFileSync(path.join(STATE, 'decisions.json'), 'utf8'));
    const ranked = JSON.parse(fs.readFileSync(path.join(STATE, 'ranked.json'), 'utf8'));
    const expected = Object.entries(ranked.entries)
        .filter(([slug, r]) => r.best >= cutoff && !decisions[slug]).length;
    const reviewedAbove = Object.keys(decisions)
        .filter(slug => ranked.entries[slug].best >= cutoff).length;
    ok(reviewedAbove > 0, 'some entries above the cutoff were reviewed, so excluding them means something');

    const accepted = build06(['--accept-above', String(cutoff)]);
    const took = accepted.match(/took the first candidate for (\d+) entries nobody looked at/);
    ok(!!took, '--accept-above reports what it did');
    ok(took && Number(took[1]) === expected,
        'it ships the ' + expected + ' unreviewed entries above the cutoff and no others (got ' +
        (took ? took[1] : '?') + ')');
    // Its own two warnings, not any warning: the fixture's noise-pattern PNGs
    // trip the per-file size cap, which is a fact about the fixture.
    ok(/The sample says at least \d+% of those are right/.test(accepted) &&
        !/WARNING: nothing was reviewed|WARNING: what you reviewed/.test(accepted),
        'no warning at the cutoff it recommended itself');

    const shipped = accepted.match(/\[06\] (\d+) pictures,/);
    const chosen = Object.values(decisions).filter(d => d.pick !== 'none').length;
    ok(shipped && Number(shipped[1]) === chosen + expected,
        'the picture count is the reviewed keeps plus the accepted ones (' +
        (shipped ? shipped[1] : '?') + ' vs ' + (chosen + expected) + ')');

    const refused = Object.values(decisions).filter(d => d.pick === 'none').length;
    ok(refused > 0, 'the sample contains refusals at all, so the next check means something');
    const all = build06(['--accept-above', String(LO)]);
    const tookAll = all.match(/took the first candidate for (\d+) entries nobody looked at/);
    ok(tookAll && Number(tookAll[1]) === N - SAMPLE,
        'at a cutoff below everything, it takes the ' + (N - SAMPLE) + ' unreviewed and leaves all ' +
        SAMPLE + ' decisions alone - including the ' + refused + ' refusals (got ' +
        (tookAll ? tookAll[1] : '?') + ')');

    console.log('\nwhat a concrete word shows when it has no photograph');
    const kindLine = accepted.match(/(\d+) concrete words ended without a photograph/);
    ok(!!kindLine, 'stage 06 says how many words fell back to a kind');
    const letterLine = accepted.match(/(\d+) words show only their first letter/);
    ok(!!letterLine, 'and how many are left with just a letter');

    // Every unphotographed entry is accounted for as one or the other. A word
    // silently getting neither is the bug this whole section exists to catch.
    const shippedPics = Number((accepted.match(/\[06\] (\d+) pictures,/) || [])[1]);
    const totalEntries = (await import('../lib/entries.mjs')).loadEntries().length;
    ok(Number(kindLine[1]) + Number(letterLine[1]) + shippedPics <= totalEntries,
        'kinds + letters + pictures does not exceed the vocabulary');
    ok(Number(kindLine[1]) > 0 && Number(letterLine[1]) > 0,
        'both paths are exercised (' + kindLine[1] + ' kinds, ' + letterLine[1] + ' letters)');

    // Named individually, so a run that quietly used one bucket for everything
    // would show up. Read from the console rather than from visual-index.json:
    // every 06 here is --dry-run, and a test that asserted on the real index
    // would be reading whatever the last real build left behind - or, worse,
    // would need a run that overwrote it.
    const named = ['object', 'action', 'role']
        .filter(k => new RegExp('\\d+ ' + k + '\\b').test(accepted));
    ok(named.length === 3, 'all three kinds are used and reported (got ' + named.join(',') + ')');
    const Visual = (await import('../lib/entries.mjs')).Visual;
    for (const k of named) {
        ok(!!Visual.GLYPH['kind-' + k], 'kind-' + k + ' has a glyph the card can draw');
    }

    console.log('\nrefusing to promise what it cannot');
    const far = build06(['--accept-above', '0.9']);
    ok(/nothing was reviewed at or above that score/.test(far),
        'a cutoff above everything reviewed is called a guess, not backed by the sample');

    ok(/only supports \d+% correct/.test(all),
        'a cutoff below what the sample supports is warned about');

    // ---- the sweep of vis/ -------------------------------------------------
    //
    // Only the dry-run half is exercised, and deliberately: the risky property
    // is that --dry-run does NOT delete, and a test that let the real sweep run
    // would be deleting from the repository's own artwork directory to prove
    // it. The unlink itself is one line behind that guard.
    console.log('\nsweeping pictures the index no longer names');
    const visDir = path.join(ROOT, 'merid-extension-final', 'vis');
    const visExisted = fs.existsSync(visDir);
    const stray = path.join(visDir, 'not-a-real-slug-zzzz.webp');
    fs.mkdirSync(visDir, { recursive: true });
    fs.writeFileSync(stray, makePng(8, 8, 1));
    try {
        const swept = build06();
        ok(/would remove 1 picture\(s\) from vis\//.test(swept),
            'a picture the index no longer names is reported for removal');
        ok(fs.existsSync(stray), '--dry-run reports the sweep without performing it');
    } finally {
        fs.rmSync(stray, { force: true });
        if (!visExisted) fs.rmSync(visDir, { recursive: true, force: true });
    }

    // ---- a run where the score means nothing -------------------------------
    console.log('\na score that predicts nothing');
    fs.rmSync(path.join(STATE, 'decisions.json'), { force: true });
    const flat = build(slugs, { rising: false });
    await review(flat);
    const flatOut = build06();
    ok(/no cutoff is safe/.test(flatOut),
        'no cutoff is offered when agreement does not climb with the score');
    ok(!/node scripts\/visual\/06-build\.mjs --accept-above/.test(flatOut),
        'and no command to copy, so there is nothing to run by reflex');

    report();
}

function report() {
    // MERID_KEEP leaves the fixture behind, so a failure can be reproduced by
    // hand against the same data:
    //   MERID_STATE=scripts/visual/state/test-agreement node scripts/visual/06-build.mjs --dry-run
    if (!process.env.MERID_KEEP) fs.rmSync(STATE, { recursive: true, force: true });
    else console.log('\nfixture kept at ' + path.relative(ROOT, STATE));
    console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
