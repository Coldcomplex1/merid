#!/usr/bin/env node
// Stage 05 - a person looks at every picture before it ships.
//
// Stage 04 can tell that a photograph matches some words. It cannot tell that
// the photograph is of a diagram rather than the thing, or that it is a
// close-up so tight the object is unrecognisable, or that it happens to be
// somebody's holiday snap with the object in the corner. Those all score fine
// and all look wrong on a card. This is the stage that catches them, and it is
// the difference between "mostly right" and something worth shipping to
// learners who will trust it.
//
// Two decisions shape it, both aimed at the same thing - that an hour spent
// here should buy as much correctness as possible:
//
//   Doubtful first. Entries are ordered by stage 04's best score, ascending, so
//   the shakiest candidates are in front of you while your eye is fresh. Stop
//   whenever you like: what is left unreviewed is what the pipeline was most
//   confident about, and unreviewed entries take a concept glyph rather than an
//   unchecked photograph. Quitting halfway still ships something honest.
//
//   One keystroke per decision. 1/2/3 to pick, x to refuse them all, Enter to
//   take the top suggestion. Anything slower turns an hour into an evening.
//
// Every keystroke is written to disk before the next card is drawn, so closing
// the tab loses nothing.
//
// Usage:
//   node scripts/visual/05-review.mjs [--port 8787]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { statePath, readJson, writeJson, loadEntries, warnUncommittedDecisions } from './lib/entries.mjs';

const args = process.argv.slice(2);
const PORT = (() => {
    const i = args.indexOf('--port');
    return i >= 0 ? Number(args[i + 1]) : 8787;
})();
// Show even the entries stage 04 found nothing for. Useful when the thresholds
// are being tuned and you want to see what is behind them.
const REVIEW_ALL = args.includes('--all');

// Which end of the queue to start from.
//
// Worst-first by default: the entries whose best candidate only just cleared
// are the ones where looking actually decides something, and the confident ones
// can be waved through with Enter. This was best-first for a while, but that
// was solving a problem that no longer exists - back then entries with nothing
// above the floor were still in the queue, so opening the tool meant four
// screens of rubbish. They are refused before the queue is built now.
//
// The cost is at the other end: stop halfway through a worst-first queue and
// what is left unreviewed is the CONFIDENT half, and unreviewed means a symbol.
// So --order best is there for when you know you will not finish.
const ORDER = (() => {
    const i = args.indexOf('--order');
    const v = i >= 0 ? String(args[i + 1]) : 'worst';
    if (!['worst', 'best'].includes(v)) {
        console.error("[05] --order must be 'worst' or 'best'");
        process.exit(1);
    }
    return v;
})();

// Review a sample instead of the whole queue.
//
// Reviewing 290 entries to pick 290 pictures is one job. Reviewing 50 to find
// out whether the other 240 can be trusted is a different job and a much
// shorter one, and it is the one most people actually want: the answer to "at
// which score does the top candidate stop being right" is a fact about every
// entry, not only the ones that were looked at. 06-build.mjs reads the answer
// back out of the keystrokes.
//
// The sample is spread evenly across the score range rather than taken off
// either end. A sample drawn from one end can say how good that end is and
// nothing whatever about the rest, which is precisely what it would be used to
// decide.
const SAMPLE = (() => {
    const i = args.indexOf('--sample');
    if (i < 0) return 0;
    const n = Number(args[i + 1]);
    if (!Number.isFinite(n) || n < 5) {
        console.error('[05] --sample needs a number of at least 5');
        process.exit(1);
    }
    return Math.floor(n);
})();

// Review these words and nothing else, starting at the first card even though
// they have already been decided.
//
// For going back to a handful by name - the pairs 06-build.mjs reports as
// sharing one photograph, say, where at least one of the two is wrong. A flag
// rather than MERID_ONLY, which does the same filtering but through the
// environment: in a shell that keeps it set, the next 06-build.mjs would see
// six entries, decide the other several hundred no longer exist, and write an
// index with six pictures in it.
const ONLY = (() => {
    const i = args.indexOf('--only');
    if (i < 0) return null;
    const raw = String(args[i + 1] || '');
    const words = raw.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    if (!words.length) {
        console.error('[05] --only needs words, e.g. --only craft,artisan');
        process.exit(1);
    }
    return new Set(words);
})();

// How many entries were eligible before sampling cut it down, so the review UI
// can say what the sample is standing in for.
let QUEUE_TOTAL = 0;

const RANKED = statePath('ranked.json');
const DECISIONS = statePath('decisions.json');
const STATE_DIR = statePath();

function buildQueue() {
    const ranked = readJson(RANKED, null);
    if (!ranked) {
        console.error('[05] run 04-rank.py first - no ranked.json');
        process.exit(1);
    }
    const entries = new Map(loadEntries().map(e => [e.slug, e]));
    const items = [];
    let refused = 0;
    for (const [slug, r] of Object.entries(ranked.entries || {})) {
        const entry = entries.get(slug);
        if (!entry || !r.candidates || !r.candidates.length) continue;
        if (ONLY && !ONLY.has(String(entry.word).toLowerCase())) continue;
        // Nothing cleared the floor, so every candidate is a picture of
        // something else. Showing these asks the reviewer to confirm a verdict
        // the pipeline has already reached, several hundred times. They take a
        // drawn symbol, like any other word without a usable photograph.
        if (!r.anyClear && !REVIEW_ALL) { refused++; continue; }
        items.push({
            slug,
            word: entry.word,
            type: entry.type || '',
            definition: entry.definition || '',
            example: entry.example || '',
            vietnamese: entry.vietnamese || '',
            query: r.query,
            negative: r.negative || [],
            best: r.best,
            candidates: r.candidates.slice(0, 3).map(c => ({
                file: c.file, source: c.source, license: c.license,
                author: c.author, sourceUrl: c.sourceUrl,
                score: c.score, margin: c.margin, clear: c.clear
            }))
        });
    }
    if (refused) {
        console.log('[05] ' + refused + ' entries had no candidate clearing stage 04 - ' +
            'they get no picture. Pass --all to review them anyway.');
        console.log('[05] NOTE: these are concrete words - stage 02 went looking for photographs of');
        console.log('     them - so stage 02b never gave them a concept either. The 56 concepts are');
        console.log('     abstractions and none of them is what "anchor" is about. Without a picture');
        console.log('     they show their first letter on a gradient, not a symbol.');
    }

    items.sort((a, b) => a.best - b.best);

    // Take the sample before applying the reading order: five equal bands by
    // score, an equal share drawn evenly from each. A sample skewed to one end
    // would measure that end and say nothing about the rest.
    let queue = items;
    if (SAMPLE && items.length > SAMPLE) {
        const bands = 5;
        const perBand = Math.ceil(SAMPLE / bands);
        const picked = [];
        for (let b = 0; b < bands; b++) {
            const from = Math.floor(items.length * b / bands);
            const to = Math.floor(items.length * (b + 1) / bands);
            const band = items.slice(from, to);
            const step = Math.max(1, Math.floor(band.length / perBand));
            for (let i = 0, n = 0; i < band.length && n < perBand; i += step, n++) {
                picked.push(band[i]);
            }
        }
        queue = picked.slice(0, SAMPLE);
        QUEUE_TOTAL = items.length;
        console.log('[05] sampling ' + queue.length + ' of ' + items.length +
            ' entries, spread evenly across the score range');
        console.log('[05] scores ' + queue[0].best.toFixed(3) + ' to ' +
            queue[queue.length - 1].best.toFixed(3));
    }

    if (ORDER === 'best') queue = queue.slice().reverse();

    if (ONLY) {
        const found = new Set(queue.map(q => q.word.toLowerCase()));
        const missing = [...ONLY].filter(w => !found.has(w));
        if (missing.length) {
            console.log('[05] not in the queue: ' + missing.join(', ') +
                '\n     (no candidate cleared stage 04 for them - add --all to see those too)');
        }
    }
    return queue;
}

const PAGE = String.raw`<!doctype html><meta charset="utf-8">
<title>Merid - pick a picture</title>
<style>
  :root { --ink:#1c2c47; --muted:#6c7c9c; --line:#dfe5f0; --gold:#f3c94b; --navy:#19355d; }
  * { box-sizing:border-box }
  body { margin:0; font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink);
         background:#f6f7fb; display:flex; flex-direction:column; height:100vh }
  header { padding:10px 18px; background:var(--navy); color:#fff; display:flex; gap:18px; align-items:center }
  header b { font-size:17px }
  header .bar { flex:1; height:6px; background:rgba(255,255,255,.2); border-radius:3px; overflow:hidden }
  header .bar i { display:block; height:100%; background:var(--gold) }
  main { flex:1; overflow:auto; padding:18px; max-width:1100px; margin:0 auto; width:100% }
  .word { font-size:30px; font-weight:700; letter-spacing:.01em }
  .pos { color:var(--muted); font-weight:400; font-size:17px }
  .def { margin:6px 0 2px; font-size:16px }
  .ex { color:var(--muted); font-style:italic }
  .meta { margin-top:6px; font-size:13px; color:var(--muted) }
  .cands { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:16px }
  .cand { background:#fff; border:2px solid var(--line); border-radius:12px; overflow:hidden; cursor:pointer }
  .cand.clear { border-color:#8fce9b }
  .cand:hover { border-color:var(--navy) }
  .cand img { width:100%; aspect-ratio:2/1; object-fit:cover; display:block; background:#eef1f7 }
  .cand .k { position:absolute; margin:6px; background:var(--navy); color:#fff; font-weight:700;
             border-radius:6px; padding:1px 8px; font-size:13px }
  .cand .f { padding:8px 10px; font-size:12px; color:var(--muted); display:flex; justify-content:space-between; gap:8px }
  .empty { padding:60px 0; text-align:center; color:var(--muted) }
  footer { padding:10px 18px; background:#fff; border-top:1px solid var(--line); font-size:13px; color:var(--muted) }
  kbd { background:#eef1f7; border:1px solid var(--line); border-bottom-width:2px; border-radius:4px;
        padding:1px 6px; font:inherit; font-size:12px }
  .done { padding:80px 20px; text-align:center }
</style>
<header>
  <b>Merid</b><span id="count"></span>
  <span class="bar"><i id="prog"></i></span>
  <span id="saved"></span>
</header>
<main id="main"></main>
<footer>
  <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pick &nbsp;
  <kbd>Enter</kbd> take the first &nbsp;
  <kbd>x</kbd> none of these, use a symbol &nbsp;
  <kbd>&larr;</kbd> back &nbsp;
  <kbd>&rarr;</kbd> skip for now
</footer>
<script>
let queue = [], decisions = {}, i = 0, sample = null, inQueue = new Set();

// Only decisions about entries in THIS queue count towards the progress bar.
// decisions.json accumulates across runs, so with --sample most of what is in
// it belongs to some other queue, and counting all of it would show the bar
// full before the first card was answered.
function reviewedHere() {
  return Object.keys(decisions).filter(s => inQueue.has(s)).length;
}

async function boot() {
  const r = await fetch('/api/queue');
  const data = await r.json();
  queue = data.queue; decisions = data.decisions; sample = data.sample;
  inQueue = new Set(queue.map(q => q.slug));
  // Resume where the reviewing stopped rather than at the top - unless the
  // queue was named word by word, in which case every card in it was asked for
  // deliberately and skipping the decided ones would show an empty tool.
  i = data.redo ? 0 : queue.findIndex(q => !(q.slug in decisions));
  if (i < 0) i = queue.length;
  draw();
}

function draw() {
  const main = document.getElementById('main');
  const reviewed = reviewedHere();
  document.getElementById('count').textContent = reviewed + ' / ' + queue.length;
  document.getElementById('prog').style.width = (100 * reviewed / Math.max(1, queue.length)) + '%';

  if (i >= queue.length) {
    main.innerHTML = '<div class="done"><h2>All done.</h2>' +
      '<p>' + reviewed + ' reviewed. Run <code>node scripts/visual/06-build.mjs</code> next.</p>' +
      (sample
        ? '<p>It will print how often the first candidate was the one you kept, at each ' +
          'score, and what that means for the ' + sample.remaining + ' entries you did not see.</p>'
        : '') + '</div>';
    return;
  }
  const q = queue[i];
  const chosen = decisions[q.slug];
  main.innerHTML =
    '<div class="word">' + esc(q.word) + ' <span class="pos">' + esc(q.type) + '</span></div>' +
    '<div class="def">' + esc(q.definition) + '</div>' +
    (q.example ? '<div class="ex">' + esc(q.example) + '</div>' : '') +
    '<div class="meta">searched: <b>' + esc(q.query) + '</b>' +
      (q.negative.length ? ' &nbsp;|&nbsp; not: ' + esc(q.negative.join(', ')) : '') +
      (chosen ? ' &nbsp;|&nbsp; already decided: <b>' + esc(String(chosen.pick)) + '</b>' : '') +
    '</div>' +
    (q.candidates.length
      ? '<div class="cands">' + q.candidates.map((c, n) =>
          '<div class="cand' + (c.clear ? ' clear' : '') + '" onclick="pick(' + n + ')">' +
            '<span class="k">' + (n + 1) + '</span>' +
            '<img loading="lazy" src="/img/' + encodeURIComponent(c.file) + '">' +
            '<div class="f"><span>' + esc(c.source) + ' &middot; ' + esc(c.license || '') + '</span>' +
            '<span>' + c.score.toFixed(3) + (c.margin === null ? '' : ' / ' + c.margin.toFixed(3)) + '</span></div>' +
          '</div>').join('') + '</div>'
      : '<div class="empty">No candidates were found for this one.</div>');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

async function decide(pick) {
  const q = queue[i];
  decisions[q.slug] = pick === null
    ? { pick: 'none' }
    : { pick, candidate: q.candidates[pick] };
  // Written before the next card is drawn: closing the tab loses nothing.
  await fetch('/api/decide', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: q.slug, decision: decisions[q.slug] })
  });
  const s = document.getElementById('saved');
  s.textContent = 'saved';
  setTimeout(() => { s.textContent = ''; }, 600);
  i++; draw();
}

window.pick = n => { if (queue[i] && queue[i].candidates[n]) decide(n); };

addEventListener('keydown', e => {
  if (i >= queue.length && e.key !== 'ArrowLeft') return;
  if (e.key >= '1' && e.key <= '3') { window.pick(+e.key - 1); e.preventDefault(); }
  else if (e.key === 'Enter') { window.pick(0); e.preventDefault(); }
  else if (e.key === 'x' || e.key === 'X') { decide(null); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { i = Math.min(queue.length, i + 1); draw(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { i = Math.max(0, i - 1); draw(); e.preventDefault(); }
});

boot();
</script>`;

function main() {
    const queue = buildQueue();
    if (!queue.length) {
        // "did 03 and 04 run?" was the old message here, and it was wrong in
        // the case that actually happens: they had run, and produced nothing.
        // Point at the stage that came up empty rather than at the reader.
        const ranked = readJson(RANKED, { entries: {} });
        const scored = Object.keys(ranked.entries || {}).length;
        const candidates = readJson(statePath('candidates.json'), { entries: {} });
        const fetched = Object.values(candidates.entries || {})
            .reduce((a, e) => a + (e.candidates || []).length, 0);

        if (!fetched) {
            console.error('[05] nothing to review: stage 03 downloaded no candidates.');
            console.error('      Check that 02-query.mjs produced queries, then re-run 03-fetch.mjs.');
        } else if (!scored) {
            console.error('[05] nothing to review: ' + fetched + ' candidates were downloaded but ' +
                'none have been scored.');
            console.error('      Run: python3 scripts/visual/04-rank.py');
        } else {
            // Everything was filtered out above rather than lost. Say which of
            // the two it was, because the fixes are opposite: one is a threshold
            // to loosen, the other is files to go and find.
            console.error('[05] nothing to review: none of the ' + scored +
                ' scored entries had a candidate clearing stage 04.');
            console.error('      Being concrete words, they have no concept glyph to fall back on');
            console.error('      either, so they would show only their first letter.');
            console.error('      To look at them anyway:  node scripts/visual/05-review.mjs --all');
            console.error('      To loosen the bar:       MERID_CLIP_FLOOR=0.20 python3 scripts/visual/04-rank.py');
        }
        process.exit(1);
    }

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');

        if (url.pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(PAGE);
        }

        if (url.pathname === '/api/queue') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                queue, decisions: readJson(DECISIONS, {}),
                redo: !!ONLY,
                sample: SAMPLE ? { size: queue.length, remaining: QUEUE_TOTAL - queue.length } : null
            }));
        }

        if (url.pathname === '/api/decide' && req.method === 'POST') {
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', () => {
                try {
                    const { slug, decision } = JSON.parse(body);
                    const all = readJson(DECISIONS, {});
                    all[slug] = { ...decision, at: new Date().toISOString() };
                    writeJson(DECISIONS, all);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{"ok":true}');
                } catch (e) {
                    res.writeHead(400); res.end('{"ok":false}');
                }
            });
            return;
        }

        if (url.pathname.startsWith('/img/')) {
            const rel = decodeURIComponent(url.pathname.slice(5));
            const file = path.resolve(STATE_DIR, rel);
            // Serve only from inside state/: this is a local tool, but a path
            // that walks out of its own directory is never worth allowing.
            if (!file.startsWith(path.resolve(STATE_DIR) + path.sep) || !fs.existsSync(file)) {
                res.writeHead(404); return res.end();
            }
            res.writeHead(200, { 'Content-Type': 'image/*', 'Cache-Control': 'max-age=3600' });
            return res.end(fs.readFileSync(file));
        }

        res.writeHead(404); res.end();
    });

    server.listen(PORT, '127.0.0.1', () => {
        const inQueue = new Set(queue.map(q => q.slug));
        const reviewed = Object.keys(readJson(DECISIONS, {})).filter(sl => inQueue.has(sl)).length;
        console.log('[05] ' + queue.length + ' entries to review, ' + reviewed + ' already done');
        if (SAMPLE) {
            console.log('[05] this is a measurement, not a selection: finish the sample,\n' +
                '     then run 06-build.mjs to see how often the top candidate was right\n' +
                '     at each score, and what that means for the entries you did not see.');
        } else {
            console.log('[05] ' + (ORDER === 'worst'
                ? 'least confident first - your attention goes where it decides something.\n' +
                  '     Stopping early leaves the CONFIDENT ones unreviewed, and unreviewed\n' +
                  '     means a symbol. Use --order best if you know you will not finish.'
                : 'most confident first - stopping early only leaves behind entries that\n' +
                  '     were unlikely to survive a look anyway.'));
        }
        console.log('[05] open http://127.0.0.1:' + PORT + '  (ctrl-c when you have had enough)');
        warnUncommittedDecisions('05');
    });
}

main();
