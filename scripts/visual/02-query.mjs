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
import { Llm, LlmUnusable, parseJsonish, chunk } from './lib/llm.mjs';

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
    'You write image-search queries for an English vocabulary app. Each query is',
    'sent to photo archives, and the best result is shown to a learner next to the',
    'definition below it.',
    '',
    'Describe a REAL SCENE a camera could have photographed, in which the meaning',
    'below is plainly what is happening. Name what is in the frame: who or what,',
    'doing what, where.',
    '',
    'Rules for the query:',
    ' - 3 to 7 words, concrete nouns and verbs, no punctuation',
    ' - "children splashing in paddling pool", not "childhood" or "fun"',
    ' - never the headword alone, and avoid the headword entirely if a plainer',
    '   word describes the same scene',
    ' - no abstractions in the query itself: no "concept", "symbolising",',
    '   "representing", "idea of"',
    '',
    'Then set "depictable" to FALSE - and leave the query empty - whenever:',
    ' - the scene you would have to describe is a metaphor for the meaning rather',
    '   than the meaning itself',
    ' - the photograph would only work if the learner already knew the word',
    ' - it would be a person LOOKING like they are doing it, staged for the camera',
    ' - it would need one particular person to stand for a whole group of people',
    '',
    'Being unable to depict something is a useful answer, not a failure. Those',
    'words get a drawn symbol instead, which is honest. A photograph of the wrong',
    'sense is not.',
    '',
    'Also list "negative": short phrases naming the OTHER things this spelling',
    'could bring back, which would be the wrong picture here. For the season',
    '"spring" those are "metal coil", "water source", "jump". If nothing is',
    'confusable, use [].',
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
        if (!id) continue;
        // "cannot be depicted" is an answer, and losing it would send the entry
        // back round to be asked about again on the next run.
        if (!query && row.depictable !== false) continue;
        const negative = Array.isArray(row.negative)
            ? row.negative.map(s => String(s).trim()).filter(Boolean).slice(0, 6)
            : [];
        const depictable = row.depictable !== false;
        out.set(id, {
            // A query kept alongside depictable:false is a trap: it reads as
            // usable and one relaxed filter downstream would send it to the
            // archives anyway.
            query: depictable ? query.slice(0, 120) : '',
            negative,
            depictable
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
            render: renderBatch, parse: parseBatch, schemaName: 'query-v2'
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

    // Nothing to search for is not a result, it is a dead end - stage 03 will
    // find no work, 04 will have nothing to score and 05 will report an empty
    // queue three commands later. Say it here, where the cause is still in
    // view.
    if (!usable && concrete.length) {
        console.error('\n[02] no searchable queries were produced, so stages 03-05 have nothing to do.');
        console.error(OFFLINE
            ? '      --offline never asks the model. It shows what a stage would do; it is\n' +
              '      not a way to run the pipeline. Set GEMINI_API_KEY and drop the flag.'
            : '      The model answered ' + unanswered + ' of ' + todo.length + ' entries with nothing usable.\n' +
              '      Check the [llm] line above for which model answered.');
        process.exit(1);
    }
}

main().catch(err => {
    // A broken key is a message, not a stack trace: the reader needs to know
    // which thing to go and fix, and the stack says nothing about that.
    if (err instanceof LlmUnusable) {
        console.error('\n[02] %s', err.message);
        process.exit(1);
    }
    console.error(err);
    process.exit(1);
});
