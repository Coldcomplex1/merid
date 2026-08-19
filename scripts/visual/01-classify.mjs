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
//   node scripts/visual/01-classify.mjs [--offline] [--limit N]
import fs from 'node:fs';
import { loadEntries, sensesPerWord, statePath, ensureState, writeJson, readJson, progress } from './lib/entries.mjs';
import { Llm, parseJsonish, chunk } from './lib/llm.mjs';

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const LIMIT = (() => {
    const i = args.indexOf('--limit');
    return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

// Brysbaert's own thresholds are not prescribed; these come from where the
// distribution actually separates for this vocabulary. 3.5 keeps "anchor" and
// drops "tendency"; 2.6 is low enough that anything under it is not worth six
// API calls to confirm.
const CONCRETE_AT = 3.5;
const ABSTRACT_AT = 2.6;

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
    if (!fs.existsSync(NORMS_FILE)) {
        console.log('[01] fetching Brysbaert concreteness norms (once)...');
        const resp = await fetch(NORMS_URL);
        if (!resp.ok) throw new Error('could not fetch norms: ' + resp.status);
        fs.writeFileSync(NORMS_FILE, Buffer.from(await resp.arrayBuffer()));
    }
    const norms = new Map();
    const lines = fs.readFileSync(NORMS_FILE, 'utf8').split(/\r?\n/);
    for (const line of lines.slice(1)) {
        const f = line.split('\t');
        if (f.length < 9) continue;
        const conc = Number(f[2]);
        if (!Number.isFinite(conc)) continue;
        norms.set(f[0].toLowerCase(), { conc, known: Number(f[6]), pos: f[8] });
    }
    return norms;
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
    if (n.conc >= CONCRETE_AT) return { kind: 'concrete', source: 'norms', conc: n.conc };
    if (n.conc <= ABSTRACT_AT) return { kind: 'abstract', source: 'norms', conc: n.conc };
    return null;   // borderline: worth a question
}

const PROMPT_HEAD = [
    'You are helping decide which English vocabulary entries can be illustrated',
    'with a single photograph.',
    '',
    'CONCRETE means: a photograph of a real scene or object would show what this',
    'entry means, and a learner seeing that photograph would recognise the meaning.',
    'ABSTRACT means: it could only be illustrated by metaphor or staging - a',
    'quality, a relation, a state of mind, a process, a manner of doing something.',
    '',
    'Judge the SENSE given by the definition, not the word in general. The same',
    'spelling may appear twice with different definitions; answer each on its own.',
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
        'definition: ' + (e.definition || '').slice(0, 220)
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

    const ask = [];
    const counts = { pos: 0, norms: 0, cached: 0, polysemous: 0, unknown: 0, borderline: 0 };

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
        if ((senses.get(entry.word.toLowerCase()) || 1) > 1) counts.polysemous++;
        else if (!norms.has(entry.word.toLowerCase())) counts.unknown++;
        else counts.borderline++;
        ask.push(entry);
    }

    console.log('[01] settled without asking: ' + (counts.pos + counts.norms) +
        ' (' + counts.pos + ' by part of speech, ' + counts.norms + ' by norms)' +
        (counts.cached ? ', ' + counts.cached + ' already done' : ''));
    console.log('[01] need the model: ' + ask.length +
        ' (' + counts.polysemous + ' polysemous, ' + counts.unknown + ' not in norms, ' +
        counts.borderline + ' borderline)');

    const todo = ask.slice(0, LIMIT === Infinity ? ask.length : LIMIT);
    const llm = new Llm({ name: '01-classify', offline: OFFLINE });
    const batches = chunk(todo, 60);
    let unanswered = 0;

    for (const [i, batch] of batches.entries()) {
        const items = batch.map(e => ({ id: e.slug, word: e.word, type: e.type, definition: e.definition }));
        const answers = await llm.askBatch(items, {
            render: renderBatch, parse: parseBatch, schemaName: 'classify-v1'
        });
        for (const e of batch) {
            const kind = answers.get(e.slug);
            if (kind) result.entries[e.slug] = { kind, source: 'llm' };
            else unanswered++;
        }
        writeJson(OUT, result);
        progress('01', i + 1, batches.length);
    }

    // Anything still unanswered is abstract. That is the safe direction: a word
    // that could have had a photograph merely gets a glyph, whereas guessing
    // "concrete" sends it into stages 02-04 looking for a picture of something
    // unphotographable, and the best match for a bad query still scores.
    let defaulted = 0;
    for (const entry of entries) {
        if (!result.entries[entry.slug]) {
            result.entries[entry.slug] = { kind: 'abstract', source: 'default' };
            defaulted++;
        }
    }
    result.generated = new Date().toISOString();
    writeJson(OUT, result);
    llm.report('01-classify');

    const totals = { concrete: 0, abstract: 0 };
    for (const v of Object.values(result.entries)) totals[v.kind]++;
    console.log('[01] unanswered by the model: ' + unanswered + (defaulted ? ', ' + defaulted + ' defaulted to abstract' : ''));
    console.log('[01] => concrete ' + totals.concrete + ', abstract ' + totals.abstract);
    console.log('[01] wrote ' + OUT);
}

main().catch(err => { console.error(err); process.exit(1); });
