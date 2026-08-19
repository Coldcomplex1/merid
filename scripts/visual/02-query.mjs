#!/usr/bin/env node
// Stage 02 - turn each concrete entry into something worth searching for, plus
// the things it must NOT be confused with.
//
// This is the stage that answers "spring". Searching the bare headword is how
// you end up illustrating the season with a metal coil: the search engine has
// no idea which sense you meant, and neither does anything downstream. But the
// sense is not actually unknown - Merid's own dataset has already fixed it, in
// the definition and the example sentence the reader will see on the card. So
// the query is built from those, and the picture ends up matching the words
// printed underneath it rather than matching the headword in the abstract.
//
// The `negative` list is the more important half and the less obvious one. It
// names the OTHER senses - "metal coil", "water source", "jump" - and stage 04
// scores every candidate against them as well. A photograph of a spring
// mechanism scores respectably against "spring" no matter how the query is
// worded; it only becomes rejectable once something is measuring how much
// BETTER it matches the wrong sense. Without these strings stage 04 has a
// threshold and no discrimination.
//
// Usage:
//   node scripts/visual/02-query.mjs [--offline] [--limit N]
import { loadEntries, statePath, writeJson, readJson, progress } from './lib/entries.mjs';
import { Llm, parseJsonish, chunk } from './lib/llm.mjs';

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const LIMIT = (() => {
    const i = args.indexOf('--limit');
    return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const CLASSIFICATION = statePath('classification.json');
const OUT = statePath('queries.json');

// Subject matter to keep out of image search altogether.
//
// Openverse and Wikimedia both carry medical, forensic and artistic material
// that is entirely legitimate where it lives and entirely wrong as a surprise
// thumbnail over someone's news article. There is no query wording that
// reliably avoids it, so these words never reach a search at all.
//
// Deliberately narrow. An earlier version also caught religion, ethnicity and
// disability, which held back `monk`, `pastor`, `clergy` and `funeral` - all of
// them ordinary photographable nouns whose best illustration is simply a
// photograph of one. The real worry there was different: words naming a
// CATEGORY OF PEOPLE, where any photograph is some particular people standing
// in for the category. That is a judgement about a sense, not a substring, so
// stage 02 asks the model for it (see "depictable" in the prompt) instead of
// guessing from spelling.
const SKIP_SUBJECT = new RegExp([
    'sexual|erotic|porn|genital|penis|vagina|nude|naked|orgasm|copulat',
    'rape|incest|prostitut|brothel',
    'corpse|cadaver|mutilat|dismember|decapitat|behead|torture|massacre|atrocity|gore',
    'suicide|self-harm|overdose'
].join('|'), 'i');

const PROMPT_HEAD = [
    'You write image-search queries for an English vocabulary app.',
    '',
    'For each entry, produce a short search query that would find a photograph a',
    'learner would recognise as THIS meaning of the word - the meaning in the',
    'definition, not any other meaning the spelling might have.',
    '',
    'Rules for the query:',
    ' - 2 to 6 words, plain nouns and adjectives, no punctuation',
    ' - describe what would be IN the photograph, not the abstract idea',
    ' - never just repeat the headword on its own',
    '',
    'Also list "negative": short phrases naming the OTHER things this spelling',
    'could bring back, which would be the wrong picture here. Example: for the',
    'season "spring", the negatives are "metal coil", "water source", "jump".',
    'If the word has only one sense and no confusable neighbours, use [].',
    '',
    'Set "depictable" to false if no single photograph could honestly show this',
    'meaning, or if illustrating it would need a person standing in for a group.',
    '',
    'Reply with a JSON array only, one object per entry, in the same order:',
    '  {"id": <id>, "query": "...", "negative": ["...", "..."], "depictable": true}',
    ''
].join('\n');

function renderBatch(items) {
    const lines = items.map(e => [
        'id: ' + e.id,
        'word: ' + e.word,
        'part of speech: ' + (e.type || 'unknown'),
        'definition: ' + (e.definition || '').slice(0, 200),
        'example: ' + (e.example || '').slice(0, 160)
    ].join('\n'));
    return PROMPT_HEAD + '\n' + lines.join('\n\n');
}

function parseBatch(text) {
    const out = new Map();
    const json = parseJsonish(text);
    if (!Array.isArray(json)) return out;
    for (const row of json) {
        if (!row || typeof row !== 'object') continue;
        const id = String(row.id || '');
        const query = String(row.query || '').trim().replace(/\s+/g, ' ');
        if (!id || !query) continue;
        const negative = Array.isArray(row.negative)
            ? row.negative.map(s => String(s).trim()).filter(Boolean).slice(0, 6)
            : [];
        out.set(id, {
            query: query.slice(0, 120),
            negative,
            depictable: row.depictable !== false
        });
    }
    return out;
}

async function main() {
    const classification = readJson(CLASSIFICATION, null);
    if (!classification) {
        console.error('[02] run 01-classify.mjs first - no classification.json');
        process.exit(1);
    }
    const entries = loadEntries();
    const concrete = entries.filter(e => {
        const c = classification.entries[e.slug];
        return c && c.kind === 'concrete';
    });
    console.log('[02] ' + concrete.length + ' concrete entries out of ' + entries.length);

    const result = readJson(OUT, { v: 1, entries: {} });
    result.entries = result.entries || {};

    const ask = [];
    let skipped = 0;
    for (const entry of concrete) {
        if (result.entries[entry.slug]) continue;
        const subject = entry.word + ' ' + (entry.definition || '');
        if (SKIP_SUBJECT.test(subject)) {
            result.entries[entry.slug] = { depictable: false, reason: 'subject', query: '', negative: [] };
            skipped++;
            continue;
        }
        ask.push(entry);
    }
    if (skipped) console.log('[02] ' + skipped + ' held back on subject matter - these take a glyph');

    const todo = ask.slice(0, LIMIT === Infinity ? ask.length : LIMIT);
    console.log('[02] asking about ' + todo.length);

    const llm = new Llm({ name: '02-query', offline: OFFLINE });
    const batches = chunk(todo, 25);
    let unanswered = 0;

    for (const [i, batch] of batches.entries()) {
        const items = batch.map(e => ({
            id: e.slug, word: e.word, type: e.type, definition: e.definition, example: e.example
        }));
        const answers = await llm.askBatch(items, {
            render: renderBatch, parse: parseBatch, schemaName: 'query-v1'
        });
        for (const e of batch) {
            const a = answers.get(e.slug);
            if (a) result.entries[e.slug] = a;
            else unanswered++;
        }
        writeJson(OUT, result);
        progress('02', i + 1, batches.length);
    }

    result.generated = new Date().toISOString();
    writeJson(OUT, result);
    llm.report('02-query');

    const usable = Object.values(result.entries).filter(v => v.depictable && v.query).length;
    const withNeg = Object.values(result.entries).filter(v => (v.negative || []).length).length;
    console.log('[02] unanswered: ' + unanswered);
    console.log('[02] => ' + usable + ' searchable, ' + withNeg + ' of them with distractors');
    console.log('[02] wrote ' + OUT);
}

main().catch(err => { console.error(err); process.exit(1); });
