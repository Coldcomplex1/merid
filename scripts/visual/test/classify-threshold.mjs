#!/usr/bin/env node
// What CONCRETE_AT decides, and what --reclassify does about it.
//
// This threshold is the single number that sets how much of the vocabulary is
// even ELIGIBLE for a photograph - 333 entries at 3.5, 645 at 2.8 - so it is
// the first thing anyone reaches for when they want more pictures. Two ways it
// can quietly not work, both tested here:
//
//   Lowering it changes nothing, because main() skips every entry already in
//   classification.json. That is what --reclassify is for, and a run without
//   it reports the OLD numbers while looking like it applied the new setting.
//
//   --reclassify keeps a model answer for an entry the norms can now settle.
//   The model was asked because the old threshold left it borderline; pinning
//   it there means lowering the threshold reaches nothing, which is exactly how
//   three widening runs in a row produced the pool they started with.
//
// Runs the real stage against the real corpus, offline, in a state directory
// of its own.
//
//   node scripts/visual/test/classify-threshold.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const STATE = path.join(HERE, '..', 'state', 'test-classify');
const NORMS = path.join(HERE, '..', 'state', 'brysbaert-concreteness.txt');
const OUT = path.join(STATE, 'classification.json');

// The numbers the thresholds actually produce on the shipped CSVs. Written down
// rather than recomputed, because a test that derives its expectation from the
// same code it is testing agrees with any bug that code has.
const AT_DEFAULT = 333;
const AT_2_8 = 645;

let failures = 0;
function ok(cond, what, detail) {
    console.log((cond ? '  ok   ' : '  FAIL ') + what + (detail ? ' -> ' + detail : ''));
    if (!cond) failures++;
}

function classify(extraArgs = [], env = {}) {
    const r = spawnSync(process.execPath,
        ['scripts/visual/01-classify.mjs', '--offline', ...extraArgs],
        { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MERID_STATE: STATE, ...env } });
    return (r.stdout || '') + (r.stderr || '');
}

const read = () => JSON.parse(fs.readFileSync(OUT, 'utf8')).entries;
const count = (entries, pred) => Object.values(entries).filter(pred).length;

function main() {
    // The norms are 1.6MB of someone else's research data, fetched on demand and
    // deliberately not committed. Downloading them inside a test would make this
    // depend on a third party being up; on the machine that runs the pipeline
    // they are already here, which is where this test earns its keep.
    if (!fs.existsSync(NORMS)) {
        console.log('SKIP: no concreteness norms on disk yet.');
        console.log('      Run stage 01 once (it fetches them), then this test works:');
        console.log('        node scripts/visual/01-classify.mjs --offline');
        process.exit(0);
    }

    // Each case starts from nothing.
    //
    // These runs are not independent: an offline run leaves 1,873 entries at
    // source 'default', meaning "the model was asked and did not answer", and
    // main() deliberately re-evaluates those every time. Chaining the cases
    // therefore had case two measuring what case one had already moved - which
    // is how the first version of this file "failed" three assertions about
    // code that was doing exactly the right thing.
    const fresh = () => {
        fs.rmSync(STATE, { recursive: true, force: true });
        fs.mkdirSync(STATE, { recursive: true });
        fs.copyFileSync(NORMS, path.join(STATE, 'brysbaert-concreteness.txt'));
    };

    // ---- what each threshold admits ---------------------------------------
    console.log('what the threshold admits');
    fresh();
    classify();
    const base = count(read(), c => c.kind === 'concrete');
    ok(base === AT_DEFAULT, 'the shipped default admits ' + AT_DEFAULT + ' concrete entries',
        String(base));

    const out = classify(['--reclassify'], { MERID_CONCRETE_AT: '2.8' });
    const widened = count(read(), c => c.kind === 'concrete');
    ok(widened === AT_2_8, '2.8 admits ' + AT_2_8, String(widened));
    ok(new RegExp('\\(was ' + base + ', \\+' + (widened - base) + '\\)').test(out),
        'and it says how many moved',
        (out.match(/eligible for a photograph: .*/) || [''])[0].trim());

    // ---- the same threshold twice is a no-op ------------------------------
    const again = count(read(), c => c.kind === 'concrete');
    classify(['--reclassify'], { MERID_CONCRETE_AT: '2.8' });
    ok(count(read(), c => c.kind === 'concrete') === again,
        'the same threshold twice gives the same answer', String(again));

    // ---- lowering it WITHOUT --reclassify leaves the cache alone ----------
    //
    // Checked against the entries --reclassify actually governs - the ones this
    // stage answered locally. Comparing totals instead would fold in the
    // 'default' entries, which are re-evaluated by design and would make an
    // inert run look like a working one.
    console.log('\nlowering the threshold alone');
    fresh();
    classify();
    const localBefore = Object.fromEntries(Object.entries(read())
        .filter(([, c]) => c.source === 'norms' || c.source === 'pos')
        .map(([slug, c]) => [slug, c.kind]));
    const quiet = classify([], { MERID_CONCRETE_AT: '2.8' });
    const after = read();
    const moved = Object.keys(localBefore).filter(s => !after[s] || after[s].kind !== localBefore[s]);
    ok(moved.length === 0,
        'not one cached answer moves, however low the threshold goes',
        moved.length + ' of ' + Object.keys(localBefore).length + ' changed');
    ok(!/eligible for a photograph/.test(quiet),
        'and it does not report a reclassification it did not do');

    // ---- what --reclassify keeps, and what it takes back -------------------
    //
    // The rule that makes widening work at all: a model answer stands only
    // while the norms still cannot settle the entry themselves. The model was
    // asked because the OLD threshold left it borderline; under a lower one it
    // is not borderline, and keeping the old verdict pins the entry there for
    // good. That is exactly what went wrong - lowering the threshold moved
    // nothing, run after run, because every borderline word had been answered
    // once and could never be reached again.
    console.log('\nwhat --reclassify keeps');
    fresh();
    classify();
    const entries = read();
    const llm = Object.keys(entries).filter(s => entries[s].source === 'default');
    for (const s of llm) entries[s] = { kind: 'abstract', source: 'llm' };
    fs.writeFileSync(OUT, JSON.stringify({ v: 1, entries }, null, 2));
    const poolBefore = count(read(), c => c.kind === 'concrete');

    const out2 = classify(['--reclassify'], { MERID_CONCRETE_AT: '2.8' });
    const reclassified = read();
    const kept = llm.filter(s => reclassified[s] && reclassified[s].source === 'llm');
    const taken = llm.filter(s => reclassified[s] && reclassified[s].source !== 'llm');

    ok(kept.length + taken.length === llm.length,
        'every model answer is either kept or taken back, none lost',
        kept.length + ' + ' + taken.length + ' of ' + llm.length);
    ok(kept.length > 0 && taken.length > 0,
        'both happen: some the norms can now settle, some they still cannot',
        kept.length + ' kept, ' + taken.length + ' taken back');
    ok(new RegExp('took back ' + taken.length + ' ').test(out2),
        'and it says how many it took back',
        (out2.match(/took back \d+/) || [''])[0]);
    ok(count(reclassified, c => c.kind === 'concrete') > poolBefore,
        'which is what lets a lower threshold actually widen the pool',
        poolBefore + ' -> ' + count(reclassified, c => c.kind === 'concrete'));


    // ---- naming the outcome instead of the threshold -----------------------
    console.log('\n--for-target');
    fresh();
    const t800 = classify(['--for-target', '800']);
    // What it promised against what it produced. These were 977 and 563 once,
    // and every stage after it worked on a pool a third smaller than the run
    // had announced.
    const promised = Number((t800.match(/picked CONCRETE_AT=[\d.]+ -> (\d+)/) || [])[1]);
    const produced = count(read(), c => c.kind === 'concrete');
    // On a state the model has never seen, its share can only be estimated, so
    // the promise is a floor rather than an equality. What must never happen is
    // promising MORE than it delivers - that was 977 against 563, and every
    // stage after it worked on a pool a third smaller than announced.
    ok(produced >= promised,
        'it never promises a bigger pool than it produces',
        promised + ' promised, ' + produced + ' produced');
    ok(produced >= 800, 'and it clears the target', String(produced));

    // Once the model has answered, there is nothing left to estimate and the
    // promise has to be exact. This is the path every re-run takes.
    const seeded = read();
    for (const [slug, c] of Object.entries(seeded)) {
        if (c.source === 'default') seeded[slug] = { kind: c.kind, source: 'llm' };
    }
    fs.writeFileSync(OUT, JSON.stringify({ v: 1, entries: seeded }, null, 2));
    const exact = classify(['--for-target', '900']);
    const exactPromised = Number((exact.match(/picked CONCRETE_AT=[\d.]+ -> (\d+)/) || [])[1]);
    const exactProduced = count(read(), c => c.kind === 'concrete');
    ok(exactProduced >= 900,
        'a re-run against the model\'s own answers still clears the target',
        String(exactProduced));
    // Not equality, and the reason is worth writing down: at a low threshold
    // some entries stop being "abstract by the norms" and become "rated as a
    // different part of speech", which is a question only the model can settle.
    // They have never been asked, so their share is still estimated - a small
    // one, and it has to stay on the safe side of the truth.
    ok(exactPromised <= exactProduced + Math.ceil(exactProduced * 0.02),
        'and its estimate stays within 2% of what it delivers',
        exactPromised + ' promised, ' + exactProduced + ' produced');
    ok(/aiming at 920/.test(t800),
        'aiming above the target, since not every eligible word finds a picture',
        (t800.match(/aiming at \d+/) || [''])[0]);

    fresh();
    const t100 = classify(['--for-target', '100']);
    ok(/picked CONCRETE_AT=3\.5/.test(t100),
        'a target the default already covers does not widen anything',
        (t100.match(/picked CONCRETE_AT=[\d.]+/) || [''])[0]);
    ok(count(read(), c => c.kind === 'concrete') === AT_DEFAULT,
        'and leaves the default pool alone', String(count(read(), c => c.kind === 'concrete')));

    fresh();
    const huge = spawnSync(process.execPath,
        ['scripts/visual/01-classify.mjs', '--offline', '--for-target', '5000'],
        { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MERID_STATE: STATE } });
    ok(huge.status === 1,
        'a target the vocabulary cannot carry stops the run', 'exit ' + huge.status);
    ok(/cannot reach 5000/.test((huge.stdout || '') + (huge.stderr || '')),
        'and says what the ceiling actually is',
        (((huge.stdout || '') + (huge.stderr || '')).match(/Pick a target at or under \d+/) || [''])[0]);


    // ---- a measured yield sizes the pool, a guessed one flatters it -------
    //
    // The fixed 1.15 margin assumes 87% of eligible words end with a picture.
    // The real figure on the first full run was nothing like that, and the gap
    // between the two is the whole distance between "pool of 771" and "fifteen
    // pictures". --yield replaces the assumption with a measurement.
    console.log('\n--yield');
    fresh();
    const guessed = classify(['--for-target', '800']);
    ok(/aiming at 920/.test(guessed),
        'without --yield the aim is the old 15% margin', 'aiming at 920');

    fresh();
    const halved = classify(['--for-target', '800', '--yield', '0.5']);
    ok(/aiming at 1600/.test(halved),
        'a yield of 0.5 asks for twice the target, not 15% more',
        (halved.match(/aiming at \d+/) || [''])[0]);
    ok(/measured yield of 0\.5/.test(halved),
        'and says the number came from a measurement rather than a default');
    const halvedPool = count(read(), c => c.kind === 'concrete');
    ok(halvedPool >= 1600,
        'and the pool it builds actually reaches that aim', String(halvedPool));

    fresh();
    const generous = classify(['--for-target', '800', '--yield', '0.95']);
    ok(/aiming at 843/.test(generous),
        'a high yield asks for barely more than the target',
        (generous.match(/aiming at \d+/) || [''])[0]);

    const badYield = classify(['--for-target', '800', '--yield', '1.5']);
    ok(/--yield needs a fraction/.test(badYield),
        'a yield outside 0-1 is refused rather than silently clamped');

    // ---- the ladder reaches past 2.0 ---------------------------------------
    //
    // It used to stop there, which capped the pool at about 1,565 and made any
    // target over 1,361 "impossible" - a property of the ladder reported as a
    // property of the vocabulary.
    console.log('\nthe bottom of the ladder');
    fresh();
    const deep = classify(['--for-target', '1600']);
    ok(!/cannot reach/.test(deep),
        'a target that needs a threshold under 2.0 is reachable now');
    const picked = (deep.match(/picked CONCRETE_AT=([\d.]+)/) || [])[1];
    ok(picked !== undefined && Number(picked) < 2.0,
        'and it goes below 2.0 to get there', 'picked ' + picked);
    ok(count(read(), c => c.kind === 'concrete') >= 1600,
        'the pool really is that wide',
        String(count(read(), c => c.kind === 'concrete')));

    // ---- the two bars, when the lower one is the concrete one --------------
    //
    // This used to be refused as nonsense, and the refusal was the nonsense:
    // --for-target walks to 1.0 with the abstract bar left at 2.6, so the
    // configuration rejected from the environment is the one this stage runs on
    // itself - and it is the one every doc and stop message recommends.
    console.log('\nthe concrete bar below the abstract one');
    fresh();
    const inverted = classify(['--reclassify'], { MERID_CONCRETE_AT: '2.0' });
    ok(!/must be a number/.test(inverted),
        'a concrete bar under the abstract one runs rather than being refused');
    ok(/settled abstract from the norms/.test(inverted),
        'and says what the pair means instead of leaving it to be guessed');
    const invertedPool = count(read(), c => c.kind === 'concrete');
    ok(invertedPool >= 1315,
        'it really does widen the pool, the same as the ladder does internally',
        String(invertedPool));
    ok(count(read(), c => !c.kind) === 0,
        'and every entry still has an answer - nothing falls between the bars');

    const nan = classify(['--reclassify'], { MERID_CONCRETE_AT: 'wide' });
    ok(/must be numbers/.test(nan), 'a threshold that is not a number is still refused');

    report();
}

function report() {
    if (!process.env.MERID_KEEP) fs.rmSync(STATE, { recursive: true, force: true });
    else console.log('\nfixture kept at ' + path.relative(ROOT, STATE));
    console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
    process.exit(failures ? 1 : 0);
}

main();
