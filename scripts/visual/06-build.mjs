#!/usr/bin/env node
// Stage 06 - turn reviewed decisions into the files the extension ships.
//
// Everything upstream produced opinions; this produces bytes. Three outputs:
//
//   merid-extension-final/vis/<slug>.avif   the pictures
//   merid-extension-final/visual-index.json which slug has one, and which
//                                           concept the rest are drawn as
//   merid-extension-final/vis/CREDITS.json  where each picture came from
//
// Two things worth knowing about the encoding:
//
//   position: 'attention' rather than a centre crop. The target is 2:1, which
//   is a flat shape to cut a photograph down to, and a centre crop of an
//   upright photograph of an anchor is a vertical strip of metal. sharp's
//   attention crop moves the window towards where the detail actually is.
//
//   The format is a flag, not a decision made here once and forgotten. AVIF is
//   usually smaller, but not always - it loses to WebP on noisy images - so the
//   script measures a sample of the real pictures in both and says which won
//   before encoding the rest.
//
// A picture used twice is reported rather than allowed to pass quietly: two
// words illustrated by the same photograph means at least one of them is
// wrong, and it is much easier to see here than on a card.
//
// This stage also reads the reviewing as a measurement rather than as a list of
// answers. Nobody wants to look at three hundred cards, and nobody has to: what
// a person keeps or rejects at a given score says how often the top candidate
// is right at that score, and that is enough to decide what happens to the ones
// they never opened. Run 05-review.mjs --sample 50, then run this to see the
// answer. --accept-above then acts on it.
//
// The alternative to acting on it is that every unreviewed entry takes a drawn
// symbol. That is the safe default and it stays the default - a symbol is never
// wrong, only less helpful than the right photograph.
//
// Usage:
//   node scripts/visual/06-build.mjs [--format avif|webp] [--dry-run]
//                                    [--accept-above 0.284]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { EXT, statePath, readJson, writeJson, loadEntries, Visual, progress,
    warnUncommittedDecisions, sameRoot } from './lib/entries.mjs';

const require = createRequire(import.meta.url);

/**
 * sharp, loaded the first time a picture actually has to be encoded.
 *
 * It used to load at import and exit the process when it was missing, which
 * made every run of this stage depend on a 30MB native module - including the
 * two that encode nothing. `--dry-run` is one of them, and ship.mjs calls it
 * purely to read back the cutoff the reviewing supports; a glyphs-only build is
 * the other. Both died on a dependency they never reached.
 *
 * Still fatal when a run does have pictures to encode: there is no half-build
 * worth producing, and the index would then promise files that are not there.
 */
let sharp = null;
function encoder() {
    if (sharp) return sharp;
    try { sharp = require('sharp'); } catch (e) {
        console.error('[06] there are pictures to encode and sharp is not installed.');
        console.error('     Run this in the REPOSITORY ROOT, not in merid-extension-final:');
        console.error('');
        console.error('       npm i -D sharp');
        console.error('');
        process.exit(1);
    }
    return sharp;
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');

// Take the first candidate, unseen, for every unreviewed entry scoring at least
// this. There is no default and there deliberately is not one: the number comes
// out of the reviewing, which is different for every dataset, and a number
// picked here would be a guess dressed as a setting.
const ACCEPT_ABOVE = (() => {
    const i = args.indexOf('--accept-above');
    if (i < 0) return null;
    const n = Number(args[i + 1]);
    if (!Number.isFinite(n)) {
        console.error('[06] --accept-above needs a score, e.g. --accept-above 0.284');
        console.error('      Run without it first - the table it prints ends with the number to use.');
        process.exit(1);
    }
    return n;
})();
const FORMAT = (() => {
    const i = args.indexOf('--format');
    const v = i >= 0 ? String(args[i + 1]).toLowerCase() : 'avif';
    if (v !== 'avif' && v !== 'webp') { console.error('[06] --format must be avif or webp'); process.exit(1); }
    return v;
})();

const WIDTH = 320;
const HEIGHT = 160;      // 2:1, matching .vm-visual's aspect-ratio in content.css
const FILE_MAX = 9 * 1024;               // matches scripts/build.js

// Quality 45 puts almost every picture well under the cap. The exceptions are
// busy photographs - foliage, crowds, texture - and there is no single quality
// that suits both those and the rest: raising the cap is not ours to do, and
// lowering the quality for all 300 to rescue two is a bad trade. So each
// picture is encoded at the best quality that fits, which is 45 for nearly all
// of them.
const QUALITY_STEPS = [45, 38, 32, 26, 20];
const BUDGET = 6.0 * 1024 * 1024;

const QUERIES = statePath('queries.json');
const DECISIONS = statePath('decisions.json');
const RANKED = statePath('ranked.json');
const AUTO_FILE = statePath('auto-accepted.json');
const ICONMAP = statePath('iconmap.json');
const VIS_DIR = path.join(EXT, 'vis');
const INDEX_FILE = path.join(EXT, 'visual-index.json');
const CREDITS_FILE = path.join(VIS_DIR, 'CREDITS.json');

const encode = (buf, format, quality = QUALITY_STEPS[0]) => encoder()(buf)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
    [format]({ quality, effort: format === 'avif' ? 9 : 6 })
    .toBuffer();

/**
 * Encode at the best quality that fits under the per-file cap.
 *
 * scripts/build.js refuses any picture over FILE_MAX, so an oversized file is
 * not a warning to read later - it is a build that will not run, discovered
 * three commands further on. This used to print "lower --quality", which was
 * doubly unhelpful: there is no such flag, and the answer to two fat pictures
 * is not to soften the other three hundred.
 *
 * A picture that will not fit even at the bottom of the steps gets no picture
 * at all, and falls back to whatever the index has for it. A word without a
 * picture builds; a word with a 12KB picture does not.
 */
async function encodeToFit(buf, format) {
    let out = null;
    for (const quality of QUALITY_STEPS) {
        out = await encode(buf, format, quality);
        if (out.length <= FILE_MAX) return { out, quality };
    }
    return { out, quality: null };
}

/**
 * A cheap perceptual hash: 8x8 greyscale, each pixel against the mean.
 *
 * Only used to notice that two words were given the same photograph. Not
 * robust against crops or recolouring, and does not need to be - the case it
 * catches is the literal same file arriving twice from two archives.
 */
async function phash(buf) {
    const small = await encoder()(buf).resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
    const mean = small.reduce((a, b) => a + b, 0) / small.length;
    let bits = '';
    for (const v of small) bits += v >= mean ? '1' : '0';
    return bits;
}

// How many bands the sample was drawn from. Must match 05-review.mjs: the bands
// are quintiles by position in the queue, not by score, so a different count
// here would put a word in a band the reviewer never saw and measure agreement
// against boundaries that did not exist.
const BANDS = 5;

/**
 * The list stage 05 builds its queue from, in the same order.
 *
 * Rebuilt rather than stored, because it has to match what the reviewer was
 * actually shown - same filter, same sort. The one case it does not cover is a
 * review run with --all, whose extra entries are counted separately below.
 */
function eligible(ranked, entries) {
    const items = [];
    for (const [slug, r] of Object.entries(ranked.entries || {})) {
        if (!entries.has(slug) || !r.candidates || !r.candidates.length) continue;
        if (!r.anyClear) continue;
        items.push({ slug, best: r.best, candidates: r.candidates });
    }
    items.sort((a, b) => a.best - b.best);
    return items;
}

function bandsOf(items, n = BANDS) {
    const out = [];
    for (let b = 0; b < n; b++) {
        out.push(items.slice(Math.floor(items.length * b / n), Math.floor(items.length * (b + 1) / n)));
    }
    return out;
}

/**
 * The low end of a one-sided 90% Wilson interval.
 *
 * Nine out of ten is not 90%. It is a sample of ten, and the honest reading of
 * it is "somewhere upwards of 72%". Printing the raw fraction is what makes a
 * fifty-word sample look like it settled something it did not, and the whole
 * point of the sample is to decide the fate of entries nobody will ever check.
 * So the report leads with this number and the cutoff is chosen on it.
 */
function wilsonLow(hits, n) {
    if (!n) return 0;
    const z = 1.2816;
    const p = hits / n;
    const d = 1 + z * z / n;
    const centre = p + z * z / (2 * n);
    const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return Math.max(0, (centre - spread) / d);
}

// How sure the sample has to make us before an unreviewed picture ships. Seven
// in ten: below that the symbol is better, because a wrong photograph on a
// vocabulary card does not merely fail to help, it teaches the wrong thing.
const CONFIDENCE = 0.70;

/**
 * Read the reviewing as a measurement of stage 04's ranking.
 *
 * Two tables. The first is per band and shows the shape: if agreement does not
 * climb with the score then the score is not measuring anything and no cutoff
 * will rescue it - that is worth knowing before trusting any of this. The
 * second is cumulative from the top, which is the question --accept-above
 * actually asks: take the first candidate for everything at or above here, and
 * how often is it right?
 *
 * Returns a `boundFor(cutoff)` so the accept step can quote the same evidence
 * rather than computing its own version of it.
 */
function analyse(items, decisions) {
    const none = { boundFor: null };
    const verdict = slug => {
        const d = decisions[slug];
        if (!d) return null;
        if (d.pick === 'none' || !d.candidate) return 'refused';
        return Number(d.pick) === 0 ? 'first' : 'other';
    };

    if (!items.length) {
        console.log('[06] no ranked.json queue to measure against - the agreement report is skipped.');
        return none;
    }

    const inQueue = new Set(items.map(i => i.slug));
    const offQueue = Object.keys(decisions).filter(sl => !inQueue.has(sl)).length;

    const rows = [];
    let seenTotal = 0;
    for (const band of bandsOf(items)) {
        if (!band.length) continue;
        const t = { first: 0, other: 0, refused: 0 };
        for (const it of band) { const v = verdict(it.slug); if (v) t[v]++; }
        const seen = t.first + t.other + t.refused;
        seenTotal += seen;
        rows.push({ lo: band[0].best, hi: band[band.length - 1].best, n: band.length, seen, ...t });
    }

    if (!seenTotal) {
        console.log('[06] none of the reviewed entries are in stage 05\'s queue' +
            (offQueue ? ' (' + offQueue + ' were reviewed with --all)' : '') +
            ', so there is nothing to measure agreement from.');
        return none;
    }

    // Column widths in one place. The headings were written out by hand once
    // and sat two characters left of their own numbers, which is the kind of
    // thing nobody notices while reading the figures and everybody notices
    // instead of reading them.
    const pad = (v, w) => String(v).padStart(w);
    // One row-drawing function per table, so a heading cannot end up in a
    // different column from its own numbers - which is exactly what a
    // hand-written heading row did here, and it makes a table of figures
    // unreadable long before anyone works out why.
    const row = cols => (first, ...rest) =>
        '       ' + String(first).padEnd(13) + rest.map((v, i) => pad(v, cols[i])).join('');
    const bandRow = row([11, 10, 10, 12, 10]);
    const cutRow = row([13, 10, 10, 17]);
    console.log('');
    console.log('[06] you saw ' + seenTotal + ' of ' + items.length + ' entries in the queue. How often the');
    console.log('     FIRST candidate was the one you kept, by score:');
    console.log('');
    console.log(bandRow('score range', 'in queue', 'you saw', 'kept #1', 'took #2/3', 'refused'));
    for (const r of rows) {
        console.log(bandRow(r.lo.toFixed(3) + ' - ' + r.hi.toFixed(3),
            r.n, r.seen, r.first, r.other, r.refused));
    }
    if (offQueue) {
        console.log('       (' + offQueue + ' more decisions are for entries outside the queue - ' +
            'reviewed with --all, not counted)');
    }

    const at = cutoff => {
        let seen = 0, first = 0, unreviewed = 0;
        for (const it of items) {
            if (it.best < cutoff) continue;
            const v = verdict(it.slug);
            if (!v) { unreviewed++; continue; }
            seen++;
            if (v === 'first') first++;
        }
        return { cutoff, seen, first, unreviewed, low: wilsonLow(first, seen) };
    };

    console.log('');
    console.log('[06] what taking the first candidate unseen would mean, at each cutoff:');
    console.log('');
    console.log(cutRow('cutoff', 'would ship', 'you saw', 'kept #1', 'right at least'));
    // Rounded up to the three decimals the command line will carry, and rounded
    // BEFORE the counting rather than after. toFixed alone rounds to nearest, so
    // a boundary of 0.3352 would print as 0.335 and quietly accept entries below
    // the point the sample actually measured; and rounding only for display
    // would make the table's counts describe a cutoff nobody can type.
    const cuts = rows.map(r => at(Math.ceil(r.lo * 1000) / 1000)).reverse();
    for (const c of cuts) {
        console.log(cutRow('>= ' + c.cutoff.toFixed(3),
            c.unreviewed, c.seen, c.first, Math.round(c.low * 100) + '%'));
    }

    // Walk down from the strictest and stop at the first cutoff that does not
    // hold. Picking the lowest passing row instead would let one lucky band
    // below a failing one set the cutoff, which is how a rule like this quietly
    // stops meaning anything.
    let best = null;
    for (const c of cuts) {
        if (c.seen >= 8 && c.low >= CONFIDENCE) best = c; else break;
    }

    console.log('');
    console.log('     "right at least" is the low end of a 90% interval, not the raw fraction:');
    console.log('     a sample this size cannot promise more than that, and the entries it');
    console.log('     decides are ones nobody will ever look at.');
    console.log('');
    if (best) {
        console.log('[06] the first candidate still holds up at ' + best.cutoff.toFixed(3) +
            ' (' + best.first + ' of ' + best.seen + ' kept, so at least ' +
            Math.round(best.low * 100) + '% right).');
        console.log('     To use it for the ' + best.unreviewed + ' entries at or above that:');
        console.log('');
        console.log('       node scripts/visual/06-build.mjs --accept-above ' + best.cutoff.toFixed(3));
        console.log('');
        console.log('     Everything below it goes without. Read the last line of this run before');
        console.log('     settling on a number: these are concrete words, so going without mostly');
        console.log('     means showing a first letter rather than a drawn concept.');
    } else {
        console.log('[06] no cutoff is safe on what you reviewed: even at the top of the range the');
        console.log('     first candidate was wrong too often to ship unseen' +
            (cuts[0] && cuts[0].seen < 8 ? ' (and the top band had only ' + cuts[0].seen +
                ' looked at - too few to tell)' : '') + '.');
        console.log('     Review more of the queue, or let the unreviewed entries take symbols.');
    }

    // Null rather than zero when nothing above the cutoff was ever looked at.
    // wilsonLow(0, 0) is 0, and reporting that as "supports 0% correct" would be
    // a measurement nobody took - which is the exact failure this whole report
    // exists to avoid.
    return {
        boundFor: cutoff => {
            const a = at(cutoff);
            return a.seen ? a.low : null;
        }
    };
}

async function main() {
    const decisions = readJson(DECISIONS, null);
    if (!decisions) { console.error('[06] no decisions.json - run 05-review.mjs first'); process.exit(1); }
    const iconmap = readJson(ICONMAP, { entries: {} });
    const entries = new Map(loadEntries().map(e => [e.slug, e]));

    const picked = Object.entries(decisions)
        .filter(([slug, d]) => d && d.pick !== 'none' && d.candidate && entries.has(slug));
    console.log('[06] ' + Object.keys(decisions).length + ' decisions, ' +
        picked.length + ' of them chose a picture');

    // What the reviewing measured, and what it says about everything nobody
    // opened. Printed every run, with or without --accept-above: the number to
    // pass to that flag is the last line of it.
    const ranked = readJson(RANKED, { entries: {} });
    const items = eligible(ranked, entries);
    const measured = analyse(items, decisions);

    if (ACCEPT_ABOVE !== null) {
        const taken = [];
        for (const it of items) {
            // A decision of any kind wins, including a refusal. Overriding an
            // `x` with the candidate the person just rejected would be the
            // worst thing this script could do.
            if (decisions[it.slug]) continue;
            if (!(it.best >= ACCEPT_ABOVE) || !it.candidates[0]) continue;
            picked.push([it.slug, { pick: 0, candidate: it.candidates[0] }]);
            taken.push({
                slug: it.slug,
                word: (entries.get(it.slug) || {}).word || '',
                best: it.best
            });
        }
        const bound = measured.boundFor ? measured.boundFor(ACCEPT_ABOVE) : null;
        console.log('');
        console.log('[06] --accept-above ' + ACCEPT_ABOVE.toFixed(3) + ': took the first candidate for ' +
            taken.length + ' entries nobody looked at.');
        if (bound === null) {
            console.log('     WARNING: nothing was reviewed at or above that score, so this cutoff is');
            console.log('     a guess. Review a sample first:  node scripts/visual/05-review.mjs --sample 50');
        } else if (bound < CONFIDENCE) {
            console.log('     WARNING: what you reviewed above that score only supports ' +
                Math.round(bound * 100) + '% correct.');
            console.log('     That is below the ' + Math.round(CONFIDENCE * 100) +
                '% this script treats as good enough to ship unseen.');
        } else {
            console.log('     The sample says at least ' + Math.round(bound * 100) + '% of those are right.');
        }
        // Which words got a picture on the strength of a statistic rather than
        // a person, so a later pass can go straight to them.
        if (!DRY) {
            writeJson(AUTO_FILE, {
                v: 1, cutoff: ACCEPT_ABOVE, at: new Date().toISOString(), entries: taken
            });
        }
    }

    if (!picked.length) {
        console.log('[06] nothing to encode - the index will be glyphs only');
    }

    // Which format actually wins on THESE pictures, rather than on the general
    // reputation of the formats.
    if (picked.length >= 8) {
        const sample = picked.slice(0, Math.min(24, picked.length));
        const totals = { avif: 0, webp: 0 };
        for (const [, d] of sample) {
            const src = path.join(statePath(), d.candidate.file);
            if (!fs.existsSync(src)) continue;
            const buf = fs.readFileSync(src);
            for (const f of ['avif', 'webp']) {
                try { totals[f] += (await encode(buf, f)).length; } catch (e) { /* skip */ }
            }
        }
        const winner = totals.avif <= totals.webp ? 'avif' : 'webp';
        console.log('[06] on a sample of ' + sample.length + ': avif ' +
            Math.round(totals.avif / sample.length) + 'B/picture, webp ' +
            Math.round(totals.webp / sample.length) + 'B/picture' +
            (winner === FORMAT ? ' (using ' + FORMAT + ')'
                : ' - ' + winner + ' is smaller here, consider --format ' + winner));
    }

    if (!DRY) fs.mkdirSync(VIS_DIR, { recursive: true });

    const photo = [];
    const credits = {};
    const seenHash = new Map();
    const duplicates = [];
    const oversized = [];
    const softened = [];
    let total = 0;
    let failed = 0;

    for (const [i, [slug, d]] of picked.entries()) {
        const src = path.join(statePath(), d.candidate.file);
        if (!fs.existsSync(src)) { failed++; continue; }
        let out, quality;
        try { ({ out, quality } = await encodeToFit(fs.readFileSync(src), FORMAT)); }
        catch (e) { failed++; continue; }

        // Would not fit at any quality. Ship nothing rather than something the
        // build refuses; the glyph half below picks it up.
        if (quality === null) { oversized.push([slug, out.length]); continue; }
        if (quality !== QUALITY_STEPS[0]) softened.push([slug, quality]);

        const h = await phash(out);
        if (seenHash.has(h)) duplicates.push([slug, seenHash.get(h)]);
        else seenHash.set(h, slug);

        total += out.length;
        photo.push(slug);

        const c = d.candidate;
        credits[slug] = {
            source: c.source, license: c.license || '',
            author: c.author || '', url: c.sourceUrl || ''
        };

        if (!DRY) fs.writeFileSync(path.join(VIS_DIR, slug + '.' + FORMAT), out);
        progress('06', i + 1, picked.length);
    }

    // The glyph half. Every entry that is not getting a photograph, and that the
    // mapper gave a concept to, keyed the way the index wants it: bucket ->
    // space-separated slugs, which is about a third the size of the other way
    // round and is flipped once per tab at load.
    const photoSet = new Set(photo);
    const icon = {};
    let glyphs = 0;
    for (const [slug, bucket] of Object.entries(iconmap.entries || {})) {
        if (photoSet.has(slug) || !entries.has(slug)) continue;
        if (!Visual.GLYPH[bucket]) continue;     // cannot draw it, do not ship it
        (icon[bucket] = icon[bucket] || []).push(slug);
        glyphs++;
    }

    // Everything with neither a photograph nor a concept, which is always a
    // concrete word: stage 01 judged it photographable and stage 02 went
    // looking, so stage 02b never gave it a concept. The 56 concepts are
    // abstractions and not one of them is what "anchor" is about.
    //
    // These used to fall to GENERIC - the word's own first letter on a
    // gradient - which was designed for a word the index has never heard of,
    // not for the several hundred we ship. Stage 02 already recorded whether it
    // was searching for a thing, an action or a person, so that answer is free
    // and it is worth far more than a letter.
    const iconSet = new Set(Object.keys(icon).flatMap(b => icon[b]));
    const queries = readJson(QUERIES, { entries: {} });
    const KIND_BUCKET = { object: 'kind-object', action: 'kind-action', role: 'kind-role' };
    const byKind = {};
    let uncovered = 0;
    for (const slug of entries.keys()) {
        if (photoSet.has(slug) || iconSet.has(slug)) continue;
        const q = queries.entries[slug];
        const bucket = KIND_BUCKET[q && q.kind];
        // No kind recorded - stage 02 skipped it, or answered outside its own
        // closed list. Nothing is the honest answer there: the card is drawn
        // with no picture panel, because visualFor draws only what this index
        // names. It used to draw the word's first letter, which is fine for one
        // word and was a disaster the day the index was missing entirely.
        if (!bucket) { uncovered++; continue; }
        (icon[bucket] = icon[bucket] || []).push(slug);
        (byKind[bucket] = byKind[bucket] || []).push(slug);
        glyphs++;
    }

    const iconOut = {};
    for (const [bucket, slugs] of Object.entries(icon)) iconOut[bucket] = slugs.sort().join(' ');

    const index = {
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        fmt: FORMAT,
        dim: [WIDTH, HEIGHT],
        photo: photo.sort(),
        icon: iconOut
    };

    // Sweep pictures the index no longer names.
    //
    // vis/ is written into, never cleaned, so every earlier run's files are
    // still sitting there: a word whose picture was dropped for being over the
    // cap keeps the oversized file, and scripts/build.js reads the DIRECTORY,
    // not the index. Fixing the encoder without this would leave the build
    // failing on exactly the files the fix was for. Only the picture extensions
    // are touched, and only ones this run did not write.
    const orphans = [];
    if (fs.existsSync(VIS_DIR)) {
        const want = new Set(photo.map(sl => sl + '.' + FORMAT));
        for (const name of fs.readdirSync(VIS_DIR)) {
            if (!/\.(avif|webp)$/.test(name) || want.has(name)) continue;
            orphans.push(name);
            if (!DRY) fs.unlinkSync(path.join(VIS_DIR, name));
        }
    }

    if (!DRY) {
        writeJson(INDEX_FILE, index);
        writeJson(CREDITS_FILE, { v: 1, generated: index.generated, credits });
    }

    console.log('[06] ' + photo.length + ' pictures, ' + glyphs + ' concept symbols, ' +
        Object.keys(iconOut).length + ' buckets in use' + (failed ? ', ' + failed + ' failed to encode' : ''));
    const kindTotal = Object.values(byKind).reduce((a, v) => a + v.length, 0);
    if (kindTotal) {
        console.log('[06] ' + kindTotal + ' concrete words ended without a photograph and show what KIND of' +
            '\n     thing they are instead: ' +
            Object.entries(byKind).map(([b, v]) => v.length + ' ' + b.replace('kind-', '')).join(', ') + '.');
        console.log('     A lower --accept-above turns more of these into photographs, at lower confidence.');
    }
    // Coverage, said out loud, because it is the number that decides whether the
    // feature looks finished. test/visual-index.test.js fails under 90%.
    const corpus = entries.size;
    const covered = corpus - uncovered;
    const pct = corpus ? (100 * covered / corpus) : 0;
    console.log('[06] coverage: ' + covered + '/' + corpus + ' entries (' + pct.toFixed(1) +
        '%) have a picture or a symbol.');
    if (uncovered) {
        console.log('     The other ' + uncovered + ' get a card with no picture at all - no');
        console.log('     photograph, no concept, and no kind recorded by stage 02.');
    }
    if (pct < 90) {
        console.log('');
        console.log('[06] WARNING: under 90% coverage, which npm test in merid-extension-final');
        console.log('     refuses. Most often stage 02b has not run, or not finished:');
        console.log('       node scripts/visual/02b-iconmap.mjs');
    }
    console.log('[06] vis/ is ' + (total / 1024 / 1024).toFixed(2) + 'MB' +
        ' (budget ' + (BUDGET / 1024 / 1024).toFixed(1) + 'MB)');

    if (duplicates.length) {
        const wordOf = sl => (entries.get(sl) || {}).word || sl.replace(/-[0-9a-z]{4}$/, '');
        const defOf = sl => ((entries.get(sl) || {}).definition || '').slice(0, 52);
        const shared = [];
        const wrong = [];
        for (const [a, b] of duplicates) {
            (sameRoot(wordOf(a), wordOf(b)) ? shared : wrong).push([a, b]);
        }

        if (shared.length) {
            console.log('[06] ' + shared.length + ' picture(s) shared by different forms of the same word, ' +
                'which is fine:');
            console.log('       ' + shared.slice(0, 6)
                .map(([a, b]) => wordOf(a) + '/' + wordOf(b)).join(', ') +
                (shared.length > 6 ? ', ...' : ''));
        }
        if (wrong.length) {
            console.log('[06] WARNING: ' + wrong.length + ' picture(s) used for two different words. ' +
                'One of each pair is wrong:');
            for (const [a, b] of wrong.slice(0, 10)) {
                console.log('       ' + wordOf(a) + ' - ' + defOf(a));
                console.log('       ' + wordOf(b) + ' - ' + defOf(b));
                console.log('         to look at both:  MERID_ONLY=' + wordOf(a) + ',' + wordOf(b) +
                    ' node scripts/visual/05-review.mjs --all');
                console.log('');
            }
        }
    }
    if (orphans.length) {
        console.log('[06] ' + (DRY ? 'would remove ' : 'removed ') + orphans.length +
            ' picture(s) from vis/ that the index no longer names' +
            (orphans.length <= 6 ? ': ' + orphans.join(', ') : ''));
    }
    if (softened.length) {
        console.log('[06] ' + softened.length + ' picture(s) needed a lower quality to fit the ' +
            (FILE_MAX / 1024) + 'KB cap: ' +
            softened.slice(0, 6).map(([s, q]) => s + ' Q' + q).join(', ') +
            (softened.length > 6 ? ', ...' : ''));
    }
    if (oversized.length) {
        console.log('[06] ' + oversized.length + ' picture(s) would not fit under the cap even at Q' +
            QUALITY_STEPS[QUALITY_STEPS.length - 1] + ', so they go without a picture:');
        for (const [s, n] of oversized.slice(0, 10)) console.log('       ' + s + ' (' + n + 'B)');
    }
    if (total > BUDGET) {
        console.log('[06] WARNING: over the total budget - scripts/build.js will refuse this');
    }
    console.log(DRY ? '[06] dry run, nothing written' : '[06] wrote ' + INDEX_FILE + ' and ' + VIS_DIR);
    warnUncommittedDecisions('06');
}

main().catch(err => { console.error(err); process.exit(1); });
