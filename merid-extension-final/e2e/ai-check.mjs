// Verifies the AI context-check path without a real Gemini key by stubbing
// fetch inside the service worker. Covers the two Phase 0 claims: the verdict
// cache removes repeat API calls, and a verdict now applies to one
// (word, sentence) occurrence instead of every instance of the headword.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// "Bãi bỏ" leads two separate paragraphs -> two spans, two different
// sentences, one headword. That is exactly the case the old code got wrong.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Thử nghiệm</title></head><body>
<p>Bãi bỏ quy định cũ là điều cần thiết.</p>
<p>Bãi bỏ thêm một lần nữa trong năm nay.</p>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/kinh-doanh/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-ai-' + Date.now()),
    {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [], ok = [];
const check = (cond, label, extra = '') => (cond ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

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

// Stub Gemini: record every request, answer "ok" for every item the prompt
// asked about, except any word listed in __rejectWords.
await sw.evaluate(async () => {
    await chrome.storage.sync.set({ datasetKey: 'c1', frequency: 100, replacementMode: 'replace', extensionEnabled: true, aiCheckEnabled: true });
    await chrome.storage.local.set({ geminiApiKey: 'fake-key-for-test', vm_ai_model: 'gemini-flash-lite-latest' });
    await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile']);
    await self.loadVocabulary('c1');

    self.__requests = [];
    self.__rejectWords = [];
    // Only intercept Gemini: the worker also fetch()es the bundled dataset CSVs.
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
        if (routeOf(u).host !== 'generativelanguage.googleapis.com') {
            return self.__realFetch(u, opts);
        }
        const body = JSON.parse(opts.body);
        const prompt = body.contents[0].parts[0].text;
        self.__requests.push({ prompt, schema: body.generationConfig.responseSchema, mime: body.generationConfig.responseMimeType });
        // Re-read the numbered item list the prompt built.
        const rows = prompt.split('\n').filter(l => /^\d+\.\s+english=/.test(l));
        const verdicts = rows.map((line, idx) => {
            const w = (line.match(/english="([^"]*)"/) || [, ''])[1].toLowerCase();
            return { i: idx + 1, ok: !self.__rejectWords.includes(w) };
        });
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(verdicts) }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
});

const items = [
    { word: 'abolish', original: 'bãi bỏ', sentence: 'Bãi bỏ quy định cũ là điều cần thiết.' },
    { word: 'abolish', original: 'bãi bỏ', sentence: 'Bãi bỏ thêm một lần nữa trong năm nay.' },
    { word: 'decisive', original: 'quyết định', sentence: 'Anh ấy quyết định rất nhanh.' }
];

// --- 1. First call: one request, structured output actually requested ---
let r = await sw.evaluate(async (its) => {
    self.__requests = [];
    const res = await self.aiCheckContext(its);
    return { res, reqs: self.__requests };
}, items);
check(r.reqs.length === 1, 'first check issues exactly one API call', `${r.reqs.length}`);
check(r.res.ok && r.res.verdicts.length === 3, 'verdicts returned for every item', JSON.stringify(r.res.verdicts));
check(r.reqs[0]?.mime === 'application/json' && !!r.reqs[0]?.schema,
    'request uses native JSON mode with a responseSchema');
check(r.res.asked === 3 && r.res.cached === 0, 'first call asks for all 3', `asked=${r.res.asked} cached=${r.res.cached}`);

// --- 2. Identical call: fully served from cache, zero API calls ---
r = await sw.evaluate(async (its) => {
    self.__requests = [];
    const res = await self.aiCheckContext(its);
    return { res, reqs: self.__requests };
}, items);
check(r.reqs.length === 0, 'repeat check makes ZERO API calls', `${r.reqs.length}`);
check(r.res.cached === 3 && r.res.asked === 0, 'all 3 served from cache', `cached=${r.res.cached}`);

// --- 3. Same word, NEW sentence: must not reuse the cached verdict ---
r = await sw.evaluate(async () => {
    self.__requests = [];
    const res = await self.aiCheckContext([
        { word: 'abolish', original: 'bãi bỏ', sentence: 'Một câu hoàn toàn khác về bãi bỏ.' }
    ]);
    return { res, reqs: self.__requests };
});
check(r.reqs.length === 1, 'a new sentence for a cached word still asks', `${r.reqs.length}`);

// --- 4. Whitespace/case differences hit the same cache entry ---
r = await sw.evaluate(async () => {
    self.__requests = [];
    const res = await self.aiCheckContext([
        { word: 'Abolish', original: 'bãi bỏ', sentence: '  bãi bỏ QUY ĐỊNH cũ là điều cần thiết.  ' }
    ]);
    return { res, reqs: self.__requests };
});
check(r.reqs.length === 0, 'cache key is case/whitespace insensitive', `${r.reqs.length} calls`);

// --- 5. A dropped item defaults to "keep", never to a silent revert ---
r = await sw.evaluate(async () => {
    await chrome.storage.local.remove(['vm_ai_cache']);
    const realFetch = self.fetch;
    self.fetch = async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ i: 1, ok: false }]) }] } }]
    }), { status: 200 });
    const res = await self.aiCheckContext([
        { word: 'alpha', original: 'a', sentence: 'Cau mot.' },
        { word: 'beta', original: 'b', sentence: 'Cau hai.' }
    ]);
    self.fetch = realFetch;
    return res;
});
check(r.verdicts[0] === 0 && r.verdicts[1] === 1,
    'an unanswered item defaults to keep', JSON.stringify(r.verdicts));

// --- 6. THE FIX: a verdict reverts one occurrence, not the whole headword ---
await sw.evaluate(async () => {
    await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile']);
    self.__rejectWords = ['abolish']; // reject it only where the AI is asked
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });

const before = await page.$$eval('.vocab-master-highlight',
    els => els.filter(e => (e.dataset.word || '').toLowerCase() === 'abolish').length);
check(before === 2, 'both occurrences replaced before the check', `${before}`);

// Wait out the 1.5s debounce plus the round trip.
await page.waitForTimeout(4000);
const after = await page.$$eval('.vocab-master-highlight',
    els => els.filter(e => (e.dataset.word || '').toLowerCase() === 'abolish').length);
check(after === 0, 'both rejected occurrences reverted', `${after} left`);

// Two DIFFERENT sentences => the batch must contain two items, not one.
const sent = await sw.evaluate(() => {
    const last = self.__requests[self.__requests.length - 1];
    return last ? (last.prompt.match(/^\d+\.\s+english="abolish"/gm) || []).length : -1;
});
check(sent === 2, 'the same word in two sentences is judged twice', `${sent} items sent`);

// --- 7. AI verdicts feed the local ranker ---
await page.waitForTimeout(1500);
const prof = await sw.evaluate(async () => (await chrome.storage.local.get('vm_profile')).vm_profile);
check(prof?.words?.abolish?.aiBad >= 1, 'AI rejection recorded as a training label',
    JSON.stringify(prof?.words?.abolish));

check(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) { console.log('\n=== FAIL ==='); fail.forEach(l => console.log('  -', l)); }
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
