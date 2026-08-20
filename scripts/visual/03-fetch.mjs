#!/usr/bin/env node
// Stage 03 - collect candidate photographs.
//
// Three sources, in this order, all of them chosen for one reason: the licence
// has to permit REDISTRIBUTION, because these pictures end up inside a .crx
// that we hand to every reader. That is a stricter test than "free to use", and
// it is why Unsplash is absent despite being the obvious first thought - the
// Unsplash API Terms require hotlinking to their CDN and forbid redistributing
// the files, which is exactly what bundling does.
//
//   1. Openverse, filtered to cc0 and pdm. Public domain and CC0 carry no
//      attribution requirement at all, so nothing downstream can get the credit
//      wrong. It also aggregates Flickr, Wikimedia and others, so one query
//      reaches several archives.
//   2. Wikimedia Commons, filtered to PD/CC0 by reading each file's own licence
//      metadata rather than trusting the search. Best semantic precision of the
//      three for plain concrete nouns - a search for "anchor" returns anchors,
//      not moody photographs containing an anchor.
//   3. Pexels. The Pexels Licence permits redistribution and modification and
//      requires no credit. Best-looking photographs, loosest relationship
//      between a query and what comes back, hence last.
//
// Credit is recorded for all three anyway and shipped in vis/CREDITS.json. None
// of these licences compels it; it costs a few kilobytes the reader never
// downloads separately, and a picture whose provenance we cannot state is one
// we should not have shipped.
//
// Resumable to the point of being boring: candidates already on disk are never
// re-fetched, so an interrupted overnight run picks up where it stopped.
//
// Usage:
//   PEXELS_API_KEY=... node scripts/visual/03-fetch.mjs [--limit N] [--per-entry 6]
import fs from 'node:fs';
import path from 'node:path';
import { statePath, ensureState, writeJson, readJson, loadEntries, progress } from './lib/entries.mjs';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const numArg = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : dflt;
};
const LIMIT = numArg('--limit', Infinity);
const PER_ENTRY = numArg('--per-entry', 6);

const QUERIES = statePath('queries.json');
const OUT = statePath('candidates.json');
const THUMBS = statePath('candidates');

// Overridable so the test can point them at a local server. Not a feature for
// users - a test that cannot exercise the real parsers is not testing much.
const OPENVERSE = process.env.MERID_OPENVERSE_URL || 'https://api.openverse.org';
const WIKIMEDIA = process.env.MERID_WIKIMEDIA_URL || 'https://commons.wikimedia.org';
const PEXELS = process.env.MERID_PEXELS_URL || 'https://api.pexels.com';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// How long to stand down when a source says 429. Overridable so the test can
// cover that path without sleeping for a real minute.
const RATE_WAIT_MS = Number(process.env.MERID_RATE_WAIT_MS || 60000);

/** One request at a time per provider, no faster than its stated ceiling. */
class Throttle {
    constructor(perMinute) { this.gap = 60000 / perMinute; this.last = 0; }
    async wait() {
        const due = this.last + this.gap - Date.now();
        if (due > 0) await sleep(due);
        this.last = Date.now();
    }
}

async function getJson(url, headers = {}) {
    const resp = await fetch(url, { headers: { 'User-Agent': 'merid-visual-vocab/1.0', ...headers } });
    if (resp.status === 429) return { rateLimited: true };
    if (!resp.ok) return null;
    try { return await resp.json(); } catch (e) { return null; }
}

// --- providers -------------------------------------------------------------
// Each returns a flat list of candidates in one shape, so the caller never
// learns which archive a picture came from except to record it.

const openverse = {
    name: 'openverse',
    throttle: new Throttle(30),
    async search(query, want) {
        const url = OPENVERSE + '/v1/images/?' + new URLSearchParams({
            q: query,
            license: 'cc0,pdm',            // no attribution obligation at all
            page_size: String(want),
            mature: 'false'
        });
        const headers = process.env.OPENVERSE_TOKEN
            ? { Authorization: 'Bearer ' + process.env.OPENVERSE_TOKEN } : {};
        const json = await getJson(url, headers);
        if (!json || json.rateLimited) return json;
        return (json.results || []).map(r => ({
            source: 'openverse',
            id: String(r.id),
            title: r.title || '',
            author: r.creator || '',
            license: [r.license, r.license_version].filter(Boolean).join(' ').toUpperCase(),
            sourceUrl: r.foreign_landing_url || r.url || '',
            thumbUrl: r.thumbnail || r.url || ''
        })).filter(c => c.thumbUrl);
    }
};

const wikimedia = {
    name: 'wikimedia',
    throttle: new Throttle(60),
    async search(query, want) {
        // generator=search over the File: namespace, asking for each result's
        // licence metadata in the same round trip.
        const url = WIKIMEDIA + '/w/api.php?' + new URLSearchParams({
            action: 'query', format: 'json', origin: '*',
            generator: 'search', gsrnamespace: '6',
            gsrsearch: query + ' filetype:bitmap',
            gsrlimit: String(want * 2),     // room to drop the wrongly-licensed
            prop: 'imageinfo',
            iiprop: 'url|extmetadata',
            iiurlwidth: '640'
        });
        const json = await getJson(url);
        if (!json || json.rateLimited) return json;
        const pages = ((json.query || {}).pages) || {};
        const out = [];
        for (const page of Object.values(pages)) {
            const info = (page.imageinfo || [])[0];
            if (!info) continue;
            const meta = info.extmetadata || {};
            const licence = String((meta.LicenseShortName || {}).value || '').toUpperCase();
            // Read the file's own licence rather than trusting the search: a
            // CC-BY-SA photograph redistributed without its attribution chain
            // is a licence breach, not a styling detail.
            if (!/^(CC0|PUBLIC DOMAIN|PD)/.test(licence)) continue;
            out.push({
                source: 'wikimedia',
                id: String(page.pageid),
                title: (page.title || '').replace(/^File:/, ''),
                author: String((meta.Artist || {}).value || '').replace(/<[^>]*>/g, '').trim(),
                license: licence,
                sourceUrl: info.descriptionurl || '',
                thumbUrl: info.thumburl || info.url || ''
            });
        }
        return out.filter(c => c.thumbUrl).slice(0, want);
    }
};

const pexels = {
    name: 'pexels',
    throttle: new Throttle(180),
    async search(query, want) {
        if (!process.env.PEXELS_API_KEY) return [];
        const url = PEXELS + '/v1/search?' + new URLSearchParams({
            query, per_page: String(want), orientation: 'landscape'
        });
        const json = await getJson(url, { Authorization: process.env.PEXELS_API_KEY });
        if (!json || json.rateLimited) return json;
        return (json.photos || []).map(p => ({
            source: 'pexels',
            id: String(p.id),
            title: p.alt || '',
            author: p.photographer || '',
            license: 'PEXELS',
            sourceUrl: p.url || '',
            thumbUrl: (p.src || {}).large || (p.src || {}).medium || ''
        })).filter(c => c.thumbUrl);
    }
};

const PROVIDERS = [openverse, wikimedia, pexels];

async function download(url, file) {
    const resp = await fetch(url, { headers: { 'User-Agent': 'merid-visual-vocab/1.0' } });
    if (!resp.ok) return false;
    const type = resp.headers.get('content-type') || '';
    if (!/^image\//.test(type)) return false;
    const buf = Buffer.from(await resp.arrayBuffer());
    // A "thumbnail" that is 20 bytes is an error page with the wrong header.
    if (buf.length < 1024) return false;
    fs.writeFileSync(file, buf);
    return true;
}

async function main() {
    ensureState();
    fs.mkdirSync(THUMBS, { recursive: true });

    const queries = readJson(QUERIES, null);
    if (!queries) {
        console.error('[03] run 02-query.mjs first - no queries.json');
        process.exit(1);
    }
    const bySlug = new Map(loadEntries().map(e => [e.slug, e]));
    const searchable = Object.entries(queries.entries)
        .filter(([, q]) => q.depictable && q.query)
        .map(([slug, q]) => ({ slug, ...q, entry: bySlug.get(slug) }))
        .filter(x => x.entry);

    // An empty queries.json means stage 02 produced nothing, not that there is
    // nothing to fetch. Refusing here keeps the failure next to its cause.
    if (!searchable.length) {
        console.error('[03] queries.json has no usable queries - stage 02 produced none.');
        console.error('      Re-run: node scripts/visual/02-query.mjs');
        process.exit(1);
    }

    const result = readJson(OUT, { v: 1, entries: {} });
    result.entries = result.entries || {};

    // Drop entries stage 02 no longer wants a picture for.
    //
    // Re-running 02 with a stricter prompt turns some words from "searchable"
    // into "no photograph could show this". Their candidates stay on disk
    // otherwise, and stage 04 scores them, and stage 05 offers them - so a word
    // the pipeline has since decided is abstract still gets shown with three
    // photographs to choose between.
    const wanted = new Set(searchable.map(x => x.slug));
    let dropped = 0;
    for (const slug of Object.keys(result.entries)) {
        if (!wanted.has(slug)) { delete result.entries[slug]; dropped++; }
    }
    if (dropped) {
        console.log('[03] dropped ' + dropped + ' entries that are no longer searchable');
    }

    // Re-fetch when the query has changed. Skipping on slug alone was fine while
    // the queries were fixed, but stage 02 can be re-run with a better prompt -
    // and then the cached candidates answer a question nobody is asking any more.
    const todo = searchable.filter(x => {
        const had = result.entries[x.slug];
        return !had || had.query !== x.query;
    });
    const restale = todo.filter(x => result.entries[x.slug]).length;
    if (restale) console.log('[03] ' + restale + ' entries have a new query and will be fetched again');
    const work = todo.slice(0, LIMIT === Infinity ? todo.length : LIMIT);
    console.log('[03] ' + searchable.length + ' searchable, ' +
        (searchable.length - todo.length) + ' already fetched, doing ' + work.length);
    if (!process.env.PEXELS_API_KEY) console.log('[03] no PEXELS_API_KEY - skipping that source');

    let downloaded = 0;
    let empty = 0;

    for (const [i, item] of work.entries()) {
        // Ask every source, then let stage 04 choose between them.
        //
        // This used to stop as soon as it had enough, which in practice meant
        // Openverse and Wikimedia filled the list and Pexels was never asked -
        // and Pexels is the one that returns photographs of SCENES. Wikimedia
        // answers a query like "hiking trail going around mountain base" with a
        // topographic map, which is a perfectly good picture of a completely
        // useless kind. Pooling all three costs two more requests an entry and
        // gives CLIP something to choose from.
        const perSource = Math.max(3, Math.ceil(PER_ENTRY / 2));
        const pool = [];
        for (const provider of PROVIDERS) {
            await provider.throttle.wait();
            let batch;
            try { batch = await provider.search(item.query, perSource); } catch (e) { batch = null; }
            if (batch && batch.rateLimited) {
                // Being told to slow down is not a reason to lose the run.
                console.log('[03] ' + provider.name + ' rate-limited, standing down for ' +
                    Math.round(RATE_WAIT_MS / 1000) + 's');
                await sleep(RATE_WAIT_MS);
                try { batch = await provider.search(item.query, perSource); } catch (e) { batch = null; }
            }
            if (!Array.isArray(batch)) continue;
            for (const c of batch) {
                if (pool.some(f => f.thumbUrl === c.thumbUrl)) continue;
                pool.push(c);
            }
        }

        // Interleave by source so the cap cannot hand every slot to whichever
        // archive happened to answer first.
        const found = [];
        const bySource = new Map();
        for (const c of pool) {
            if (!bySource.has(c.source)) bySource.set(c.source, []);
            bySource.get(c.source).push(c);
        }
        for (let round = 0; found.length < PER_ENTRY; round++) {
            let added = false;
            for (const list of bySource.values()) {
                if (found.length >= PER_ENTRY) break;
                if (list[round]) { found.push(list[round]); added = true; }
            }
            if (!added) break;
        }

        const kept = [];
        for (const c of found) {
            // Named after the image, not after its position in the list.
            //
            // Position was wrong the moment re-fetching became possible: with a
            // new query, candidate 0 is a different photograph, but slug-0.img
            // was already on disk from the previous run - so the download was
            // skipped and the OLD picture was kept under the NEW candidate's
            // author and licence. Bytes and provenance disagreeing is not a
            // cosmetic problem when the file ships inside the extension.
            //
            // Hashing the source URL also makes the cache do what a cache
            // should: the same picture found twice is downloaded once, and a
            // different picture always lands somewhere else.
            const file = path.join(THUMBS, item.slug + '-' +
                crypto.createHash('sha1').update(c.thumbUrl).digest('hex').slice(0, 10) + '.img');
            if (!fs.existsSync(file)) {
                let ok = false;
                try { ok = await download(c.thumbUrl, file); } catch (e) { ok = false; }
                if (!ok) continue;
                downloaded++;
            }
            kept.push({ ...c, file: path.relative(statePath(), file) });
        }
        if (!kept.length) empty++;
        result.entries[item.slug] = {
            // The query is how the pictures were FOUND. The word and definition
            // are what stage 04 checks them against, and they have to travel
            // with them - scoring a picture against the query that fetched it
            // asks whether the search worked, not whether the picture means the
            // word.
            word: item.entry.word,
            definition: item.entry.definition || '',
            query: item.query,
            negative: item.negative || [],
            candidates: kept
        };

        if ((i + 1) % 20 === 0 || i + 1 === work.length) writeJson(OUT, result);
        progress('03', i + 1, work.length);
    }

    result.generated = new Date().toISOString();
    writeJson(OUT, result);

    // Re-fetching leaves the previous query's downloads behind. They are no
    // longer referenced by anything, and on a full re-run there can be
    // thousands of them.
    let swept = 0;
    const referenced = new Set();
    for (const e of Object.values(result.entries)) {
        for (const c of e.candidates) referenced.add(path.basename(c.file));
    }
    for (const f of fs.readdirSync(THUMBS)) {
        if (referenced.has(f)) continue;
        try { fs.unlinkSync(path.join(THUMBS, f)); swept++; } catch (e) { /* in use */ }
    }
    if (swept) console.log('[03] removed ' + swept + ' files left over from an earlier query');

    const total = Object.values(result.entries).reduce((a, e) => a + e.candidates.length, 0);
    console.log('[03] ' + downloaded + ' new files, ' + total + ' candidates over ' +
        Object.keys(result.entries).length + ' entries' +
        (empty ? ', ' + empty + ' entries found nothing' : ''));
    console.log('[03] wrote ' + OUT);
}

main().catch(err => { console.error(err); process.exit(1); });
