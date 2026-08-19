#!/usr/bin/env node
// Stage 02b - give every abstract entry a concept to be drawn as.
//
// About seven entries in eight end up here, so this is not the fallback path,
// it is the main one. What it produces is the difference between a card that
// says something about the word and a card wearing a coloured rectangle.
//
// The bucket list is CLOSED, and closed is the whole design. The model picks
// from the names that already have a glyph in lib/visual.js and nothing else;
// an answer outside the list is dropped here, and if one somehow reached the
// shipped index, test/visual-index.test.js fails the build rather than letting
// a reader hover a word and get an empty box. Open-vocabulary labelling would
// have meant either drawing glyphs on demand forever or shipping holes.
//
// Buckets are coarse on purpose - "growth", "doubt", "restriction". They are
// meant to be recognised at 54px in a fifth of a second, next to a definition
// that carries the precision. Trying to distinguish "reluctance" from
// "hesitancy" pictorially would fail at that size and gain nothing.
//
// Usage:
//   node scripts/visual/02b-iconmap.mjs [--offline] [--limit N]
import { loadEntries, statePath, writeJson, readJson, Visual, progress } from './lib/entries.mjs';
import { Llm, LlmUnusable, parseJsonish, chunk } from './lib/llm.mjs';

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const LIMIT = (() => {
    const i = args.indexOf('--limit');
    return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const CLASSIFICATION = statePath('classification.json');
const QUERIES = statePath('queries.json');
const OUT = statePath('iconmap.json');

// Read from the extension rather than restated here: the two cannot disagree.
const BUCKETS = Visual.ICON_IDS.slice().sort();

function renderBatch(items) {
    return [
        'You label English vocabulary with the concept each word is about, so a',
        'small symbol can be drawn for it.',
        '',
        'Choose exactly one bucket per entry, from this list and no other:',
        BUCKETS.map(b => '  ' + b).join('\n'),
        '',
        'Judge the SENSE in the definition. Pick the bucket a learner would agree',
        'the word is *about*, not one that merely shares a word with it: "abolish"',
        'is about ending something, not about law. When two fit, pick the one that',
        'a picture would show more directly.',
        '',
        'Reply with a JSON array only, one object per entry, in the same order:',
        '  {"id": <id>, "bucket": "<one name from the list>"}',
        '',
        items.map(e => [
            'id: ' + e.id,
            'word: ' + e.word,
            'part of speech: ' + (e.type || 'unknown'),
            'definition: ' + (e.definition || '').slice(0, 200)
        ].join('\n')).join('\n\n')
    ].join('\n');
}

function parseBatch(text) {
    const out = new Map();
    const json = parseJsonish(text);
    if (!Array.isArray(json)) return out;
    const allowed = new Set(BUCKETS);
    for (const row of json) {
        if (!row || typeof row !== 'object') continue;
        const bucket = String(row.bucket || '').trim();
        // The closed vocabulary, enforced. A name we cannot draw is not an
        // answer, and pretending otherwise ships an empty box.
        if (!allowed.has(bucket)) continue;
        out.set(String(row.id), bucket);
    }
    return out;
}

async function main() {
    const classification = readJson(CLASSIFICATION, null);
    if (!classification) {
        console.error('[02b] run 01-classify.mjs first - no classification.json');
        process.exit(1);
    }
    const queries = readJson(QUERIES, { entries: {} });
    const entries = loadEntries();

    // Abstract by classification, plus anything stage 02 decided could not
    // honestly be photographed after all. The second group is the point of
    // running this after 02 rather than beside it.
    const needsGlyph = entries.filter(e => {
        const c = classification.entries[e.slug];
        if (!c) return true;
        if (c.kind === 'abstract') return true;
        const q = queries.entries[e.slug];
        return !!q && q.depictable === false;
    });
    console.log('[02b] ' + needsGlyph.length + ' entries need a glyph, ' +
        BUCKETS.length + ' buckets to choose from');

    const result = readJson(OUT, { v: 1, entries: {} });
    result.entries = result.entries || {};

    const ask = needsGlyph.filter(e => !result.entries[e.slug]);
    const todo = ask.slice(0, LIMIT === Infinity ? ask.length : LIMIT);
    console.log('[02b] asking about ' + todo.length +
        (ask.length !== needsGlyph.length ? ' (' + (needsGlyph.length - ask.length) + ' already done)' : ''));

    const llm = new Llm({ name: '02b-iconmap', offline: OFFLINE });
    const batches = chunk(todo, 40);
    let rejected = 0;

    for (const [i, batch] of batches.entries()) {
        const items = batch.map(e => ({
            id: e.slug, word: e.word, type: e.type, definition: e.definition
        }));
        const answers = await llm.askBatch(items, {
            render: renderBatch, parse: parseBatch, schemaName: 'iconmap-v1'
        });
        for (const e of batch) {
            const bucket = answers.get(e.slug);
            if (bucket) result.entries[e.slug] = bucket;
            else rejected++;
        }
        writeJson(OUT, result);
        progress('02b', i + 1, batches.length);
    }

    result.generated = new Date().toISOString();
    writeJson(OUT, result);
    llm.report('02b-iconmap');

    // An entry with no bucket is not broken - visualFor draws its first letter
    // on the same generated gradient. Worth reporting, not worth failing.
    const missing = needsGlyph.filter(e => !result.entries[e.slug]).length;
    const used = new Set(Object.values(result.entries));
    console.log('[02b] no bucket (will show their first letter): ' + missing);
    console.log('[02b] buckets used: ' + used.size + '/' + BUCKETS.length +
        (rejected ? ', ' + rejected + ' answers rejected as outside the list' : ''));

    const unused = BUCKETS.filter(b => !used.has(b));
    if (unused.length) console.log('[02b] never chosen: ' + unused.join(', '));
    console.log('[02b] wrote ' + OUT);
}

main().catch(err => {
    // A broken key is a message, not a stack trace: the reader needs to know
    // which thing to go and fix, and the stack says nothing about that.
    if (err instanceof LlmUnusable) {
        console.error('\n[02b] %s', err.message);
        process.exit(1);
    }
    console.error(err);
    process.exit(1);
});
