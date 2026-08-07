// End-to-end check of the endless-feed path: a page that keeps mounting posts
// as you scroll, the way Facebook/Instagram/Threads do.
//
// The three claims under test are the ones a unit test cannot reach:
//   1. Posts far down the feed still get their words context-checked. The old
//      three-requests-per-page cap meant everything past the first few screens
//      shipped whatever the dataset picked, unverified.
//   2. Each post stays within its allowance, and no headword is used twice
//      across the whole session - not just within one post.
//   3. A single post left alone on screen is checked within 20 seconds, even
//      though it is nowhere near a full batch.
//
// Gemini is stubbed inside the service worker (see e2e/ai-check.mjs for why the
// stub must match the hostname exactly and let dataset CSV fetches through).
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Vietnamese meanings pulled straight out of dataset-C1.csv, so the matching
// under test is the real thing. Every phrase on the page is distinct: repeats
// would be collapsed by the one-per-session rule and the feed would stop
// proving anything about reach. Each post carries several of them, which is
// what lets the scan over-provision candidates and the cap prune them back -
// with one phrase per post there is nothing to choose between.
const POSTS = 40;
const PHRASES_PER_POST = 3;

function loadPhrases(limit) {
    const csv = fs.readFileSync(new URL('../dataset-C1.csv', import.meta.url), 'utf8');
    const seen = new Set();
    const out = [];
    for (const line of csv.split('\n').slice(1)) {
        if (!line.trim()) continue;
        const quoted = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
        if (quoted.length < 3) continue;
        // vietnamese sits just before the synonyms/antonyms columns
        const first = (quoted[quoted.length - 3] || '').split(',')[0].trim();
        const key = first.toLowerCase();
        if (first.length < 3 || seen.has(key)) continue;
        seen.add(key);
        out.push(first);
        if (out.length >= limit) break;
    }
    return out;
}

// The word planted in the deep post, and rejected by the stub when it gets
// there. Held out of the pool so it can only come from that one post.
const DEEP_PHRASE = 'Sự vắng mặt';   // -> "absence"
const DEEP_WORD = 'absence';
const DEEP_POST = 28;

const PHRASES = loadPhrases(POSTS * PHRASES_PER_POST + 8)
    .filter((p) => p.toLowerCase() !== DEEP_PHRASE.toLowerCase());

// Each post is a <div role="article"> - the markup content.js recognises as a
// feed item - and posts mount in batches as the sentinel scrolls into view.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Bảng tin</title><style>
  body { margin: 0; font: 16px/1.6 system-ui; }
  [role="article"] { min-height: 70vh; padding: 24px; border-bottom: 1px solid #ddd; }
</style></head><body>
<main id="feed"></main>
<div id="sentinel" style="height:1px"></div>
<script>
  var made = 0;
  var PHRASES = ${JSON.stringify(PHRASES)};
  var PER_POST = ${PHRASES_PER_POST};
  var DEEP_PHRASE = ${JSON.stringify(DEEP_PHRASE)};
  var DEEP_POST = ${DEEP_POST};
  var TOTAL = ${POSTS};
  var cursor = 0;
  function addPosts(n) {
    var feed = document.getElementById('feed');
    for (var i = 0; i < n && made < TOTAL; i++) {
      made++;
      var post = document.createElement('div');
      post.setAttribute('role', 'article');
      post.dataset.postIndex = String(made);
      var h = document.createElement('p');
      h.textContent = 'Bài số ' + made;
      post.appendChild(h);
      // Several distinct phrases per post, so the scan has more candidates
      // than the cap allows and the prune has a real choice to make.
      for (var k = 0; k < PER_POST; k++) {
        var phrase = (made === DEEP_POST && k === 0)
          ? DEEP_PHRASE
          : PHRASES[cursor++ % PHRASES.length];
        var p = document.createElement('p');
        p.textContent = phrase + ' là chủ đề chính của bản tin hôm nay.';
        post.appendChild(p);
      }
      feed.appendChild(post);
    }
    window.__postCount = made;
  }
  addPosts(5);
  new IntersectionObserver(function (es) {
    if (es.some(function (e) { return e.isIntersecting; }) && made < TOTAL) addPosts(5);
  }).observe(document.getElementById('sentinel'));
</script>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/tin-tuc/bang-tin`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-feed-' + Date.now()),
    {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [];
const ok = [];
const check = (cond, label, extra = '') => (cond ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

// Pick the extension's own worker, and wait until its `chrome` API is live -
// launchPersistentContext can hand back a worker that has registered but not
// yet finished booting, and evaluating into it too early throws.
let sw = ctx.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
for (let i = 0; i < 60; i++) {
    const live = await sw.evaluate(() => typeof chrome !== 'undefined' && !!chrome.storage).catch(() => false);
    if (live) break;
    await new Promise(r => setTimeout(r, 250));
}

// Let the worker's own startup dataset load settle before we choose one.
await sw.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise(r => setTimeout(r, 100));
    }
});

// Locked-in, so the per-post allowance is at its most generous and any
// over-replacement shows up rather than being masked by a tight cap.
await sw.evaluate(async (rejectWord) => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', frequency: 80, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: true
    });
    await chrome.storage.local.set({ geminiApiKey: 'fake-key-for-test', vm_ai_model: 'gemini-flash-lite-latest' });
    await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile', 'knownWords', 'savedWords']);
    await self.loadVocabulary('c1');

    self.__rejectWord = rejectWord;
    self.__requests = [];
    if (!self.__realFetch) self.__realFetch = self.fetch;
    const hostOf = (u) => {
        try {
            const raw = typeof u === 'string' ? u : (u && typeof u.url === 'string' ? u.url : String(u));
            return new URL(raw).hostname;
        } catch (e) { return ''; }
    };
    // Everything passes except the word planted deep in the feed, which is
    // rejected with no replacement suggested - so if the deep post really was
    // checked, its swap gets reverted to the original Vietnamese.
    self.fetch = async (u, opts) => {
        if (hostOf(u) !== 'generativelanguage.googleapis.com') return self.__realFetch(u, opts);
        const body = JSON.parse(opts.body);
        const prompt = body.contents[0].parts[0].text;
        self.__requests.push({ at: Date.now(), prompt });
        const rows = prompt.split('\n').filter(l => /^\d+\.\s+english=/.test(l));
        const verdicts = rows.map((line, i) => {
            const w = (line.match(/english="([^"]*)"/) || [, ''])[1].toLowerCase();
            return { i: i + 1, ok: w !== self.__rejectWord };
        });
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(verdicts) }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
}, DEEP_WORD);

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(1000);

// --- 1. Words are replaced, and the badge appears while checking ---
const firstSpans = await page.$$eval('.vocab-master-highlight', els => els.length);
check(firstSpans > 0, 'words replaced on the first screen', `${firstSpans} spans`);

// --- 2. Scroll the feed the way a reader would ---
const requestsBeforeScroll = await sw.evaluate(() => self.__requests.length);

for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(350);
}
await page.waitForTimeout(3000); // let the last quiet-timer batch go out

const postCount = await page.evaluate(() => window.__postCount || 0);
check(postCount >= 25, 'the feed really did keep loading', `${postCount} posts`);

// --- 3. Checking kept up with the scroll ---
const reqs = await sw.evaluate(() => self.__requests.length);
check(reqs > requestsBeforeScroll, 'requests kept coming as the feed grew',
    `${requestsBeforeScroll} before scroll -> ${reqs} after`);
check(reqs <= 40, 'stays under the runaway guard', `${reqs} requests`);

// The load-bearing one. A word planted in post 28 is rejected by the stub, so
// it can only be back in Vietnamese if that post's words were actually sent -
// which is exactly what the old three-requests-per-page cap made impossible.
const deepAsked = await sw.evaluate((w) =>
    self.__requests.some(r => r.prompt.toLowerCase().includes('english="' + w + '"')), DEEP_WORD);
check(deepAsked, `a word ${DEEP_POST} posts down was sent for checking`, DEEP_WORD);

const deepPost = await page.$(`[data-post-index="${DEEP_POST}"]`);
const deepState = deepPost ? await deepPost.evaluate((el, w) => ({
    stillSwapped: !!el.querySelector(`.vocab-master-highlight[data-word="${w}"]`),
    survivors: el.querySelectorAll('.vocab-master-highlight').length,
    text: el.innerText
}), DEEP_WORD) : null;
check(deepState && !deepState.stillSwapped && /vắng mặt/i.test(deepState.text),
    'the rejected deep word was reverted to Vietnamese',
    deepState ? deepState.text.replace(/\s+/g, ' ').trim() : 'post not found');

// The reason for over-provisioning: losing a word to the context check must
// not leave the post with nothing to learn from. Before the scan replaced
// spares, a rejected word in a one-word post meant a post with no vocabulary.
check(deepState && deepState.survivors > 0,
    'the post that lost a word still teaches another one',
    deepState ? `${deepState.survivors} words left` : 'post not found');

// --- 4. Per-post allowance and one-per-session dedupe both hold ---
// Posts are checked, then cut back to the cap. Only posts that have scrolled
// out of view are guaranteed to be pruned - a span still on screen keeps its
// word until the reader moves past it, on purpose.
const OFFSCREEN_CAP = 2;   // locked-in, posts this short
const prunable = await page.$$eval('[role="article"]', (posts) =>
    posts
        .filter((p) => {
            const r = p.getBoundingClientRect();
            return r.bottom < 0 || r.top > window.innerHeight;
        })
        .map((p) => p.querySelectorAll('.vocab-master-highlight').length));
const worst = Math.max(0, ...prunable);
check(prunable.length > 5, 'enough posts scrolled past to judge', `${prunable.length} off-screen`);
check(worst <= OFFSCREEN_CAP, 'posts the reader has passed are cut back to the cap',
    `worst off-screen post had ${worst}`);

// The whole point of the change: over-provisioning means a rejected word does
// not leave the post empty. Every post the reader passed should still have a
// word in it.
const empty = prunable.filter((n) => n === 0).length;
check(empty === 0, 'no post was left with nothing after the check',
    `${empty} of ${prunable.length} posts empty`);

const words = await page.$$eval('.vocab-master-highlight',
    els => els.map(e => (e.dataset.word || '').toLowerCase()));
const duplicates = words.filter((w, i) => words.indexOf(w) !== i);
check(duplicates.length === 0, 'no headword appears twice in the whole session',
    duplicates.length ? [...new Set(duplicates)].join(', ') : `${words.length} unique`);

// --- 5. The status badge showed up, and got out of the way afterwards ---
const badge = await page.evaluate(() => {
    const host = document.getElementById('merid-status-host');
    if (!host || !host.shadowRoot) return { mounted: false };
    const el = host.shadowRoot.querySelector('.badge');
    return { mounted: true, showing: !!el && el.classList.contains('show') };
});
check(badge.mounted, 'status badge mounted while checking ran');
check(badge.mounted && !badge.showing, 'badge hides itself once nothing is pending');

// --- 6. A lone word does not wait for a full batch ---
// Fresh page, a handful of words, then sit still: it must not sit unchecked
// waiting for AI_BATCH_READY_ITEMS that will never arrive. The 20s deadline
// timer is the backstop behind this; the quiet timer usually gets there first.
await sw.evaluate(async () => {
    self.__requests = [];
    await chrome.storage.local.remove(['vm_ai_cache']);
});
const solo = await ctx.newPage();
await solo.goto(url, { waitUntil: 'load' });
await solo.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });

const t0 = Date.now();
let sawRequest = false;
for (let i = 0; i < 46; i++) {           // poll up to ~23s
    if (await sw.evaluate(() => self.__requests.length > 0)) { sawRequest = true; break; }
    await solo.waitForTimeout(500);
}
const waited = Date.now() - t0;
check(sawRequest, 'a quiet page still gets its words checked', `after ${waited}ms`);
check(sawRequest && waited < 21000, 'checked inside the 20s ceiling', `${waited}ms`);

// --- 7. No page errors introduced ---
const real = errors.filter(e => !/favicon|net::ERR/i.test(e));
check(real.length === 0, 'no console/page errors', real.slice(0, 3).join(' | '));

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) {
    console.log('\n=== FAIL ===');
    fail.forEach(l => console.log('  -', l));
}
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
