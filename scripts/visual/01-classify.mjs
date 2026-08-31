#!/usr/bin/env node
// Stage 01 - decide, for every entry, whether it is something you can put in
// front of a camera.
//
// Photographs are for words a photograph can actually mean. "Anchor" yes;
// "notwithstanding" no, and a stock photo of a thoughtful person at a window
// would be worse than the honest concept glyph, because it teaches nothing and
// looks like the extension guessed. So this stage is the one that decides how
// much of the feature is photographs at all.
//
// The ordering below is deliberate: the cheap, principled answer first, and the
// model only where the cheap answer cannot exist.
//
// Norms before model. Brysbaert et al. (2014) rated 40,000 English lemmas 1-5
// for concreteness with about 4,000 human raters. It is free, instant,
// reproducible and better than anything a language model will tell us about the
// same question - and it covers 74.9% of our entries. Asking a model first
// would be slower, less consistent between runs, and no more correct.
//
// But a norm is per WORD FORM, and our unit is a SENSE. "delegate" carries one
// concreteness score, and it cannot separate the SAT verb ("to hand over
// responsibility", abstract) from the C1 noun ("a person chosen to represent a
// group", photographable). Handing both senses the same score misclassifies one
// of them, and nothing downstream catches it: stage 04 checks that a picture
// matches its query, never that the concrete/abstract call was right. So the
// 437 polysemous words skip the norms entirely and go to the model with their
// own definition attached.
//
// Usage:
//   node scripts/visual/01-classify.mjs [--offline] [--limit N] [--reclassify]
//
//   node scripts/visual/01-classify.mjs --for-target 800
//     name how many entries should be able to have a photograph and let this
//     stage find the threshold. Implies --reclassify.
//
//   node scripts/visual/01-classify.mjs --ceiling
//     the largest pool this vocabulary can give, printed and nothing else.
//
//   node scripts/visual/01-classify.mjs --for-target 800 --yield 0.62
//     the same, sized from a MEASURED yield rather than a guessed one.
//     node scripts/visual/try.mjs --sample 80 measures it.
//
//   MERID_CONCRETE_AT=2.8 node scripts/visual/01-classify.mjs --reclassify
//     widen the pool of entries eligible for a photograph. --reclassify is not
//     optional there: without it the cached answers are kept and nothing moves.
import fs from 'node:fs';
import { loadEntries, sensesPerWord, statePath, ensureState, writeJson, readJson, progress } from './lib/entries.mjs';
import { Llm, LlmUnusable, parseJsonish, chunk } from './lib/llm.mjs';

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const LIMIT = (() => {
    const i = args.indexOf('--limit');
    return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

/**
 * Throw away the answers this stage worked out for itself, and work them out
 * again.
 *
 * Only the local ones - `norms` and `pos`. They are a threshold applied to a
 * lookup table, so they cost nothing to redo and they are the ONLY answers a
 * changed threshold can change. The model's answers are kept: they cost quota,
 * and no threshold here has any bearing on what a model said about a word.
 *
 * Without this the thresholds below are decorative. The loop in main() skips
 * every entry already in classification.json, so lowering CONCRETE_AT and
 * running again reads the cache and reports the old numbers - a change that
 * looks applied and is not.
 */
const RECLASSIFY = args.includes('--reclassify') || args.includes('--for-target');

/**
 * Report the largest pool this vocabulary can give, and change nothing.
 *
 * Read-only on purpose: a caller asking "what is the most this could ever be"
 * must not have to reclassify the corpus to find out, and must not be left with
 * a widened pool it did not ask for.
 */
const CEILING = args.includes('--ceiling');

/**
 * How many entries this run should leave eligible for a photograph.
 *
 * The threshold below decides that, and asking someone to read a table and
 * then set an environment variable is three chances to get nothing: pick the
 * wrong number, set it in a different shell, or forget --reclassify and have
 * the whole thing quietly report the old figures. All three happened.
 *
 * So: name the outcome, and let this stage find the threshold. Trying a
 * threshold is a table lookup over the norms - no request, no network - so
 * trying six of them costs nothing.
 *
 * Implies --reclassify, because a target that leaves the cache in place is a
 * target that does nothing.
 */
const FOR_TARGET = (() => {
    const i = args.indexOf('--for-target');
    if (i < 0) return null;
    const n = Number(args[i + 1]);
    if (!Number.isInteger(n) || n < 1) {
        console.error('[01] --for-target needs a whole number of entries, e.g. --for-target 800');
        process.exit(1);
    }
    return n;
})();

/**
 * What fraction of an eligible entry becomes a picture, measured rather than
 * assumed.
 *
 * The pool has to be bigger than the target because being ELIGIBLE for a
 * photograph is not having one: the model still refuses some, the archives find
 * nothing for others, and a few will not encode. TARGET_MARGIN below puts that
 * loss at 13%, which is a guess, and an optimistic one - it is why a pool of
 * 771 was treated as enough for 800 pictures and produced fifteen.
 *
 * try.mjs --sample measures the real figure on this machine in about twelve
 * minutes. Given here, it replaces the guess: aim = target / yield.
 */
const YIELD = (() => {
    const i = args.indexOf('--yield');
    if (i < 0) return null;
    const n = Number(args[i + 1]);
    if (!Number.isFinite(n) || n <= 0 || n > 1) {
        console.error('[01] --yield needs a fraction between 0 and 1, e.g. --yield 0.62');
        console.error('      Measure it:  node scripts/visual/try.mjs --sample 80');
        process.exit(1);
    }
    return n;
})();

// Tried in this order, stopping at the first that reaches the target. Coarse on
// purpose: the difference between 2.9 and 2.8 is a handful of words, and a
// finer sweep would suggest a precision the underlying ratings do not have.
//
// The tail below 2.0 is not where anyone should want to be: at 1.0 every word
// the norms scored is eligible, "purpose" and "method" included, and what a
// photograph of those means is a staged scene. It is there because the ladder
// stopping at 2.0 capped the pool at about 1,565 entries, and a target that
// needs more than that was refused with "this vocabulary cannot carry it" when
// the vocabulary can - the ladder could not. Stage 02 is the real gate on
// whether a word can be photographed honestly, and it still refuses these.
const TARGET_STEPS = [3.5, 3.2, 3.0, 2.8, 2.6, 2.4, 2.2, 2.0, 1.8, 1.5, 1.0];

/**
 * How far above the target to aim.
 *
 * Being eligible for a photograph is not having one: some words turn up no
 * candidate that scores, and some candidates will not encode small enough. A
 * pool the exact size of the target can only miss it, so the pool is asked to
 * be bigger than the target by this much.
 */
const TARGET_MARGIN = 1.15;

/**
 * What the model is likely to add on top of the local answers.
 *
 * Measured, not assumed: on the first full run 642 entries came out concrete
 * and 333 of those were local, so the model contributed about 309 of the 1,873
 * it was asked about - a sixth. Used only to choose a threshold, and the
 * choice is reported with both halves shown so a bad estimate is visible
 * rather than load-bearing.
 */
const MODEL_SHARE = 1 / 6;

// Brysbaert's own thresholds are not prescribed; these come from where the
// distribution actually separates for this vocabulary. 3.5 keeps "anchor" and
// drops "tendency"; 2.6 is low enough that anything under it is not worth six
// API calls to confirm.
//
// Overridable because they are the one knob that decides how much of the
// vocabulary is even ELIGIBLE for a photograph, and the right setting is a
// judgement about the product rather than a fact about the data. At 3.5 about
// 640 entries go looking for a picture; at 2.8, about 950. Lower admits words
// whose "photograph" is a staged scene rather than the thing itself, which is
// why the default stays where it is.
//
//   MERID_CONCRETE_AT=2.8 node scripts/visual/01-classify.mjs --reclassify
let CONCRETE_AT = Number(process.env.MERID_CONCRETE_AT || 3.5);
const ABSTRACT_AT = Number(process.env.MERID_ABSTRACT_AT || 2.6);
if (!Number.isFinite(CONCRETE_AT) || !Number.isFinite(ABSTRACT_AT)) {
    console.error('[01] MERID_CONCRETE_AT and MERID_ABSTRACT_AT must be numbers');
    console.error('     got concrete=' + process.env.MERID_CONCRETE_AT +
        ' abstract=' + process.env.MERID_ABSTRACT_AT);
    process.exit(1);
}
// A concrete bar under the abstract one used to be refused as nonsense. It is
// not nonsense, and refusing it was: --for-target walks the ladder down to 1.0
// and leaves the abstract bar at 2.6 the whole way, so the run refused from the
// environment was the run it performs on itself. Worse, every piece of advice
// in the docs and in run.mjs's own stop messages - MERID_CONCRETE_AT=2.4 - hit
// it. Read the pair as two bars rather than a band and it is plain: over the
// concrete one is concrete, and everything under it is settled as abstract by
// the arm below. Nothing is unanswered, and nothing extra goes to the model.
if (ABSTRACT_AT >= CONCRETE_AT) {
    console.log('[01] concrete >= ' + CONCRETE_AT + ' sits under abstract <= ' + ABSTRACT_AT +
        ', so every word below the concrete bar is settled abstract from the norms.');
}

/**
 * Move the concrete bar. ABSTRACT_AT deliberately does NOT move with it.
 *
 * The two look like a pair bracketing a band of "worth asking the model about",
 * and below 2.6 the pair inverts - which reads like a bug and is not. Look at
 * what classifyLocally does with an inverted pair, say concrete 2.2 and
 * abstract 2.6: a word scoring 2.4 is over the concrete bar, so it is concrete
 * when the part of speech agrees and a question for the model when it does not;
 * a word scoring 2.1 falls through to `conc <= 2.6` and is settled as abstract.
 * Every word is still answered, and answered locally.
 *
 * Dragging ABSTRACT_AT down to stay under CONCRETE_AT breaks exactly that. The
 * 2.1 above then matches neither arm, so it goes to the model - and at 2.2 that
 * is hundreds of entries sent off to be asked a question the norms had already
 * answered, for a pool that comes out SMALLER. Measured: 1,097 eligible became
 * 958. This function exists to hold that comment next to the assignment.
 */
function setConcreteAt(v) {
    CONCRETE_AT = v;
}

// Parts of speech no photograph can carry, whatever the norms say about the
// word form. Checked first because it is free and never wrong.
const NEVER_CONCRETE_POS = /\b(conjunction|preposition|determiner|pronoun|auxiliary|article)\b/i;

const NORMS_FILE = statePath('brysbaert-concreteness.txt');
const NORMS_URL = 'https://raw.githubusercontent.com/ArtsEngine/concreteness/master/Concreteness_ratings_Brysbaert_et_al_BRM.txt';
const OUT = statePath('classification.json');

/**
 * Load the norms, fetching them once if they are not here yet.
 *
 * Not committed to the repo: it is 1.6MB of someone else's research data whose
 * redistribution terms we have not established, and it is trivially
 * re-fetchable. Cite it, do not vendor it.
 */
async function loadNorms() {
    ensureState();
    // Read first and fetch only if the read fails, rather than asking
    // existsSync and then acting on the answer. The gap between the two is a
    // real one - try.mjs copies this very file into a trial state directory
    // while a run may be starting - and the fix is also simpler: one syscall
    // that either gives you the bytes or does not.
    let raw = null;
    try { raw = fs.readFileSync(NORMS_FILE, 'utf8'); } catch (e) { /* not there yet */ }
    if (raw === null) {
        console.log('[01] fetching Brysbaert concreteness norms (once)...');
        const resp = await fetch(NORMS_URL);
        if (!resp.ok) throw new Error('could not fetch norms: ' + resp.status);
        const buf = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(NORMS_FILE, buf);
        raw = buf.toString('utf8');
    }
    const norms = new Map();
    const lines = raw.split(/\r?\n/);
    for (const line of lines.slice(1)) {
        const f = line.split('\t');
        if (f.length < 9) continue;
        const conc = Number(f[2]);
        if (!Number.isFinite(conc)) continue;
        norms.set(f[0].toLowerCase(), { conc, known: Number(f[6]), pos: f[8] });
    }
    return norms;
}

/**
 * Does the norms' score describe the same word this entry is about?
 *
 * Brysbaert rates a word FORM, and the file records which part of speech that
 * form usually is. When ours disagrees, the number is about something else:
 * `skirt` scores 4.82 as a Noun, which is the garment, while our entry is the
 * verb meaning "evade a question". `table` scores 4.9 as a Noun against our
 * verb "lay aside to discuss later". Both were classified concrete on the
 * strength of a score for a different word, and both then went looking for a
 * photograph of one.
 *
 * Our own type field can list more than one ("verb, noun"); the first is the
 * sense the definition leads with, so that is the one that has to match.
 */
function posAgrees(entryType, normPos) {
    const ours = String(entryType || '').split(',')[0].trim().toLowerCase();
    const theirs = String(normPos || '').trim().toLowerCase();
    if (!ours || !theirs || theirs === '#n/a') return false;
    return ours === theirs;
}

/**
 * How big a pool a target of `n` pictures needs.
 *
 * With a measured yield this is division; without one it is TARGET_MARGIN's
 * 13% guess, kept as the default so a run that does not measure behaves as it
 * always did. Both callers go through here so they cannot disagree.
 */
function aimFor(n) {
    return Math.ceil(YIELD ? n / YIELD : n * TARGET_MARGIN);
}

/** How the aim was arrived at, for the line that reports it. */
function aimWhy() {
    return YIELD
        ? 'at a measured yield of ' + YIELD + ' - ' +
          Math.round((1 - YIELD) * 100) + '% of eligible words end without a picture'
        : 'since not every eligible word finds a usable picture';
}

/**
 * The highest threshold that still leaves `target` entries able to have a
 * photograph, or null if even the lowest one cannot get there.
 *
 * Highest rather than lowest: every step down admits words whose "photograph"
 * is more of a staged scene, so the right answer is the least widening that
 * does the job.
 *
 * The model's share is COUNTED, not estimated, wherever it can be. An earlier
 * version guessed it at a sixth of everything the model would be asked about,
 * which on a re-run is guessing at a number already sitting in
 * classification.json: the model has answered, its answers are kept, and how
 * many of them are concrete is simply known. The guess said 822 and the truth
 * was 771, which is the difference between clearing a target of 800 and being
 * stopped by it. Only entries the model has never been asked about are
 * estimated - on a re-run there are none, and the arithmetic is exact.
 */
function thresholdFor(target, entries, norms, senses, cached) {
    const tried = [];
    const was = CONCRETE_AT;
    let picked = null;
    for (const step of TARGET_STEPS) {
        setConcreteAt(step);              // classifyLocally reads both
        let local = 0;
        let fromModel = 0;
        let unasked = 0;
        for (const entry of entries) {
            const c = classifyLocally(entry, norms, senses);
            if (c) { if (c.kind === 'concrete') local++; continue; }
            // No local answer at this threshold, so the model decides it. If it
            // already has, that answer stands and is counted here; if it has not
            // been asked, its answer has to be estimated.
            const had = cached.bySlug.get(entry.slug);
            if (had) { if (had === 'concrete') fromModel++; }
            else unasked++;
        }
        const total = Math.round(local + fromModel + unasked * MODEL_SHARE);
        tried.push({ step, local, fromModel, total, exact: unasked === 0 });
        if (total >= target) { picked = step; break; }
    }
    CONCRETE_AT = was;
    return { picked, tried };
}

/**
 * What the model has already said, which --reclassify keeps.
 *
 * `answered` is every entry it has ruled on; `concrete` is how many of those
 * can carry a photograph. Both are facts about the file on disk, and both are
 * what makes thresholdFor exact on any run after the first.
 */
function cachedFromModel(existing) {
    const bySlug = new Map();
    let concrete = 0;
    for (const [slug, c] of Object.entries(existing || {})) {
        if (!c || (c.source !== 'llm' && c.source !== 'default')) continue;
        bySlug.set(slug, c.kind);
        if (c.kind === 'concrete') concrete++;
    }
    return { bySlug, concrete };
}

/** Which bucket an entry lands in, and why - the "why" is what makes a re-run reviewable. */
function classifyLocally(entry, norms, senses) {
    if (NEVER_CONCRETE_POS.test(entry.type || '')) {
        return { kind: 'abstract', source: 'pos' };
    }
    // More than one sense under this headword: a single per-word score cannot
    // speak for both, so refuse to let it.
    if ((senses.get(entry.word.toLowerCase()) || 1) > 1) {
        return null;
    }
    const n = norms.get(entry.word.toLowerCase());
    if (!n) return null;
    // A word most raters did not recognise has a score built from very few
    // opinions. Treat it as unknown rather than trusting a thin average.
    if (Number.isFinite(n.known) && n.known < 0.85) return null;

    // Where the parts of speech disagree, the score is trusted in one direction
    // only. "Abstract" is safe to accept from the wrong sense: a word given a
    // symbol loses little, and a form that is abstract as a noun is rarely
    // photographable as a verb either. "Concrete" is not safe, because that is
    // precisely how a garment gets a verb sent out looking for photographs of
    // itself - so it goes to the model, with the definition attached.
    const agrees = posAgrees(entry.type, n.pos);
    if (n.conc >= CONCRETE_AT) {
        return agrees ? { kind: 'concrete', source: 'norms', conc: n.conc } : null;
    }
    if (n.conc <= ABSTRACT_AT) return { kind: 'abstract', source: 'norms', conc: n.conc };
    return null;   // borderline: worth a question
}

const PROMPT_HEAD = [
    'You decide which English vocabulary entries a photograph could honestly',
    'illustrate, for a tool that shows learners a picture beside a definition.',
    '',
    'Apply one test. Imagine sending a photographer out with only this entry as',
    'their brief. Could they come back with a photograph, and would a learner who',
    'saw it - without being told the word - arrive at roughly this meaning?',
    '',
    'If yes, "concrete". If it would take a metaphor, a staged scene, a caption or',
    'an arrow to work, "abstract".',
    '',
    'Read the EXAMPLE SENTENCE before deciding. It shows the sense actually being',
    'taught, and it overrides any other sense the spelling might have. "skirt" is',
    'defined as "go around, evade" and its example is about evading a question:',
    'that entry is ABSTRACT. A photograph of a path around a hill illustrates a',
    'different word than the one being taught.',
    '',
    'Say ABSTRACT for:',
    ' - manner, degree, relation, likelihood, obligation, attitude',
    ' - a process or change with no single moment that shows it',
    ' - a verb whose object is a thought, a claim, a feeling or a rule, however',
    '   physical the verb sounds (grasp an idea, weigh an argument, skirt a topic)',
    ' - anything where the photograph would be of a person LOOKING like they are',
    '   doing it, rather than of the thing itself',
    '',
    'Say CONCRETE for:',
    ' - a physical object, place, plant, animal, tool, garment, building',
    ' - a visible action caught mid-motion, with a real subject doing it',
    ' - an occupation or role recognisable by what the person wears or holds',
    '',
    'When you hesitate, answer ABSTRACT. A word given a symbol loses nothing; a',
    'word given a photograph of the wrong sense teaches the wrong sense.',
    '',
    'Reply with a JSON array only. One object per entry, in the same order:',
    '  {"id": <the id given>, "kind": "concrete" | "abstract"}',
    ''
].join('\n');

function renderBatch(items) {
    const lines = items.map(e => [
        'id: ' + e.id,
        'word: ' + e.word,
        'part of speech: ' + (e.type || 'unknown'),
        'definition: ' + (e.definition || '').slice(0, 220),
        // The example is the whole point. A definition can list several senses -
        // "Border, lie along the edge of, go around; evade" - and the model will
        // seize on whichever sounds most photographable. The sentence shows the
        // one the reader will actually meet on the card.
        'example: ' + (e.example || '(none)').slice(0, 180)
    ].join('\n'));
    return PROMPT_HEAD + '\n' + lines.join('\n\n');
}

function parseBatch(text) {
    const out = new Map();
    const json = parseJsonish(text);
    if (!Array.isArray(json)) return out;
    for (const row of json) {
        if (!row || typeof row !== 'object') continue;
        const kind = String(row.kind || '').toLowerCase();
        // Closed vocabulary: anything else is dropped, not coerced.
        if (kind !== 'concrete' && kind !== 'abstract') continue;
        out.set(String(row.id), kind);
    }
    return out;
}

async function main() {
    const entries = loadEntries();
    const senses = sensesPerWord(entries);
    const norms = await loadNorms();
    console.log('[01] ' + entries.length + ' entries, ' + norms.size + ' words of norms');

    const result = readJson(OUT, { v: 1, entries: {} });
    result.v = 1;
    result.entries = result.entries || {};

    // The largest pool this vocabulary can be made to yield, asked and answered
    // without changing anything.
    //
    // It exists because the caller that needed it was guessing. run.mjs was
    // multiplying the measured yield by the CORPUS - 3,257 senses - to say what
    // the most this could give was, and the corpus is not the pool: at the
    // bottom of the ladder about 1,969 entries can carry a photograph, and the
    // rest are words no photograph means. That arithmetic promised 651 pictures
    // where the truth was 394, twice, in a message whose whole job was to be
    // the honest number.
    if (CEILING) {
        const cached = cachedFromModel(result.entries);
        // An unreachable ask, so the walk runs out of thresholds and reports
        // what the last one gave - which is the ceiling by definition.
        const { tried } = thresholdFor(Infinity, entries, norms, senses, cached);
        const best = tried[tried.length - 1];
        console.log('[01] ceiling: ' + best.total + ' entries could carry a photograph at ' +
            'CONCRETE_AT=' + best.step.toFixed(1) + ',');
        console.log('     the lowest threshold this will go to (' + best.local +
            ' from the norms, ' + cached.concrete + ' from the model' +
            (best.exact ? '' : ', part estimated') + ').');
        console.log('[01] ceiling=' + best.total);
        return;                                  // writes nothing, changes nothing
    }

    // What the whole corpus looked like before this run touched it, for the
    // one comparison anybody wants: did the pool get bigger, and by how much.
    const totalConcreteBefore = Object.values(result.entries)
        .filter(c => c && c.kind === 'concrete').length;

    if (FOR_TARGET) {
        const cached = cachedFromModel(result.entries);

        // Aimed above the target on purpose. Being ELIGIBLE for a photograph is
        // not having one: some of these words will turn up no candidate that
        // scores, and some of those candidates will not encode. A pool the exact
        // size of the target can only miss it.
        const aim = aimFor(FOR_TARGET);
        const { picked, tried } = thresholdFor(aim, entries, norms, senses, cached);

        console.log('[01] --for-target ' + FOR_TARGET + ': aiming at ' + aim +
            ' eligible, ' + aimWhy());
        console.log('[01] ' + tried.map(t => t.step.toFixed(1) + ' -> ' + t.total).join(', ') +
            (tried[0] && tried[0].exact
                ? '   (counted, not estimated - the model has already answered)'
                : '   (part estimated - the model has not been asked yet)'));

        if (picked === null) {
            const best = tried[tried.length - 1];
            console.error('');
            console.error('[01] cannot reach ' + FOR_TARGET + ' pictures from this vocabulary.');
            console.error('     The lowest threshold this will go to is ' + best.step.toFixed(1) +
                ', and even there only ' + best.total);
            console.error('     entries could carry a photograph (' + best.local +
                ' from the norms, ' + cached.concrete + ' from the model).');
            console.error('');
            console.error('     Below that the words are ones no photograph can mean - the whole');
            console.error('     corpus is ' + entries.length + ' senses and most of them are abstract.');
            console.error('     Pick a target at or under ' +
                Math.floor(YIELD ? best.total * YIELD : best.total / TARGET_MARGIN) + '.');
            process.exit(1);
        }
        setConcreteAt(picked);
        const at = tried[tried.length - 1];
        console.log('[01] picked CONCRETE_AT=' + picked.toFixed(1) + ' -> ' + at.total +
            ' eligible (' + at.local + ' by the norms, ' + cached.concrete + ' from the model)');
    }

    // What the thresholds decided last time, dropped so this run's thresholds
    // decide it instead. Counted before and after so the summary can say what
    // actually moved rather than leaving it to be inferred from a total.
    const before = { concrete: 0, abstract: 0 };
    let dropped = 0;
    let keptLlm = 0;
    if (RECLASSIFY) {
        // A model answer is dropped too, but only where the norms can now settle
        // the entry themselves.
        //
        // The model was asked about it because the OLD threshold left it
        // borderline. Under a lower one it is not borderline any more - the
        // norms decide it - so keeping the old answer is keeping a verdict on a
        // question that is no longer being asked. And keeping it is fatal to the
        // whole exercise: an entry once answered by the model could never be
        // reached again, so lowering the threshold moved nothing and every
        // widening run produced the same pool it started with.
        //
        // Entries the norms still cannot settle - polysemous, absent from the
        // norms, rated as a different part of speech - keep their answers. Those
        // cost quota and no threshold here can replace them.
        const byLocal = new Map();
        for (const entry of entries) byLocal.set(entry.slug, classifyLocally(entry, norms, senses));

        let reclaimed = 0;
        for (const [slug, c] of Object.entries(result.entries)) {
            if (!c) continue;
            const local = byLocal.get(slug);
            if (c.source === 'norms' || c.source === 'pos') {
                before[c.kind] = (before[c.kind] || 0) + 1;
                delete result.entries[slug];
                dropped++;
            } else if (c.source === 'llm' || c.source === 'default') {
                if (local) { delete result.entries[slug]; reclaimed++; }
                else keptLlm++;
            }
        }
        console.log('[01] --reclassify: dropped ' + dropped +
            ' local answers (' + before.concrete + ' concrete, ' + before.abstract + ' abstract), ' +
            'kept ' + keptLlm + ' from the model');
        if (reclaimed) {
            console.log('[01] and took back ' + reclaimed +
                ' the model had answered that the norms can now settle themselves');
        }
        console.log('[01] thresholds: concrete >= ' + CONCRETE_AT + ', abstract <= ' + ABSTRACT_AT);
    }

    const ask = [];
    const counts = { pos: 0, norms: 0, cached: 0, polysemous: 0, unknown: 0, borderline: 0, posMismatch: 0 };

    for (const entry of entries) {
        if (result.entries[entry.slug] && result.entries[entry.slug].source !== 'default') {
            counts.cached++;
            continue;
        }
        const local = classifyLocally(entry, norms, senses);
        if (local) {
            result.entries[entry.slug] = local;
            counts[local.source]++;
            continue;
        }
        // Why it could not be answered locally - only for the summary, but a
        // summary that cannot explain itself is not worth printing.
        const n = norms.get(entry.word.toLowerCase());
        if ((senses.get(entry.word.toLowerCase()) || 1) > 1) counts.polysemous++;
        else if (!n) counts.unknown++;
        else if (n.conc >= CONCRETE_AT && !posAgrees(entry.type, n.pos)) counts.posMismatch++;
        else counts.borderline++;
        ask.push(entry);
    }

    console.log('[01] settled without asking: ' + (counts.pos + counts.norms) +
        ' (' + counts.pos + ' by part of speech, ' + counts.norms + ' by norms)' +
        (counts.cached ? ', ' + counts.cached + ' already done' : ''));
    if (RECLASSIFY) {
        // Totals, compared with totals. An earlier version printed the whole
        // corpus's concrete count under the label "concrete by norms/pos" and
        // compared it with the local half only, so the same figure was both
        // mislabelled and measured against the wrong baseline.
        const nowConcrete = Object.values(result.entries)
            .filter(c => c && c.kind === 'concrete').length;
        const delta = nowConcrete - totalConcreteBefore;
        console.log('[01] eligible for a photograph: ' + nowConcrete +
            ' (was ' + totalConcreteBefore + ', ' + (delta >= 0 ? '+' : '') + delta + ')');
        if (ask.length) {
            console.log('[01] and ' + ask.length + ' more the model has yet to rule on.');
        }
    }
    console.log('[01] need the model: ' + ask.length +
        ' (' + counts.polysemous + ' polysemous, ' + counts.unknown + ' not in norms, ' +
        counts.posMismatch + ' scored as a different part of speech, ' +
        counts.borderline + ' borderline)');

    const todo = ask.slice(0, LIMIT === Infinity ? ask.length : LIMIT);
    const llm = new Llm({ name: '01-classify', offline: OFFLINE });
    const batches = chunk(todo, 60);
    let unanswered = 0;

    for (const [i, batch] of batches.entries()) {
        const items = batch.map(e => ({
            id: e.slug, word: e.word, type: e.type,
            definition: e.definition, example: e.example
        }));
        const answers = await llm.askBatch(items, {
            render: renderBatch, parse: parseBatch, schemaName: 'classify-v2'
        });
        for (const e of batch) {
            const kind = answers.get(e.slug);
            if (kind) result.entries[e.slug] = { kind, source: 'llm' };
            else unanswered++;
        }
        writeJson(OUT, result);
        progress('01', i + 1, batches.length);
    }

    // Anything the model was ASKED about and did not answer is abstract. That is
    // the safe direction: a word that could have had a photograph merely gets a
    // glyph, whereas guessing "concrete" sends it into stages 02-04 hunting for
    // a picture of something unphotographable, and the best match for a bad
    // query still scores.
    //
    // Only when the run actually asked about everything, though. Under --limit
    // the rest were never asked, and marking them abstract turns a 20-word trial
    // into a summary that reads like a finished classification - which is
    // exactly how a trial run gets mistaken for the real thing. They are left
    // unrecorded instead, so the next run picks them up.
    const held = ask.length - todo.length;
    let defaulted = 0;
    if (!held) {
        for (const entry of entries) {
            if (!result.entries[entry.slug]) {
                result.entries[entry.slug] = { kind: 'abstract', source: 'default' };
                defaulted++;
            }
        }
    }
    result.generated = new Date().toISOString();
    writeJson(OUT, result);
    llm.report('01-classify');

    let totals = { concrete: 0, abstract: 0 };
    for (const v of Object.values(result.entries)) totals[v.kind]++;
    console.log('[01] unanswered by the model: ' + unanswered +
        (defaulted ? ', ' + defaulted + ' defaulted to abstract' : ''));

    // Still short? Go down a step and try again, rather than stopping to tell
    // somebody to set an environment variable and start over.
    //
    // This can only happen on a first run, where the threshold had to be chosen
    // partly from an estimate of what the model would say. Once the model has
    // answered, thresholdFor counts rather than guesses and lands first time.
    // Widening is a table lookup over the norms - no request, no network - so
    // several attempts cost milliseconds.
    if (FOR_TARGET && !held) {
        const aim = aimFor(FOR_TARGET);
        const lower = TARGET_STEPS.filter(t => t < CONCRETE_AT);
        for (const step of lower) {
            if (totals.concrete >= aim) break;
            setConcreteAt(step);
            for (const entry of entries) {
                const c = result.entries[entry.slug];
                // The model's answers are its own; only the local ones move.
                if (c && c.source !== 'norms' && c.source !== 'pos') continue;
                const local = classifyLocally(entry, norms, senses);
                if (local) result.entries[entry.slug] = local;
            }
            totals = { concrete: 0, abstract: 0 };
            for (const v of Object.values(result.entries)) totals[v.kind]++;
            console.log('[01] still under ' + aim + ' - widened to ' + step.toFixed(1) +
                ', now ' + totals.concrete + ' eligible');
        }
        writeJson(OUT, result);
        if (totals.concrete < FOR_TARGET) {
            console.error('');
            console.error('[01] ran out of thresholds at ' + totals.concrete +
                ' eligible, short of the ' + FOR_TARGET + ' asked for.');
            console.error('     This vocabulary cannot carry that many photographs.');
            process.exit(1);
        }
    }

    if (held) {
        // Say what this run was, so the totals below are not read as a result.
        console.log('[01] --limit stopped after ' + todo.length + ' of ' + ask.length +
            '; ' + held + ' still to classify.');
        console.log('[01] Run again without --limit to finish. Answers so far are cached.');
        console.log('[01] so far: concrete ' + totals.concrete + ', abstract ' + totals.abstract +
            ' (incomplete)');
    } else {
        console.log('[01] => concrete ' + totals.concrete + ', abstract ' + totals.abstract);
    }
    console.log('[01] wrote ' + OUT);
}

main().catch(err => {
    // A broken key is a message, not a stack trace: the reader needs to know
    // which thing to go and fix, and the stack says nothing about that.
    if (err instanceof LlmUnusable) {
        console.error('\n[01] %s', err.message);
        process.exit(1);
    }
    console.error(err);
    process.exit(1);
});
