// A word standing at the front of a sentence carries the sentence's capital.
//
// matchCase() covers the half that can be read off the Vietnamese: a word
// replacing "Khó" comes back "Difficult". What it cannot see is position. Much
// of an informal feed is written without the opening capital at all, and there
// the English word was swapped in lower case and left the sentence starting on
// a small letter - the same "this was substituted" tell matchCase was written
// to remove.
//
// So this page mixes the three cases in one article: a sentence a writer opened
// in lower case, a sentence opened with the capital already there, and an
// ordinary mid-sentence word that must stay exactly as the dataset stores it.
//
// The context check is off. This is about what the scan renders, and a page
// held back waiting for verdicts would tell us nothing about it.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Vietnamese meanings from dataset-C1.csv, two syllables or more so they are
// matched at all: "phát hiện" -> detection, "bồi thường" -> compensate,
// "thỏa thuận" -> settlement.
//
// The prose is written around those three and nothing else. A post this length
// gets a cap of three words at this intensity, so a stray fourth dataset phrase
// would spend the allowance before the paragraph being checked is reached. It
// also stays under SPREAD_FROM_WORDS (150), which is what makes the whole
// allowance available from the first paragraph rather than released down the
// page.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bài viết</title></head>
<body>
<main>
<p>phát hiện mới của nhóm kỹ sư đã được nói tới nhiều trên báo chí trong nước tuần này.</p>
<p>Nhiều người vẫn chờ một câu trả lời. bồi thường cho hành khách sẽ được tính theo số chuyến bay bị hủy.</p>
<p>Hai bên cuối cùng đã ký một thỏa thuận về việc chia sẻ dữ liệu với nhau.</p>
</main>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/the-gioi/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-sentence-case-' + Date.now()),
    {
        headless: true,
        viewport: { width: 1200, height: 900 },
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [];
const ok = [];
const check = (c, label, extra = '') => (c ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

async function until(read, timeout = 15000, step = 200) {
    const deadline = Date.now() + timeout;
    for (; ;) {
        const value = await read();
        if (value) return value;
        if (Date.now() >= deadline) return null;
        await new Promise((r) => setTimeout(r, step));
    }
}

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
        datasetKey: 'c1', focusSize: 0, frequency: 100, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: false
    });
    await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile', 'knownWords', 'savedWords']);
    await self.loadVocabulary('c1');
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });

// Wait for the count to settle rather than for a fixed moment.
let seen = -1;
await until(async () => {
    const n = await page.$$eval('.vocab-master-highlight', (els) => els.length);
    const settled = n > 0 && n === seen;
    seen = n;
    return settled;
}, 25000, 400);

const readSpans = () => page.$$eval('.vocab-master-highlight', (els) => els.map((e) => ({
    word: e.dataset.word,
    original: e.dataset.original,
    text: e.textContent,
    sentenceStart: e.dataset.sentenceStart === '1'
})));

const setMode = (mode) => sw.evaluate((m) => chrome.storage.sync.set({ replacementMode: m }), mode);

const spans = await readSpans();
const shown = spans.map((s) => `${s.original}→${s.text}`).join(', ');
const find = (vi) => spans.find((s) => (s.original || '').toLowerCase() === vi);

check(spans.length > 0, 'words were replaced on the page', `${spans.length} spans: ${shown}`);

// --- The bug: a sentence the writer opened in lower case ---
const opener = find('phát hiện');
check(!!opener, 'the word opening the article was picked', shown);
check(!!opener && opener.sentenceStart, 'and the scan recorded that it opens a sentence');
check(!!opener && opener.text === 'Detection',
    'a word opening a sentence is capitalised even though the Vietnamese was not',
    opener ? `${opener.original} -> ${opener.text}` : 'no span');

// --- The same thing mid-paragraph, after a full stop ---
const afterStop = find('bồi thường');
check(!!afterStop, 'the word after the full stop was picked', shown);
check(!!afterStop && afterStop.text === 'Compensate',
    'a full stop earlier in the paragraph starts a new sentence too',
    afterStop ? `${afterStop.original} -> ${afterStop.text}` : 'no span');

// --- The control: mid-sentence is left exactly as the dataset stores it ---
const middle = find('thỏa thuận');
check(!!middle, 'the mid-sentence word was picked', shown);
check(!!middle && !middle.sentenceStart, 'and the scan did not call it a sentence start');
check(!!middle && middle.text === 'settlement',
    'a word inside a sentence keeps the dataset\'s lower case',
    middle ? `${middle.original} -> ${middle.text}` : 'no span');

// --- Highlight mode still hands the page back to its writer, capital or not ---
await setMode('highlight');
const highlighted = await until(async () => {
    const s = await readSpans();
    return s.length && s.every((x) => x.text === x.original) ? s : null;
});
check(!!highlighted, 'highlight mode puts the writer\'s own words back untouched',
    highlighted ? highlighted.map((s) => s.text).join(', ') : 'never happened');

// --- Beside mode: the Vietnamese leads, so it keeps its own case ---
await setMode('beside');
const beside = await until(async () => {
    const s = await readSpans();
    return s.length && s.every((x) => x.text.startsWith(`${x.original} (`)) ? s : null;
});
const besideOpener = beside && beside.find((s) => (s.original || '').toLowerCase() === 'phát hiện');
check(!!besideOpener && besideOpener.text === 'phát hiện (detection)',
    'beside mode leaves the sentence to the Vietnamese and does not capitalise the gloss',
    besideOpener ? besideOpener.text : 'never happened');

// --- Back to replace, and the capital comes back with it ---
await setMode('replace');
const back = await until(async () => {
    const s = await readSpans();
    const o = s.find((x) => (x.original || '').toLowerCase() === 'phát hiện');
    return o && o.text === 'Detection' ? s : null;
});
check(!!back, 'switching back through the modes restores the capital');

const real = errors.filter((e) => !/favicon|net::ERR/i.test(e));
check(real.length === 0, 'no console/page errors', real.slice(0, 3).join(' | '));

await page.close();
await ctx.close();
server.close();

console.log('\n=== PASS ===');
ok.forEach((l) => console.log('  + ' + l));
if (fail.length) {
    console.log('\n=== FAIL ===');
    fail.forEach((l) => console.log('  - ' + l));
}
console.log(`\n${ok.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
