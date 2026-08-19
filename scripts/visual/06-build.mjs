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
// Usage:
//   node scripts/visual/06-build.mjs [--format avif|webp] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { EXT, statePath, readJson, writeJson, loadEntries, Visual, progress } from './lib/entries.mjs';

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch (e) {
    console.error('[06] sharp is not installed. Run:  npm i -D sharp');
    process.exit(1);
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORMAT = (() => {
    const i = args.indexOf('--format');
    const v = i >= 0 ? String(args[i + 1]).toLowerCase() : 'avif';
    if (v !== 'avif' && v !== 'webp') { console.error('[06] --format must be avif or webp'); process.exit(1); }
    return v;
})();

const WIDTH = 320;
const HEIGHT = 160;      // 2:1, matching .vm-visual's aspect-ratio in content.css
const QUALITY = 45;
const FILE_MAX = 9 * 1024;               // matches scripts/build.js
const BUDGET = 6.0 * 1024 * 1024;

const DECISIONS = statePath('decisions.json');
const CANDIDATES = statePath('candidates.json');
const ICONMAP = statePath('iconmap.json');
const VIS_DIR = path.join(EXT, 'vis');
const INDEX_FILE = path.join(EXT, 'visual-index.json');
const CREDITS_FILE = path.join(VIS_DIR, 'CREDITS.json');

const encode = (buf, format) => sharp(buf)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
    [format]({ quality: QUALITY, effort: format === 'avif' ? 9 : 6 })
    .toBuffer();

/**
 * A cheap perceptual hash: 8x8 greyscale, each pixel against the mean.
 *
 * Only used to notice that two words were given the same photograph. Not
 * robust against crops or recolouring, and does not need to be - the case it
 * catches is the literal same file arriving twice from two archives.
 */
async function phash(buf) {
    const small = await sharp(buf).resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
    const mean = small.reduce((a, b) => a + b, 0) / small.length;
    let bits = '';
    for (const v of small) bits += v >= mean ? '1' : '0';
    return bits;
}

async function main() {
    const decisions = readJson(DECISIONS, null);
    if (!decisions) { console.error('[06] no decisions.json - run 05-review.mjs first'); process.exit(1); }
    const candidates = readJson(CANDIDATES, { entries: {} });
    const iconmap = readJson(ICONMAP, { entries: {} });
    const entries = new Map(loadEntries().map(e => [e.slug, e]));

    const picked = Object.entries(decisions)
        .filter(([slug, d]) => d && d.pick !== 'none' && d.candidate && entries.has(slug));
    console.log('[06] ' + Object.keys(decisions).length + ' decisions, ' +
        picked.length + ' of them chose a picture');

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
    let total = 0;
    let failed = 0;

    for (const [i, [slug, d]] of picked.entries()) {
        const src = path.join(statePath(), d.candidate.file);
        if (!fs.existsSync(src)) { failed++; continue; }
        let out;
        try { out = await encode(fs.readFileSync(src), FORMAT); }
        catch (e) { failed++; continue; }

        const h = await phash(out);
        if (seenHash.has(h)) duplicates.push([slug, seenHash.get(h)]);
        else seenHash.set(h, slug);

        if (out.length > FILE_MAX) oversized.push([slug, out.length]);
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

    if (!DRY) {
        writeJson(INDEX_FILE, index);
        writeJson(CREDITS_FILE, { v: 1, generated: index.generated, credits });
    }

    console.log('[06] ' + photo.length + ' pictures, ' + glyphs + ' glyph assignments, ' +
        Object.keys(iconOut).length + ' buckets in use' + (failed ? ', ' + failed + ' failed to encode' : ''));
    console.log('[06] vis/ is ' + (total / 1024 / 1024).toFixed(2) + 'MB' +
        ' (budget ' + (BUDGET / 1024 / 1024).toFixed(1) + 'MB)');

    if (duplicates.length) {
        console.log('[06] WARNING: ' + duplicates.length + ' pictures are used twice - at least ' +
            'one word in each pair is illustrated with the wrong thing:');
        for (const [a, b] of duplicates.slice(0, 10)) console.log('       ' + a + ' == ' + b);
    }
    if (oversized.length) {
        console.log('[06] WARNING: ' + oversized.length + ' over the ' + FILE_MAX + 'B per-picture cap; ' +
            'the build will refuse these. Lower --quality or re-crop:');
        for (const [s, n] of oversized.slice(0, 10)) console.log('       ' + s + ' ' + n + 'B');
    }
    if (total > BUDGET) {
        console.log('[06] WARNING: over the total budget - scripts/build.js will refuse this');
    }
    console.log(DRY ? '[06] dry run, nothing written' : '[06] wrote ' + INDEX_FILE + ' and ' + VIS_DIR);
}

main().catch(err => { console.error(err); process.exit(1); });
