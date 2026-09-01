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
import { acceptableLicence, licenceDeed } from './lib/licence.mjs';
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
// What each archive actually did, for the stages and reports that come after.
const REPORT = statePath('fetch-report.json');
const THUMBS = statePath('candidates');

// Overridable so the test can point them at a local server. Not a feature for
// users - a test that cannot exercise the real parsers is not testing much.
const OPENVERSE = process.env.MERID_OPENVERSE_URL || 'https://api.openverse.org';
const WIKIMEDIA = process.env.MERID_WIKIMEDIA_URL || 'https://commons.wikimedia.org';
const PEXELS = process.env.MERID_PEXELS_URL || 'https://api.pexels.com';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// How long to stand a source down when it says 429. Overridable so the test can
// cover that path without sleeping for a real minute.
const RATE_WAIT_MS = Number(process.env.MERID_RATE_WAIT_MS || 60000);

const rate = (name, dflt) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : dflt;
};

// How fast each source may be asked, per minute.
//
// These are budgets, not guesses at how fast the network is. Pexels' free tier
// is 200 requests an HOUR - the number this repository's own README has always
// carried - and this file used to ask at 180 a MINUTE, which is fifty-four
// times over. On a run of four to six hundred concrete words that spends the
// hour's allowance in about two minutes and then meets 429 on everything after
// it.
//
// 180 an hour rather than 200 leaves room for whatever else shares the key.
const PEXELS_PER_MIN = rate('MERID_PEXELS_PER_HOUR', 180) / 60;
// Unchanged, deliberately. Openverse publishes different limits for anonymous
// and registered clients and I could not measure the anonymous one; lowering a
// working number on a guess would cost coverage for nothing. What changes is
// what happens when it IS refused - see Budget.rest below. Raise it when you
// have a token: MERID_OPENVERSE_PER_MIN=60.
const OPENVERSE_PER_MIN = rate('MERID_OPENVERSE_PER_MIN', 30);
// No key, no account, and a documented tolerance for a single well-behaved
// client. The one source that can afford to be waited for.
const WIKIMEDIA_PER_MIN = rate('MERID_WIKIMEDIA_PER_MIN', 60);

/** One request at a time per provider, no faster than its stated ceiling. */
/**
 * One source's request budget, and whether it may be asked right now.
 *
 * The predecessor of this class only knew how to wait, and the fetch loop only
 * knew how to sleep - so a source that ran out of allowance cost SIXTY SECONDS
 * PER ENTRY for the rest of the run, and a stage budgeted at an hour became
 * four. That is the whole reason this is not a throttle any more.
 *
 * Two ideas, and the second is the one that matters:
 *
 *   A source can be optional. `blocking` sources are waited for; the rest are
 *   simply SKIPPED when their next turn is not due yet. Pexels then spreads its
 *   allowance evenly across the whole run instead of sprinting into a wall, and
 *   the entries it cannot reach cost nothing rather than a minute each.
 *
 *   Being refused rests the SOURCE, not the run. A 429 stands that one source
 *   down for a while; the other two carry on answering, and it rejoins when its
 *   window reopens. Stage 03 has always treated a source that did not answer as
 *   ordinary - `if (!Array.isArray(batch)) continue` - so this is not a new
 *   state for anything downstream, only a cheaper way of reaching it.
 */
class Budget {
    constructor(perMinute, { blocking = false } = {}) {
        this.gap = 60000 / perMinute;
        this.last = 0;
        this.blocking = blocking;
        this.restingUntil = 0;
        // For the summary at the end, which is how you find out that a source
        // was barely present without reading four hundred lines of progress.
        this.asked = 0;
        this.skipped = 0;
        this.refused = 0;
    }

    /** ms until this source may be asked again; <= 0 means now. */
    dueIn(now = Date.now()) {
        return Math.max(this.last + this.gap, this.restingUntil) - now;
    }

    /** Take a turn if there is one. Blocking sources wait for it; others decline. */
    async take() {
        const due = this.dueIn();
        if (due > 0) {
            // Never wait out a stand-down, even for a blocking source: that is
            // the minute-per-entry this class exists to stop.
            if (!this.blocking || this.restingUntil > Date.now()) {
                this.skipped++;
                return false;
            }
            await sleep(due);
        }
        this.last = Date.now();
        this.asked++;
        return true;
    }

    /** Told to slow down. Stand this source down without stopping the run. */
    rest(ms) {
        this.restingUntil = Date.now() + ms;
        this.refused++;
    }
}

/**
 * Wikimedia's Artist field is HTML - usually a link round the photographer's
 * name - and this is the only place that markup could reach a file we ship.
 * The author string lands in vis/CREDITS.json and is rendered by the Settings
 * page.
 *
 * One pass of /<[^>]*>/g is not enough and CodeQL is right to say so: strip the
 * inner tag out of `<scr<span>ipt>` and the two halves close up into a real one.
 * Repeating until the string stops changing is what makes it a sanitiser rather
 * than a tidy-up. options.js escapes this again on the way to the DOM - two
 * layers, because the first is a guess about someone else's HTML.
 */
function stripTags(html) {
    let out = String(html);
    for (let i = 0; i < 8; i++) {
        const next = out.replace(/<[^>]*>/g, '');
        if (next === out) break;
        out = next;
    }
    // A lone unclosed "<script" leaves no tag for the loop to find.
    return out.replace(/[<>]/g, '').trim();
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
    budget: new Budget(OPENVERSE_PER_MIN),
    enabled: () => true,
    async search(query, want) {
        const url = OPENVERSE + '/v1/images/?' + new URLSearchParams({
            q: query,
            // Asked of the archive as well as checked below. 'by' is plain
            // CC BY only - Openverse spells share-alike 'by-sa', which is a
            // different code and is not in this list.
            license: 'cc0,pdm,by',
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
            licenseUrl: r.license_url || licenceDeed(r.license, r.license_version),
            sourceUrl: r.foreign_landing_url || r.url || '',
            thumbUrl: r.thumbnail || r.url || ''
        })).filter(c => c.thumbUrl && acceptableLicence(c.license));
    }
};

const wikimedia = {
    name: 'wikimedia',
    // The only source worth waiting for: it needs no key, it takes the most
    // careful view of licensing, and it is the most precise of the three on
    // plain concrete nouns.
    budget: new Budget(WIKIMEDIA_PER_MIN, { blocking: true }),
    enabled: () => true,
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
            // Read the FILE's own licence rather than trusting the search. The
            // search index and the file disagree often enough to matter, and
            // shipping a CC BY-SA or -ND photograph on the strength of an index
            // entry is a licence breach, not a styling detail.
            if (!acceptableLicence(licence)) continue;
            out.push({
                source: 'wikimedia',
                id: String(page.pageid),
                title: (page.title || '').replace(/^File:/, ''),
                author: stripTags(String((meta.Artist || {}).value || '')),
                license: licence,
                licenseUrl: String((meta.LicenseUrl || {}).value || '') || licenceDeed(licence),
                sourceUrl: info.descriptionurl || '',
                thumbUrl: info.thumburl || info.url || ''
            });
        }
        return out.filter(c => c.thumbUrl).slice(0, want);
    }
};

const pexels = {
    name: 'pexels',
    budget: new Budget(PEXELS_PER_MIN),
    // Checked before a turn is taken rather than inside search(): spending
    // budget to return an empty list would make the source look rate-limited
    // in the summary when it was never configured.
    enabled: () => !!process.env.PEXELS_API_KEY,
    async search(query, want) {
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
            licenseUrl: 'https://www.pexels.com/license/',
            sourceUrl: p.url || '',
            thumbUrl: (p.src || {}).large || (p.src || {}).medium || ''
        })).filter(c => c.thumbUrl && acceptableLicence(c.license));
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
    // Said up front, because the budgets are the thing that decides how much of
    // this run each source actually reaches, and finding that out afterwards is
    // finding it out too late.
    for (const provider of PROVIDERS) {
        if (!provider.enabled()) {
            console.log('[03] ' + provider.name + ': off (no key) - the other sources carry on');
            continue;
        }
        const perMin = 60000 / provider.budget.gap;
        console.log('[03] ' + provider.name + ': ' +
            (perMin >= 1 ? perMin.toFixed(0) + '/min' : Math.round(perMin * 60) + '/hour') +
            (provider.budget.blocking ? ', waited for' : ', skipped when not due'));
    }
    if (!process.env.OPENVERSE_TOKEN) {
        console.log('[03] no OPENVERSE_TOKEN - anonymous limits apply. Whether that costs');
        console.log('     anything is in the "refused" column of the summary below, not here.');
    }

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
            if (!provider.enabled()) continue;
            // Not due yet, or standing down: skip this source for this entry
            // rather than holding the whole run up for it.
            if (!await provider.budget.take()) continue;
            let batch;
            try { batch = await provider.search(item.query, perSource); } catch (e) { batch = null; }
            if (batch && batch.rateLimited) {
                // Being told to slow down is not a reason to lose the run, and
                // not a reason to sleep through it either. Rest this source and
                // carry on with the other two; it rejoins by itself.
                console.log('[03] ' + provider.name + ' rate-limited, resting it for ' +
                    Math.round(RATE_WAIT_MS / 1000) + 's - the other sources carry on');
                provider.budget.rest(RATE_WAIT_MS);
                continue;
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

    // Which source actually reached which entries.
    //
    // A budget that turns out to be too small does not fail, it just quietly
    // contributes to fewer words - and "Pexels covered 40 of 500 entries" is
    // the only place that shows up. Counted over the whole corpus on disk, not
    // just this run's slice, because that is the number stage 04 will score.
    const reach = new Map();
    for (const e of Object.values(result.entries)) {
        const seen = new Set(e.candidates.map(c => c.source));
        for (const src of seen) reach.set(src, (reach.get(src) || 0) + 1);
    }
    const corpus = Object.keys(result.entries).length || 1;
    console.log('[03] reach, over ' + corpus + ' entries:');
    for (const provider of PROVIDERS) {
        const n = reach.get(provider.name) || 0;
        const b = provider.budget;
        console.log('     ' + provider.name.padEnd(10) + String(n).padStart(5) + ' entries (' +
            Math.round(100 * n / corpus) + '%)' +
            (provider.enabled()
                ? '  asked ' + b.asked + ', skipped ' + b.skipped +
                  (b.refused ? ', refused ' + b.refused : '')
                : '  off (no key)'));
    }
    const starved = PROVIDERS.filter(p => p.enabled() && p.budget.refused > 0);
    if (starved.length) {
        console.log('[03] ' + starved.map(p => p.name).join(' and ') +
            ' hit a rate limit during this run. Re-running 03 later picks up only');
        console.log('     entries with no candidates at all, so to widen an entry that already');
        console.log('     has some, change its query in stage 02 or raise the budget:');
        console.log('       MERID_PEXELS_PER_HOUR=... MERID_OPENVERSE_PER_MIN=...');
    }
    // The same figures, written down.
    //
    // Printed, they answer the question only for whoever is watching the
    // terminal at the time. The question they answer is the one that decides
    // what to do next, and it comes up an hour later, in another process: an
    // archive that reached few entries because it was REFUSED has a rate limit
    // to raise, and an archive that was asked and simply had nothing has no fix
    // at all - no key, no token, no budget changes it. Those two look identical
    // in the reach column and opposite in this file.
    writeJson(REPORT, {
        v: 1,
        generated: new Date().toISOString(),
        entries: Object.keys(result.entries).length,
        sources: Object.fromEntries(PROVIDERS.map(p => [p.name, {
            reach: reach.get(p.name) || 0,
            enabled: p.enabled(),
            perMin: Math.round(60000 / p.budget.gap * 100) / 100,
            asked: p.budget.asked,
            skipped: p.budget.skipped,
            refused: p.budget.refused
        }]))
    });

    console.log('[03] wrote ' + OUT);
}

main().catch(err => { console.error(err); process.exit(1); });
