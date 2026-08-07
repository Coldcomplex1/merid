// Guards the two ways Merid stopped putting words where the reader is.
//
//   1. A long article: the allowance is released as the scan walks down the
//      page, so words land through the whole piece. The bug this replaces put
//      every word in the opening paragraphs and left the rest of a 1600-word
//      article completely bare.
//
//   2. A feed whose posts carry NO recognisable markup - no <article>, no
//      role="article", just anonymous divs under a feed wrapper. Those used to
//      collapse into a single container sharing one post's allowance, so the
//      first post took everything and nothing below it was ever touched.
//      Recognising a post by its shape (a block of blocks, among several
//      substantial peers) is what fixes it.
//
// The context check is off here on purpose: this is about where the scan puts
// words, not about which ones survive verification.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** Distinct Vietnamese meanings straight out of the shipped C1 dataset. */
function loadPhrases(limit) {
    const csv = fs.readFileSync(new URL('../dataset-C1.csv', import.meta.url), 'utf8');
    const seen = new Set();
    const out = [];
    for (const line of csv.split('\n').slice(1)) {
        const quoted = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
        if (quoted.length < 3) continue;
        const first = (quoted[quoted.length - 3] || '').split(',')[0].trim();
        if (first.length < 3 || seen.has(first.toLowerCase())) continue;
        seen.add(first.toLowerCase());
        out.push(first);
        if (out.length >= limit) break;
    }
    return out;
}

const PARAGRAPHS = 40;
const POSTS = 24;
const P = loadPhrases(PARAGRAPHS + POSTS * 2 + 10);
const FILLER =
    'Nhiều người dân trong khu vực cho biết họ đã theo dõi sự việc từ rất sớm ' +
    'và mong muốn có thêm thông tin chi tiết hơn nữa từ phía cơ quan chức năng.';

let pi = 0;
const paras = [];
for (let i = 0; i < PARAGRAPHS; i++) paras.push(`<p data-para="${i}">${P[pi++]} ${FILLER}</p>`);
const ARTICLE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bài</title></head>
<body><main class="article-body">${paras.join('\n')}</main></body></html>`;

// Deliberately featureless: the only thing marking a post is that it is a
// div of divs sitting among two dozen like it.
const posts = [];
for (let i = 0; i < POSTS; i++) {
    posts.push(`<div class="x" data-post="${i}" style="min-height:60vh;padding:16px">
      <p>Bài số ${i}</p><p>${P[pi++]} là chủ đề chính hôm nay.</p>
      <p>${P[pi++]} cũng được nhắc tới trong bài.</p></div>`);
}
const FEED = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Feed</title></head>
<body><div role="main"><div data-pagelet="MainFeed">${posts.join('\n')}</div></div></body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url.startsWith('/feed') ? FEED : ARTICLE);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-spread-' + Date.now()),
    {
        headless: true,
        viewport: { width: 1000, height: 700 },
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [];
const ok = [];
const check = (c, label, extra = '') => (c ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

let sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
for (let i = 0; i < 60; i++) {
    if (await sw.evaluate(() => typeof chrome !== 'undefined' && !!chrome.storage).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
}
await sw.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise((r) => setTimeout(r, 100));
    }
});
await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', frequency: 80, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: false
    });
    await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile', 'knownWords', 'savedWords']);
    await self.loadVocabulary('c1');
});

// --- 1. A long article gets words all the way down ---
const a = await ctx.newPage();
const errors = [];
a.on('pageerror', (e) => errors.push(String(e)));
await a.goto(base + '/tin/bai', { waitUntil: 'load' });
await a.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await a.waitForTimeout(1500);

const paraIdx = await a.$$eval('.vocab-master-highlight', (els) =>
    els.map((e) => Number(e.closest('[data-para]').dataset.para)).sort((x, y) => x - y));
check(paraIdx.length >= 3, 'the article got several words', `${paraIdx.length} words`);

const lastThird = PARAGRAPHS * (2 / 3);
check(paraIdx.some((i) => i >= lastThird),
    'the last third of the article is not left bare',
    `paragraphs ${paraIdx.join(', ')} of ${PARAGRAPHS - 1}`);
check(paraIdx[0] <= PARAGRAPHS / 4, 'the opening still gets one', `first at ${paraIdx[0]}`);

// Evenly spread means no two words crammed into neighbouring paragraphs while
// a long stretch elsewhere gets nothing.
const gaps = paraIdx.slice(1).map((v, i) => v - paraIdx[i]);
const widest = Math.max(...gaps);
check(widest <= PARAGRAPHS / 2, 'no huge untouched stretch in the middle',
    `widest gap ${widest} paragraphs`);

// One article is one post: it must not be chopped into per-paragraph budgets,
// which is what made a ten-paragraph article take ten times the allowance.
check(paraIdx.length <= 6, 'the article is treated as ONE post, not one per paragraph',
    `${paraIdx.length} words in ${PARAGRAPHS} paragraphs`);

// --- 2. A feed with no post markup still gets a word per post ---
const f = await ctx.newPage();
f.on('pageerror', (e) => errors.push(String(e)));
await f.goto(base + '/feed', { waitUntil: 'load' });
await f.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await f.waitForTimeout(1500);

const postIdx = await f.$$eval('.vocab-master-highlight', (els) =>
    els.map((e) => Number(e.closest('[data-post]').dataset.post)));
const reached = new Set(postIdx);
check(reached.size > POSTS * 0.7, 'posts are recognised without any markup to go on',
    `${reached.size} of ${POSTS} posts got a word`);
check(reached.has(POSTS - 1), 'the last post is reached, not just the first',
    `highest post touched: ${Math.max(...postIdx)}`);

// And each post still respects its own small allowance.
const perPost = {};
postIdx.forEach((i) => { perPost[i] = (perPost[i] || 0) + 1; });
// Locked-in on a post this short allows three (POST_WORD_CAPS, first row).
const SHORT_POST_CAP = 3;
const worst = Math.max(...Object.values(perPost));
check(worst <= SHORT_POST_CAP, 'each post stays within its own allowance',
    `worst post had ${worst}`);

// --- 3. A feed that reuses vocabulary does not run dry as you scroll ---
//
// Real writing repeats itself: the same handful of words carry most posts.
// While a used word was banned for the whole page visit, the common ones went
// in the first few posts and everything after was left with whatever rare word
// it happened to contain - the feed visibly thinned out the further you went.
const COMMON = P.slice(0, 10);
const TAIL = P.slice(10, 120);
const reuse = [];
for (let i = 0; i < 48; i++) {
    reuse.push(`<div role="article" data-post="${i}" style="min-height:55vh;padding:12px">
      <div><span>Người dùng</span></div>
      <div><p>${COMMON[i % COMMON.length]} là điều nhiều người quan tâm hôm nay.</p>
      <p>Theo tôi ${COMMON[(i * 7 + 3) % COMMON.length]} rất quan trọng,
      còn ${TAIL[i % TAIL.length]} thì cần bàn thêm.</p></div></div>`);
}
server.removeAllListeners('request');
server.on('request', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (req.url.startsWith('/reuse')) {
        res.end(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>R</title></head>
<body><div role="main">${reuse.join('\n')}</div></body></html>`);
    } else res.end(req.url.startsWith('/feed') ? FEED : ARTICLE);
});

const r = await ctx.newPage();
r.on('pageerror', (e) => errors.push(String(e)));
await r.goto(base + '/reuse', { waitUntil: 'load' });
await r.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await r.waitForTimeout(1200);

const reuseIdx = await r.$$eval('.vocab-master-highlight', (els) =>
    els.map((e) => Number(e.closest('[data-post]').dataset.post)));
const firstQuarter = reuseIdx.filter((i) => i < 12).length;
const lastQuarter = reuseIdx.filter((i) => i >= 36).length;
check(lastQuarter > 0, 'the far end of a repetitive feed is not left bare',
    `${firstQuarter} words in posts 0-11, ${lastQuarter} in posts 36-47`);
// A page-wide ban produced a clear downward slope here (roughly 19 words in
// the first quarter against 11 in the last); a cool-down keeps it flat. The
// threshold sits between those two so the slope cannot come back unnoticed.
check(lastQuarter >= firstQuarter * 0.75,
    'the feed does not thin out the further you scroll',
    `first quarter ${firstQuarter} vs last quarter ${lastQuarter}`);

// The per-post rule is exact and survives the page-wide cool-down: whatever
// else repeats, a word may never appear twice inside one post.
const dupInPost = await r.$$eval('[role="article"]', (posts) =>
    posts.filter((p) => {
        const w = [...p.querySelectorAll('.vocab-master-highlight')]
            .map((e) => (e.dataset.word || '').toLowerCase());
        return new Set(w).size !== w.length;
    }).length);
check(dupInPost === 0, 'no word appears twice within one post', `${dupInPost} posts with a repeat`);

const real = errors.filter((e) => !/favicon|net::ERR/i.test(e));
check(real.length === 0, 'no console/page errors', real.slice(0, 3).join(' | '));

console.log('\n=== PASS ===');
ok.forEach((l) => console.log('  +', l));
if (fail.length) {
    console.log('\n=== FAIL ===');
    fail.forEach((l) => console.log('  -', l));
}
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
