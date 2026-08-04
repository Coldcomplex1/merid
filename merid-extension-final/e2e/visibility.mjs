// Verifies the two surfaces that show what Merid is doing: the marker the AI
// context check leaves on a word it swapped, and the "What Merid has learned
// about you" panel in Settings.
//
// The popup deliberately shows none of this. It went back to its plain layout
// once the AI was known to work - a permanent stats panel is a debugging view,
// not something a reader needs on every visit.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// The upgrade target sits BELOW the fold on purpose: a swap is deliberately
// parked while the span is on screen, so a short page would test the viewport
// guard rather than the marker. The first paragraph stays visible to provide
// an untouched word to compare against.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Thử nghiệm</title></head><body>
<p>Nhiều doanh nghiệp đã cân nhắc kỹ trước khi đưa ra lựa chọn.</p>
<div style="height:2400px"></div>
<p>Bãi bỏ quy định cũ là điều cần thiết.</p>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-vis-' + Date.now()),
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

// Stub Gemini only (the worker also fetch()es the bundled dataset CSVs), and
// have it reject "abolish" with a suggestion that really is in dataset-C1.
await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', frequency: 100, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: true
    });
    await chrome.storage.local.set({ geminiApiKey: 'fake-key', vm_ai_model: 'gemini-flash-lite-latest' });
    await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile', 'knownWords', 'savedWords']);
    await self.loadVocabulary('c1');

    if (!self.__realFetch) self.__realFetch = self.fetch;
    self.fetch = async (u, opts) => {
        if (!String(u).includes('generativelanguage.googleapis.com')) return self.__realFetch(u, opts);
        const prompt = JSON.parse(opts.body).contents[0].parts[0].text;
        const rows = prompt.split('\n').filter(l => /^\d+\.\s+english=/.test(l));
        const out = rows.map((line, idx) => {
            const w = (line.match(/english="([^"]*)"/) || [, ''])[1].toLowerCase();
            return w === 'abolish' ? { i: idx + 1, ok: false, better: 'terminate' } : { i: idx + 1, ok: true };
        });
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }]
        }), { status: 200 });
    };
});

// =====================================================================
// 1. The AI marker on the page and in the learning card
// =====================================================================
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(base + '/kinh-doanh/x', { waitUntil: 'load' });
await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(4000);

const fixed = await page.$$eval('.vocab-ai-fix', els => els.map(e => ({
    word: e.dataset.word, from: e.dataset.aiFrom, text: e.textContent
})));
check(fixed.length > 0, 'the upgraded word carries the AI marker class', JSON.stringify(fixed));
check(fixed[0]?.from === 'abolish' && fixed[0]?.word === 'terminate',
    'the marker remembers what the AI changed', JSON.stringify(fixed[0]));

await page.$eval('.vocab-ai-fix', el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
await page.waitForTimeout(600);
const aifix = await page.$eval('.vm-aifix', el => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
check(/abolish/.test(aifix) && /terminate/.test(aifix),
    'the learning card explains the swap', aifix);

// A word the AI did not touch must NOT claim it did.
const untouched = await page.$$eval('.vocab-master-highlight',
    els => els.filter(e => !e.classList.contains('vocab-ai-fix')).length);
check(untouched > 0, 'untouched words exist to compare against', `${untouched}`);
await page.$$eval('.vocab-master-highlight', els => {
    const plain = els.find(e => !e.classList.contains('vocab-ai-fix'));
    if (plain) plain.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
});
await page.waitForTimeout(500);
check(await page.$('.vm-aifix') === null, 'an untouched word shows no AI row in its card');

// =====================================================================
// 2. The "What Merid has learned about you" options panel
// =====================================================================
// Close the content tab first: while it is open it keeps flushing "shown"
// events, which recreates the profile the moment this test clears it.
check(errors.length === 0, 'no errors on the content page', errors.slice(0, 2).join(' | '));
await page.close();
await new Promise(r => setTimeout(r, 500));

const opts = await ctx.newPage();
const optErrors = [];
opts.on('pageerror', e => optErrors.push(String(e)));

// Empty profile first.
await sw.evaluate(() => chrome.storage.local.remove(['vm_profile']));
await opts.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'load' });
await opts.waitForTimeout(700);
check(await opts.$eval('#profileEmpty', el => !el.hidden) &&
    await opts.$eval('#profileBody', el => el.hidden),
    'a new user sees the empty state, not a wall of zeros');

// Now seed a real profile.
await sw.evaluate(async () => {
    let p = self.VMProfile.createProfile();
    for (let i = 0; i < 10; i++) {
        p = self.VMProfile.recordEvent(p, { word: 'candid', event: 'up', level: 'C1', topic: 'business' });
        p = self.VMProfile.recordEvent(p, { word: 'obfuscate', event: 'down', level: 'C2', topic: 'business' });
    }
    await chrome.storage.local.set({ vm_profile: p });
});
await opts.reload({ waitUntil: 'load' });
await opts.waitForTimeout(700);

const panel = await opts.evaluate(() => ({
    bodyShown: !document.getElementById('profileBody').hidden,
    level: document.getElementById('profileLevel').textContent,
    topics: document.getElementById('profileTopics').textContent,
    words: document.getElementById('profileWords').textContent,
    conf: document.getElementById('profileConfidence').textContent,
    bar: document.getElementById('profileBar').style.width,
    liked: [...document.querySelectorAll('#profileLiked .learn-chip')].map(e => e.textContent),
    disliked: [...document.querySelectorAll('#profileDisliked .learn-chip')].map(e => e.textContent)
}));
check(panel.bodyShown, 'the panel opens once there is something to show');
check(panel.level === 'C1', 'it names the level that suits the reader', panel.level);
check(/business/.test(panel.topics), 'it names what they read', panel.topics);
check(panel.liked.includes('candid'), 'liked words are listed', JSON.stringify(panel.liked));
check(panel.disliked.includes('obfuscate'), 'rejected words are listed', JSON.stringify(panel.disliked));
check(!panel.liked.includes('obfuscate') && !panel.disliked.includes('candid'),
    'the two lists never overlap');
check(/\d+%/.test(panel.conf) && panel.bar !== '', 'confidence is shown as a number and a bar',
    `${panel.conf} | bar=${panel.bar}`);

// Reset must clear the profile and leave the deck alone.
await sw.evaluate(() => chrome.storage.local.set({ savedWords: [{ word: 'keepme' }], knownWords: ['keepme'] }));
opts.on('dialog', d => d.accept());
await opts.click('#profileReset');
await opts.waitForTimeout(900);
const after = await sw.evaluate(async () => {
    const r = await chrome.storage.local.get(['vm_profile', 'savedWords', 'knownWords']);
    return { profile: r.vm_profile || null, saved: (r.savedWords || []).length, known: (r.knownWords || []).length };
});
check(after.profile === null, 'Forget clears the learned profile');
check(after.saved === 1 && after.known === 1, 'Forget leaves the deck untouched',
    `saved=${after.saved} known=${after.known}`);
check(await opts.$eval('#profileEmpty', el => !el.hidden), 'the panel returns to its empty state');

check(optErrors.length === 0, 'no errors on the options page', optErrors.slice(0, 2).join(' | '));

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) { console.log('\n=== FAIL ==='); fail.forEach(l => console.log('  -', l)); }
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
