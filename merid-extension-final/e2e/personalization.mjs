// Phase 2 (ranker drives word selection) + Phase 3 (AI suggests a better word,
// swapped in only off-screen) verified against a real Chromium.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// A tall page: the first paragraph is on screen, the last is far below the
// fold, so the viewport guard can be observed doing both of its jobs.
// Top and bottom carry DIFFERENT phrases, and each sits in its own <article>.
// Both matter: a headword gets one appearance per page visit, and a post gets
// a small fixed allowance - share either and the bottom paragraph is left
// untouched, with nothing down there for the viewport guard to act on.
const SPACER = '<div style="height:2400px"></div>';
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Thử nghiệm</title></head><body>
<article><p id="top">Bãi bỏ quy định cũ là điều cần thiết.</p></article>
${SPACER}
<article><p id="bottom">Sự vắng mặt kéo dài đã gây ra nhiều khó khăn.</p></article>
</body></html>`;

// A page with many DISTINCT candidates for the ranker tests. Repeating the
// same lines would be collapsed to a couple of spans by the one-appearance
// rule, leaving nothing to measure. Each phrase maps to its own C1 headword.
const CANDIDATES = [
    'Vô lý', 'Dồi dào', 'Lạm dụng', 'Học viện', 'Tăng tốc', 'Chấp nhận',
    'Dễ tiếp cận', 'Thành tựu', 'Tích lũy', 'Cáo buộc', 'Phá thai',
    'Chịu trách nhiệm', 'Bãi bỏ', 'Thành quả', 'Tích trữ', 'Đẩy nhanh'
];
// Every candidate sits in its own <article>, so each gets its own allowance and
// the page can show many at once - the ranker's effect is on WHICH ones appear.
const DENSE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>T</title></head><body>`
    + CANDIDATES.map(p => `<article><p>${p} là chủ đề của bản tin hôm nay.</p></article>`).join('\n')
    + `</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url.startsWith('/dense') ? DENSE : PAGE);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-p23-' + Date.now()),
    {
        headless: true,
        viewport: { width: 1000, height: 700 },
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [], ok = [];
const check = (c, label, extra = '') => (c ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });

// The worker kicks off its own dataset load at startup (background.js:210).
// Touching storage mid-boot lets that in-flight load finish afterwards and
// overwrite whatever dataset this test chose - which shows up as a confusing
// "SAT" when the test asked for C1. Wait for boot to settle first.
await sw.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise(r => setTimeout(r, 100));
    }
});

const reset = (extra = {}) => sw.evaluate(async (e) => {
    await chrome.storage.sync.set(Object.assign({
        datasetKey: 'c1', focusSize: 0, frequency: 60, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: false
    }, e));
    await chrome.storage.local.remove(['vm_profile', 'vm_ai_cache', 'knownWords', 'savedWords']);
    // Writing datasetKey alone is not enough: the worker caches the parsed
    // vocabulary and rebuilds it only via setDataset/loadVocabulary, which is
    // the path the popup and options page actually use (background.js:735).
    await self.loadVocabulary('c1');
}, extra);

const countSpans = async (url) => {
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(1800);
    const n = await p.$$eval('.vocab-master-highlight', els => els.length);
    const words = await p.$$eval('.vocab-master-highlight', els => [...new Set(els.map(e => e.dataset.word))]);
    const levels = await p.$$eval('.vocab-master-highlight', els => [...new Set(els.map(e => e.dataset.level))]);
    await p.close();
    // Closing the tab fires pagehide -> flushProfileEvents -> a worker write.
    // Let that land before the caller seeds a profile, or the flush arrives
    // afterwards and overwrites the seed with the pre-seed state.
    await new Promise(r => setTimeout(r, 700));
    return { n, words, levels };
};

// =====================================================================
// PHASE 2 - the ranker changes what gets replaced
// =====================================================================

// --- Baseline: a fresh profile must reproduce the old behaviour exactly ---
//
// Word COUNT is no longer the thing to measure. Each post has a small fixed
// allowance now, so the ranker cannot make a page denser or sparser - what it
// changes is WHICH words fill those slots. Every assertion below is about
// identity, not quantity.
await reset();
const baseline = await countSpans(base + '/dense');
check(baseline.words.length > 5, 'baseline page has enough candidates to measure',
    `${baseline.words.length} words: ${baseline.words.join(', ')}`);
check(baseline.levels.length === 1 && baseline.levels[0] === 'C1',
    'the intended dataset is the one actually loaded', JSON.stringify(baseline.levels));

await reset();
const baseline2 = await countSpans(base + '/dense');
check(baseline.n === baseline2.n, 'replacement is deterministic across loads', `${baseline.n} vs ${baseline2.n}`);

// Seed against a fixed word list rather than whatever the baseline produced,
// so the profile clears cold start regardless of how many words the page shows.
const seed = (event, words, times) => sw.evaluate(async ({ event, words, times }) => {
    let p = self.VMProfile.createProfile();
    for (let i = 0; i < times; i++) {
        for (const w of words) p = self.VMProfile.recordEvent(p, { word: w, event, level: 'C1', topic: 'general' });
    }
    await chrome.storage.local.set({ vm_profile: p });
    return { events: p.events, confidence: self.VMProfile.confidence(p) };
}, { event, words, times });

// --- Seed strong dislike for exactly the words the baseline chose ---
let s = await seed('down', baseline.words, 12);
check(s.confidence === 1, 'seeded profile is past cold start', `events=${s.events}`);
const disliked = await countSpans(base + '/dense');
const stillThere = disliked.words.filter(w => baseline.words.includes(w));
check(stillThere.length < baseline.words.length,
    'words the reader keeps rejecting give up their slot',
    `${baseline.words.length} baseline words -> ${stillThere.length} survived`);

// --- Seed strong liking instead: the baseline words must all come back ---
await sw.evaluate(async () => { await chrome.storage.local.remove(['vm_profile']); });
await seed('up', baseline.words, 12);
const liked = await countSpans(base + '/dense');
const kept = liked.words.filter(w => baseline.words.includes(w));
check(kept.length === baseline.words.length, 'liked words keep their slots',
    `${kept.length}/${baseline.words.length}`);
check(kept.length > stillThere.length,
    'liking and disliking move the page in opposite directions',
    `liked ${kept.length} vs disliked ${stillThere.length}`);

// --- The ranker never overrides the user's own "off" switch ---
await reset({ frequency: 0 });
await seed('up', baseline.words, 20);
const off = await countSpans(base + '/dense');
check(off.n === 0, 'frequency 0 stays off no matter how much the ranker likes a word', `${off.n}`);

// =====================================================================
// PHASE 3 - AI suggests a better word; swap is deferred while on screen
// =====================================================================
const installStub = (better) => sw.evaluate(async (b) => {
    await chrome.storage.local.set({ geminiApiKey: 'fake-key', vm_ai_model: 'gemini-flash-lite-latest' });
    self.__better = b;
    self.__stubbed = true;
    await chrome.storage.local.set({ __prompts: [] });
    // Only intercept Gemini. The worker also fetch()es the bundled dataset CSVs
    // via chrome.runtime.getURL, and swallowing those leaves the extension with
    // an empty vocabulary and nothing to replace.
    if (!self.__realFetch) self.__realFetch = self.fetch;
    // Resolve a fetch() argument to its host and path. Matching the hostname
    // exactly, rather than asking whether the URL string *contains* a domain,
    // is both what CodeQL wants and simply more correct - "evil.test/?x=
    // generativelanguage.googleapis.com" contains that domain without being it.
    const routeOf = (u) => {
        try {
            const raw = typeof u === 'string' ? u : (u && typeof u.url === 'string' ? u.url : String(u));
            const parsed = new URL(raw);
            return { host: parsed.hostname, path: parsed.pathname };
        } catch (e) {
            return { host: '', path: '' };
        }
    };
    self.fetch = async (u, opts) => {
        if (routeOf(u).host !== 'generativelanguage.googleapis.com') return self.__realFetch(u, opts);
        const body = JSON.parse(opts.body);
        const prompt = body.contents[0].parts[0].text;
        const cur = (await chrome.storage.local.get('__prompts')).__prompts || [];
        cur.push(prompt);
        await chrome.storage.local.set({ __prompts: cur });
        const rows = prompt.split('\n').filter(l => /^\d+\.\s+english=/.test(l));
        // Reject the two words the fixture plants, each with its own
        // replacement - "better" words are headwords too, so two rejections
        // cannot share one suggestion without colliding with the
        // one-appearance-per-page rule.
        const out = rows.map((line, idx) => {
            const w = (line.match(/english="([^"]*)"/) || [, ''])[1].toLowerCase();
            if (w === 'abolish') return { i: idx + 1, ok: false, better: self.__better };
            if (w === 'absence') return { i: idx + 1, ok: false, better: 'withdrawal' };
            return { i: idx + 1, ok: true };
        });
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }]
        }), { status: 200 });
    };
}, better);

await reset({ aiCheckEnabled: true, frequency: 100 });
await installStub('terminate');   // a real headword in dataset-C1.csv

const stubAlive = () => sw.evaluate(() => self.__stubbed === true);
const prompts = () => sw.evaluate(async () => (await chrome.storage.local.get('__prompts')).__prompts || []);

check(await stubAlive(), 'stub is live before the first AI page load');

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(4000); // AI debounce + round trip

const textOf = (sel) => page.$eval(sel, el => el.innerText.trim());

// #top is on screen the whole time, and the dataset's own pick for it was
// "abolish" - which the model replaces with "terminate". Nothing is put on the
// page until that verdict is in, so the word simply arrives as "terminate":
// the reader is never shown one word being taken back for another.
check((await textOf('#top')).toLowerCase().startsWith('terminate'),
    'the word arrives already checked - no swap happens under the reader', await textOf('#top'));

// #bottom is 2400px down, past the observer's lead - it has not been asked
// about yet, so nothing has been put in front of the reader there at all and
// the paragraph still reads the way its author wrote it.
const bottomBefore = (await textOf('#bottom')).toLowerCase();
check(bottomBefore.includes('vắng mặt') && !bottomBefore.includes('absence'),
    'a word the reader has not reached yet is not shown yet', await textOf('#bottom'));

// Scrolling away and back must not edit a word that is already on the page:
// its verdict was spent before it appeared, and nothing else may move it.
await page.evaluate(() => window.scrollTo(0, 1600));
await page.waitForTimeout(600);
check((await textOf('#top')).toLowerCase().startsWith('terminate'),
    'a word already on the page is never edited again', await textOf('#top'));

// Scrolling toward #bottom brings it inside the lookahead, so it gets checked
// on the way; scrolling back off it lets the upgrade land unseen.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(4000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
check((await textOf('#bottom')).toLowerCase().includes('withdrawal'),
    'scrolling to a word gets it checked and upgraded', await textOf('#bottom'));

// The upgraded word must still be a real dataset entry with a working card.
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.$eval('#top .vocab-master-highlight',
    el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
await page.waitForTimeout(600);
const card = await page.$eval('.vocab-master-tooltip', el => ({
    shown: el.style.display, word: el.dataset.currentWord,
    def: (el.querySelector('.vm-definition') || {}).textContent || ''
})).catch(() => null);
check(card && card.shown === 'block' && card.word.toLowerCase() === 'terminate' && card.def.length > 10,
    'the upgraded word still has a full learning card', JSON.stringify(card));

// --- A suggestion that is not in the dataset must fall back to reverting ---
await page.close(); // stop run 1's background AI batches from touching the cache
await reset({ aiCheckEnabled: true, frequency: 100 });
await installStub('flibbertigibbetous'); // not a headword anywhere
await sw.evaluate(async () => { await chrome.storage.local.remove(['vm_ai_cache']); });
check(await stubAlive(), 'stub is live before the hallucination run');
const p2 = await ctx.newPage();
await p2.goto(base + '/', { waitUntil: 'load' });
await p2.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await p2.waitForTimeout(4000); // 1.5s AI debounce + round trip
// Guard against a vacuous pass: "no invented word on the page" is trivially
// true when nothing was replaced at all.
const p2spans = await p2.$$eval('.vocab-master-highlight', els => els.length);
check(p2spans > 0, 'the hallucination run actually replaced something first', `${p2spans} spans`);
// #top, not #bottom: only what the reader has reached gets checked, and #top
// is the paragraph on screen. An unusable suggestion means there is nothing to
// swap to, so the span is reverted outright rather than parked for later.
const top2 = await p2.$eval('#top', el => el.innerText.trim());
check(top2.toLowerCase().startsWith('bãi bỏ'),
    'a hallucinated suggestion is discarded and the word reverts', top2);
check(await p2.$$eval('.vocab-master-highlight',
    els => els.every(e => e.dataset.word !== 'flibbertigibbetous')),
    'an invented word never reaches the page');
check((await prompts()).length > 0, 'the hallucination run really did call the model');
await p2.close();

// --- The persona line is present only when the profile has history ---
const freshPrompt = (await prompts())[0] || '';
check(freshPrompt.length > 0, 'captured a prompt from a fresh-profile run', `${freshPrompt.length} chars`);
check(!/The reader /.test(freshPrompt), 'a new user\'s prompt carries no persona line');

await seed('up', ['abolish', 'terminate'], 6);
await installStub('terminate');
await sw.evaluate(async () => { await chrome.storage.local.remove(['vm_ai_cache']); });
check(await stubAlive(), 'stub is live before the persona run');
const p3 = await ctx.newPage();
await p3.goto(base + '/', { waitUntil: 'load' });
await p3.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await p3.waitForTimeout(4000); // 1.5s AI debounce + round trip
const seededPrompt = (await prompts())[0] || '';
check(/The reader .*prefers C1-level words/.test(seededPrompt),
    'a returning user\'s prompt carries their persona',
    (seededPrompt.match(/The reader [^\n]*/) || [''])[0].slice(0, 90));
check(seededPrompt.length - freshPrompt.length < 400,
    'the persona block stays small', `+${seededPrompt.length - freshPrompt.length} chars`);
await p3.close();

check(errors.length === 0, 'no page errors on the main run', errors.slice(0, 2).join(' | '));

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) { console.log('\n=== FAIL ==='); fail.forEach(l => console.log('  -', l)); }
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
