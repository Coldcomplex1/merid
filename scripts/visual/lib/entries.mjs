// The set of entries the extension can actually put on screen, and the slug
// each one is filed under.
//
// Nothing here re-implements the extension. background.js's loadVocabulary
// reads each CSV with parseCSV, keeps what validateEntry accepts, shapes it
// with normalizeEntry and dedupes on word.toLowerCase() with the first row
// winning; lib/visual.js turns an entry into a slug. Both modules are required
// below and used as-is, because a private copy of either would drift and the
// symptom would be a picture that silently stops appearing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const EXT = path.join(ROOT, 'merid-extension-final');
// Overridable so a trial run can keep its working files somewhere of its own
// and never disturb a real run's state.
export const STATE = process.env.MERID_STATE
    ? path.resolve(process.env.MERID_STATE)
    : path.join(ROOT, 'scripts', 'visual', 'state');

export const C = require(path.join(EXT, 'lib/vocab-core.js'));
export const Visual = require(path.join(EXT, 'lib/visual.js'));

/** Every dataset a reader can pick. 'all' is a merge, not a file. */
export const MODES = ['sat', 'c1', 'c2', 'all'];

/** One dataset mode, deduped exactly as the worker does. */
function loadMode(datasetKey) {
    const byWord = new Map();
    for (const file of C.getDatasetFiles(datasetKey)) {
        const text = fs.readFileSync(path.join(EXT, file), 'utf8');
        for (const row of C.parseCSV(text)) {
            if (!C.validateEntry(row)) continue;
            const entry = C.normalizeEntry(row, datasetKey);
            const key = entry.word.toLowerCase();
            if (key && !byWord.has(key)) byWord.set(key, entry);
        }
    }
    return byWord;
}

/**
 * Every entry any reader can reach, keyed by slug.
 *
 * The union across modes rather than the union of CSV rows: 88 of C1's rows are
 * shadowed by the first-wins dedupe and can never be shown, so a picture built
 * for one of them would be weight in the package that nobody ever sees.
 */
export function loadEntries() {
    const bySlug = new Map();
    for (const mode of ['sat', 'c1', 'c2']) {
        for (const entry of loadMode(mode).values()) {
            const slug = Visual.slugFor(entry);
            if (!bySlug.has(slug)) bySlug.set(slug, { ...entry, slug });
        }
    }
    const all = [...bySlug.values()];

    // A trial run restricts every stage to the same handful of words.
    //
    // Each stage's own --limit cannot do this: 01 limits the entries it asks
    // about, 02 limits the concrete ones, 03 limits the searchable ones, so
    // "--limit 10" three times gives three different tens whose overlap may be
    // empty. Filtering here means one set of words travels the whole chain.
    const only = process.env.MERID_ONLY;
    if (!only) return all;
    const wanted = new Set(only.split(',').map(w => w.trim().toLowerCase()).filter(Boolean));
    return all.filter(e => wanted.has(e.word.toLowerCase()));
}

/** How many entries share each headword. >1 means the word is polysemous here. */
export function sensesPerWord(entries) {
    const counts = new Map();
    for (const e of entries) {
        const k = e.word.toLowerCase();
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
}

// --- small helpers every stage wants ---------------------------------------

export function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

/** Write via a temp file: an interrupted run must not leave half a JSON file. */
export function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(tmp, file);
}

export function statePath(...parts) {
    return path.join(STATE, ...parts);
}

export function ensureState() {
    fs.mkdirSync(STATE, { recursive: true });
}

/**
 * Batch progress that behaves in a pipe.
 *
 * These stages are long enough to want a counter and long enough that someone
 * will run them with `> run.log` or over ssh. A carriage return redraws in a
 * terminal and accumulates one line per batch everywhere else, so a 73-batch
 * run leaves 73 lines of noise in the log. Redraw only when there is a terminal
 * to redraw on; otherwise say something every tenth batch.
 */
export function progress(tag, i, total) {
    const last = i === total;
    if (process.stdout.isTTY) {
        process.stdout.write('\r[' + tag + '] batch ' + i + '/' + total + '   ');
        if (last) process.stdout.write('\n');
    } else if (last || i % 10 === 0 || i === 1) {
        console.log('[' + tag + '] batch ' + i + '/' + total);
    }
}

/**
 * Say so, loudly, when the reviewing is not in git yet.
 *
 * decisions.json is the one file in this pipeline that cannot be recomputed.
 * Everything else in state/ is a cache of something a machine can make again:
 * the classifications, the queries, the downloaded candidates, the CLIP scores.
 * decisions.json is a person's hour, and .gitignore carries an explicit
 * exception for it that says it "IS committed".
 *
 * Nothing enforced that. It was possible to review for an hour, build the
 * artwork, and never commit the record - at which point the whole hour lives in
 * one folder on one machine, and a deleted folder is a deleted hour. That is
 * not hypothetical. It is why this function exists.
 *
 * Advisory only. A stage must never fail because of git: no repository, git not
 * on PATH, a state directory outside the repo - each of those means this says
 * nothing rather than stopping a build.
 */
export function warnUncommittedDecisions(tag) {
    const file = statePath('decisions.json');
    if (!fs.existsSync(file)) return;

    let n = 0;
    try { n = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')) || {}).length; }
    catch (e) { return; }                // unreadable is not this function's problem
    if (!n) return;

    const git = (...args) => {
        try {
            const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
            return r.status === 0 ? String(r.stdout || '') : null;
        } catch (e) { return null; }
    };
    if (git('rev-parse', '--git-dir') === null) return;

    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (rel.startsWith('..')) return;    // MERID_STATE points outside the repo
    const status = git('status', '--porcelain', '--', rel);
    if (status === null) return;
    if (!status.trim()) return;          // tracked and unchanged: already safe

    console.log('');
    console.log('[' + tag + '] ' + n + ' review decisions are NOT in git.');
    console.log('     This is the only file here that cannot be recomputed - everything else');
    console.log('     in state/ is a cache. Losing it means doing the reviewing again.');
    console.log('');
    console.log('       git add -f ' + rel);
    console.log('       git commit -m "Record which picture was chosen for each word"');
    console.log('');
}

/**
 * Two words close enough that one photograph honestly serves both.
 *
 * The duplicate check used to say "at least one word in each pair is
 * illustrated with the wrong thing", and on a real run most of what it caught
 * was nothing of the kind: `imprison` and `imprisonment`, `inject` and
 * `injection`, `agriculture` and `agricultural`. A picture of a cell fits the
 * verb and the noun equally, and there is no second picture that would fit
 * either of them better. Reporting those as errors buries the pairs that are
 * errors - `arable` sharing a photograph with `morass` is a real problem and
 * was tenth in a list of ten.
 *
 * A crude suffix strip is enough to tell them apart. It does not need to be a
 * real stemmer: it only has to separate "different form of the same word" from
 * "different word", and it is reported rather than acted on either way.
 */
export function sameRoot(a, b) {
    const stem = w => String(w).toLowerCase()
        .replace(/(ations?|ations|ments?|ions?|ings?|ness|ity|ies|ally|al|ed|es|e|s)$/, '');
    const x = stem(a);
    const y = stem(b);
    if (!x || !y) return false;
    if (x === y) return true;
    // agricultur / agricultural-with-a-different-strip, and similar near misses.
    const short = x.length < y.length ? x : y;
    const long = x.length < y.length ? y : x;
    return short.length >= 5 && long.startsWith(short);
}
