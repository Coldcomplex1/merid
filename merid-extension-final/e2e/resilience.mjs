// Covers the two things that decide whether the AI keeps working for a real
// reader on a free key: falling through to another model when one is rate
// limited, and actually USING the collected data - resurfacing saved words for
// review and advising on the dataset level.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Thử nghiệm</title></head><body>
<p>Bãi bỏ quy định cũ là điều cần thiết.</p>
<p>Nhiều doanh nghiệp đã cân nhắc kỹ trước khi đưa ra lựa chọn.</p>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-res-' + Date.now()),
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
const extId = new URL(sw.url()).host;

await sw.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise(r => setTimeout(r, 100));
    }
});

await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', focusSize: 0, frequency: 100, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: true
    });
    await chrome.storage.local.set({ geminiApiKey: 'fake-key' });
    await self.loadVocabulary('c1');
    if (!self.__realFetch) self.__realFetch = self.fetch;
});

/**
 * Install a Gemini stub. `policy` maps a model name to the HTTP status it
 * should answer with; anything unlisted succeeds. Every attempt is recorded so
 * the fallback order can be asserted.
 */
const stub = (policy) => sw.evaluate(async (pol) => {
    self.__calls = [];
    self.__policy = pol;
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
        const route = routeOf(u);
        if (route.host !== 'generativelanguage.googleapis.com') return self.__realFetch(u, opts);
        const model = (route.path.match(/models\/([^:]+):/) || [, '?'])[1];
        self.__calls.push(model);
        const status = self.__policy[model];
        if (status) {
            return new Response(JSON.stringify({ error: { message: 'stubbed ' + status } }),
                { status, headers: { 'Content-Type': 'application/json' } });
        }
        const prompt = JSON.parse(opts.body).contents[0].parts[0].text;
        const rows = prompt.split('\n').filter(l => /^\d+\.\s+english=/.test(l));
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(rows.map((_, i) => ({ i: i + 1, ok: true }))) }] } }]
        }), { status: 200 });
    };
}, policy);

const runCheck = (items) => sw.evaluate(async (its) => {
    await chrome.storage.local.remove(['vm_ai_cache']);
    self.__calls = [];
    const res = await self.aiCheckContext(its);
    return { res, calls: self.__calls };
}, items);

const ITEMS = [{ word: 'abolish', original: 'bãi bỏ', sentence: 'Bãi bỏ quy định cũ.' }];

// =====================================================================
// 1. Rate limiting: same key, different model
// =====================================================================
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_model', 'vm_ai_model_cooldown']));
await stub({ 'gemini-flash-lite-latest': 429 });
let r = await runCheck(ITEMS);
check(r.res.ok, 'a 429 on one model still produces an answer', JSON.stringify(r.res.ok));
check(r.calls.length >= 2, 'it tried another model on the same key', JSON.stringify(r.calls));
check(r.calls[0] === 'gemini-flash-lite-latest' && r.calls[1] !== r.calls[0],
    'the fallback is a different model', JSON.stringify(r.calls));

// The working model is remembered, so the next page does not re-pay the 429.
await stub({ 'gemini-flash-lite-latest': 429 });
r = await runCheck(ITEMS);
check(r.calls.length === 1 && r.calls[0] !== 'gemini-flash-lite-latest',
    'the rate-limited model is skipped while cooling down', JSON.stringify(r.calls));

// 500/503 are Google-side hiccups on that model - also worth another model.
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_model', 'vm_ai_model_cooldown']));
await stub({ 'gemini-flash-lite-latest': 503 });
r = await runCheck(ITEMS);
check(r.res.ok && r.calls.length >= 2, 'an overloaded model falls through too', JSON.stringify(r.calls));

// A bad key must NOT be retried against every model - that is just burning time.
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_model', 'vm_ai_model_cooldown']));
await stub({
    'gemini-flash-lite-latest': 403, 'gemini-flash-latest': 403,
    'gemini-2.5-flash-lite': 403, 'gemini-2.5-flash': 403
});
r = await runCheck(ITEMS);
check(!r.res.ok && r.calls.length === 1,
    'a rejected key stops after one attempt', JSON.stringify(r.calls));
check(r.res.status === 403, 'the real status is reported back', String(r.res.status));

// Every model rate limited: report the failure rather than pretend success.
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_model', 'vm_ai_model_cooldown']));
await stub({
    'gemini-flash-lite-latest': 429, 'gemini-flash-latest': 429,
    'gemini-2.5-flash-lite': 429, 'gemini-2.5-flash': 429
});
r = await runCheck(ITEMS);
check(!r.res.ok && r.res.status === 429, 'all models limited reports 429', String(r.res.status));
check(r.calls.length === 4, 'it exhausted every candidate first', JSON.stringify(r.calls));

// Cooling down must never mean "give up without asking".
r = await runCheck(ITEMS);
check(r.calls.length === 4,
    'with every model cooling down it still tries them all', JSON.stringify(r.calls));

// =====================================================================
// 2. Saved words come back for review
// =====================================================================
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_model', 'vm_ai_model_cooldown']));
await sw.evaluate(async () => {
    await chrome.storage.sync.set({ aiCheckEnabled: false, frequency: 10 });
    await chrome.storage.local.remove(['vm_profile', 'knownWords', 'savedWords', 'vm_ai_cache']);
});

// A page at frequency 10 shows few words; a due review should force one in.
const countWord = async (word) => {
    const p = await ctx.newPage();
    await p.goto(base + '/', { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const n = await p.$$eval('.vocab-master-highlight',
        (els, w) => els.filter(e => (e.dataset.word || '').toLowerCase() === w).length, word);
    const reviews = await p.$$eval('.vocab-review', els => els.length);
    await p.waitForTimeout(4200);   // let the 4s feedback flush fire
    await p.close();
    await new Promise(r => setTimeout(r, 700));
    return { n, reviews };
};

const baseline = await countWord('abolish');
check(baseline.reviews === 0, 'nothing is marked for review before anything is saved',
    `${baseline.reviews}`);

// Save it, then pretend a week passed.
await sw.evaluate(async () => {
    let p = self.VMProfile.createProfile();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    p = self.VMProfile.recordEvent(p, { word: 'abolish', event: 'saved', level: 'C1', now: weekAgo });
    await chrome.storage.local.set({ vm_profile: p });
});
const due = await countWord('abolish');
check(due.n > 0, 'a saved word that has come due is brought back', `${due.n} occurrence(s)`);
check(due.reviews > 0, 'it is marked as a review on the page', `${due.reviews}`);

// Seeing it resets the clock, so it does not nag on the very next page.
const after = await countWord('abolish');
check(after.reviews === 0, 'once reviewed it stops being treated as due', `${after.reviews}`);

const stage = await sw.evaluate(async () =>
    (await chrome.storage.local.get('vm_profile')).vm_profile.words.abolish);
check(stage.stage === 1, 'the review schedule advanced one step', JSON.stringify(stage.stage));
check(stage.saved === 1 && stage.shown >= 1, 'the word kept its history', JSON.stringify(stage));

// =====================================================================
// 3. Level advice - now in Settings, not the popup
// =====================================================================
const opts = await ctx.newPage();
await opts.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'load' });
await opts.waitForTimeout(700);
check(await opts.$eval('#levelTip', el => el.hidden), 'no dataset advice without evidence');

await sw.evaluate(async () => {
    let p = self.VMProfile.createProfile();
    for (let i = 0; i < 16; i++) {
        p = self.VMProfile.recordEvent(p, { word: 'easy' + i, event: 'known', level: 'C1' });
    }
    await chrome.storage.local.set({ vm_profile: p });
});
await opts.reload({ waitUntil: 'load' });
await opts.waitForTimeout(800);
const tip = await opts.$eval('#levelTip', el => ({ hidden: el.hidden, text: el.textContent }));
check(!tip.hidden && /C1/.test(tip.text) && /C2/.test(tip.text),
    'a dataset the reader has outgrown prompts a move up', JSON.stringify(tip));

await opts.click('#levelTip');
await opts.waitForTimeout(900);
const switched = await sw.evaluate(async () =>
    (await chrome.storage.sync.get('datasetKey')).datasetKey);
check(switched === 'c2', 'tapping the advice actually switches the dataset', String(switched));
check(await opts.$eval('#levelTip', el => el.hidden), 'the advice clears once taken');
await opts.close();

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) { console.log('\n=== FAIL ==='); fail.forEach(l => console.log('  -', l)); }
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
