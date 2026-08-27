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
const RECLASSIFY = args.includes('--reclassify');

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
const CONCRETE_AT = Number(process.env.MERID_CONCRETE_AT || 3.5);
const ABSTRACT_AT = Number(process.env.MERID_ABSTRACT_AT || 2.6);
if (!Number.isFinite(CONCRETE_AT) || !Number.isFinite(ABSTRACT_AT) ||
    ABSTRACT_AT >= CONCRETE_AT) {
    console.error('[01] MERID_CONCRETE_AT must be a number above MERID_ABSTRACT_AT');
    console.error('     got concrete=' + CONCRETE_AT + ' abstract=' + ABSTRACT_AT);
    process.exit(1);
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

    // What the thresholds decided last time, dropped so this run's thresholds
    // decide it instead. Counted before and after so the summary can say what
    // actually moved rather than leaving it to be inferred from a total.
    const before = { concrete: 0, abstract: 0 };
    let dropped = 0;
    let keptLlm = 0;
    if (RECLASSIFY) {
        for (const [slug, c] of Object.entries(result.entries)) {
            if (c && (c.source === 'norms' || c.source === 'pos')) {
                before[c.kind] = (before[c.kind] || 0) + 1;
                delete result.entries[slug];
                dropped++;
            } else if (c && c.source === 'llm') {
                keptLlm++;
            }
        }
        console.log('[01] --reclassify: dropped ' + dropped +
            ' local answers (' + before.concrete + ' concrete, ' + before.abstract + ' abstract), ' +
            'kept ' + keptLlm + ' from the model');
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
        // The number worth reading before spending an hour on stage 03: how many
        // entries this threshold just made eligible for a photograph, and how
        // that compares with what the last threshold allowed.
        let nowConcrete = 0;
        for (const c of Object.values(result.entries)) if (c && c.kind === 'concrete') nowConcrete++;
        const delta = nowConcrete - before.concrete;
        console.log('[01] concrete by norms/pos: ' + nowConcrete +
            ' (was ' + before.concrete + ', ' + (delta >= 0 ? '+' : '') + delta + ')');
        console.log('[01] plus whatever the model calls concrete among the ' + ask.length +
            ' below - that is the pool stage 02 will write queries for.');
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

    const totals = { concrete: 0, abstract: 0 };
    for (const v of Object.values(result.entries)) totals[v.kind]++;
    console.log('[01] unanswered by the model: ' + unanswered +
        (defaulted ? ', ' + defaulted + ' defaulted to abstract' : ''));

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
