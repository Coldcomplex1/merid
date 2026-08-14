// Switching the display mode keeps the page it is switching.
//
// Replace, Highlight and Beside are three ways of showing the SAME candidate -
// the English word, the writer's own word, or both - so the scan has nothing to
// redo. It used to be redone anyway: any change to a synced setting reverted
// the page and re-scanned it, which re-picks words, and with the context check
// on it emptied the page out and trickled it back while a second round of
// requests arrived at the same answers for the same words.
//
// The load-bearing check here is IDENTITY, not appearance. Every span is
// branded before the switch; if the scan had run again the spans would be new
// nodes and the brands would be gone. That is the difference between redrawing
// the page and rebuilding it, and it is invisible in a screenshot.
//
// The context check is off: this is about the scan, and a page held back
// waiting for verdicts would tell us nothing about redrawing what is shown.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Vietnamese meanings from dataset-C1.csv, two syllables or more so they are
// matched at all: "phát hiện" -> detection, "thỏa thuận" -> settlement,
// "bồi thường" -> compensation, "hướng dẫn" -> guidance.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bài viết</title></head>
<body>
<main>
<p>Giới chức cho biết họ đã phát hiện dấu hiệu bất thường trong hệ thống liên lạc của sân bay từ đầu tuần trước.</p>
<p>Các bên đã đạt được thỏa thuận về việc chia sẻ dữ liệu radar giữa những trung tâm điều hành bay lớn.</p>
<p>Người phát ngôn nói rằng khoản bồi thường cho các hãng hàng không sẽ được tính theo số chuyến bị hủy.</p>
<p>Cơ quan quản lý sẽ ban hành hướng dẫn mới cho các sân bay trong quý tới, theo nguồn tin thân cận.</p>
<p>Cuộc điều tra kéo dài nhiều tháng và huy động hàng trăm nhân viên kỹ thuật từ ba cơ quan khác nhau.</p>
</main>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/the-gioi/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-display-mode-' + Date.now()),
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
        datasetKey: 'c1', frequency: 100, replacementMode: 'replace',
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
    word: e.dataset.word, original: e.dataset.original, text: e.textContent, brand: e.dataset.e2eBrand || null
})));

const setMode = (mode) => sw.evaluate((m) => chrome.storage.sync.set({ replacementMode: m }), mode);

// --- Replace: the English word stands in for the Vietnamese ---
const replaced = await readSpans();
check(replaced.length > 0, 'words were replaced on the page', `${replaced.length} spans`);
check(replaced.every((s) => s.text === s.word), 'replace mode shows the English word',
    replaced.map((s) => `${s.original}→${s.text}`).join(', '));

// Brand every span. Only a redraw keeps these; a re-scan builds new nodes.
await page.$$eval('.vocab-master-highlight', (els) => els.forEach((e, i) => { e.dataset.e2eBrand = 'b' + i; }));

// --- Highlight: the writer's own words, still marked ---
await setMode('highlight');
const highlighted = await until(async () => {
    const s = await readSpans();
    return s.length && s.every((x) => x.text === x.original) ? s : null;
});
check(!!highlighted, 'highlight mode puts the Vietnamese back',
    highlighted ? highlighted.map((s) => s.text).join(', ') : 'never happened');
check(!!highlighted && highlighted.every((s) => s.brand),
    'the same spans were redrawn, not rebuilt',
    highlighted ? `${highlighted.filter((s) => s.brand).length}/${highlighted.length} kept their brand` : 'n/a');

// --- Beside: both, in one span ---
await setMode('beside');
const beside = await until(async () => {
    const s = await readSpans();
    return s.length && s.every((x) => x.text === `${x.original} (${x.word})`) ? s : null;
});
check(!!beside, 'beside mode shows the Vietnamese and the English',
    beside ? beside[0].text : 'never happened');
check(!!beside && beside.every((s) => s.brand), 'still the same spans', 'brands intact');

// --- Back to replace, and the page is where it started ---
await setMode('replace');
const back = await until(async () => {
    const s = await readSpans();
    return s.length && s.every((x) => x.text === x.word) ? s : null;
});
check(!!back, 'switching back restores the English');
check(!!back && back.every((s) => s.brand), 'and never rebuilt the page once', 'brands intact');

// The whole point: the same words, in the same places, throughout.
const sig = (list) => list.map((s) => `${s.original}→${s.word}`).join('|');
check(!!back && sig(back) === sig(replaced), 'the same words are on the page as before the switching',
    back ? sig(back) : 'n/a');
check(!!highlighted && !!beside &&
    sig(highlighted) === sig(replaced) && sig(beside) === sig(replaced),
    'and the same words in every mode in between');

// A setting that DOES change what is picked must still rebuild - the fast path
// is for the cosmetic pair only, and must not swallow anything else.
await sw.evaluate(async () => { await chrome.storage.sync.set({ frequency: 30 }); });
const rebuilt = await until(async () => {
    const s = await readSpans();
    return s.length && s.every((x) => !x.brand) ? s : null;
}, 20000);
check(!!rebuilt, 'an intensity change still re-scans, brands and all',
    rebuilt ? `${rebuilt.length} fresh spans` : 'brands survived - the fast path is too greedy');

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
