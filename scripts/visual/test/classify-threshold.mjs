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
//   --reclassify throws away the model's answers along with the local ones.
//   They cost quota and no threshold here has any bearing on them; losing them
//   silently would turn a free re-run into a paid one.
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
        (out.match(/concrete by norms\/pos: .*/) || [''])[0].trim());

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
    ok(!/concrete by norms/.test(quiet),
        'and it does not report a reclassification it did not do');

    // ---- the model's answers are not collateral ---------------------------
    console.log('\nwhat --reclassify throws away');
    fresh();
    classify();
    const entries = read();
    // Stand-ins for what a real run leaves behind: answers that cost quota.
    const llmSlugs = Object.keys(entries).filter(s => entries[s].source === 'default').slice(0, 40);
    for (const s of llmSlugs) entries[s] = { kind: 'concrete', source: 'llm' };
    fs.writeFileSync(OUT, JSON.stringify({ v: 1, entries }, null, 2));

    const report2 = classify(['--reclassify'], { MERID_CONCRETE_AT: '2.8' });
    ok(count(read(), c => c.source === 'llm') === llmSlugs.length,
        'the model\'s answers survive - they cost quota and no threshold here bears on them',
        count(read(), c => c.source === 'llm') + '/' + llmSlugs.length);
    ok(/kept 40 from the model/.test(report2), 'and it says so');

    // ---- naming the outcome instead of the threshold -----------------------
    console.log('\n--for-target');
    fresh();
    const t800 = classify(['--for-target', '800']);
    ok(/picked CONCRETE_AT=3\.0/.test(t800),
        'a target of 800 settles on 3.0',
        (t800.match(/picked CONCRETE_AT=[\d.]+/) || [''])[0]);
    ok(count(read(), c => c.kind === 'concrete') === 545,
        'which admits 545 by the norms', String(count(read(), c => c.kind === 'concrete')));

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

    // ---- a threshold that makes no sense is refused ------------------------
    console.log('\nnonsense thresholds');
    const bad = classify(['--reclassify'], { MERID_CONCRETE_AT: '2.0' });
    ok(/must be a number above MERID_ABSTRACT_AT/.test(bad),
        'a concrete floor below the abstract ceiling is refused, not silently applied');

    report();
}

function report() {
    if (!process.env.MERID_KEEP) fs.rmSync(STATE, { recursive: true, force: true });
    else console.log('\nfixture kept at ' + path.relative(ROOT, STATE));
    console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
    process.exit(failures ? 1 : 0);
}

main();
