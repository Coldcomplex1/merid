// The learning card's palette, which is the reader's choice and nothing else.
//
// `cardTheme` in chrome.storage.sync picks it, the popup header button writes
// it, and light is what a fresh install gets. The card deliberately does NOT
// follow the page: not a dark page, and not a browser forcing dark on the
// whole web (Cốc Cốc's "Duyệt web chế độ tối", Chrome's Auto Dark Theme). The
// dark palette is what such a browser leaves standing - a cream card there
// comes back inverted - but reaching for it is the reader's call, so these
// checks pin the light default in exactly the places it would be tempting to
// override.
//
// Forced dark is turned on the way DevTools does it, over CDP: it is a
// browser-level mode with no page-level switch to flip.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const page = (bodyBg) => `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Thử nghiệm</title><style>body{background:${bodyBg};font-family:sans-serif}</style></head>
<body><article><p id="p">Bãi bỏ quy định cũ là điều cần thiết cho doanh nghiệp.</p></article>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page(req.url === '/dark' ? '#0d1117' : '#ffffff'));
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-dark-' + Date.now()),
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

// Wait for the worker's own dataset load to settle before touching storage,
// or it finishes afterwards and overwrites the dataset this test chose.
await sw.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise(r => setTimeout(r, 100));
    }
});
await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', frequency: 100, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: false
    });
    // Left unset on purpose: a fresh install has no cardTheme, and the first
    // checks below are about what that install gets.
    await chrome.storage.sync.remove('cardTheme');
    await chrome.storage.local.remove(['vm_profile', 'knownWords', 'savedWords']);
    await self.loadVocabulary('c1');
});

const setTheme = (v) => sw.evaluate((theme) => chrome.storage.sync.set({ cardTheme: theme }), v);

/** What the card is wearing, read off the declared colours - which is what the
 *  palette controls. What a forcing browser paints on top is its own business. */
const readCard = (p) => p.$eval('.vocab-master-tooltip', el => ({
    scheme: el.dataset.vmScheme,
    surface: getComputedStyle(el.querySelector('.vm-card')).backgroundColor,
    title: getComputedStyle(el.querySelector('.vm-title')).color
}));

/** Open a page, wait for a swap, hover it, and hand back the live page. */
async function openCard(url, forcedDark) {
    const p = await ctx.newPage();
    if (forcedDark) {
        const cdp = await ctx.newCDPSession(p);
        await cdp.send('Emulation.setAutoDarkModeOverride', { enabled: true });
    }
    await p.goto(url);
    await p.waitForSelector('.vocab-master-highlight', { timeout: 10000 });
    await p.hover('.vocab-master-highlight');
    await p.waitForSelector('.vocab-master-tooltip .vm-card', { state: 'visible', timeout: 5000 });
    return p;
}

async function cardOn(url, forcedDark) {
    const p = await openCard(url, forcedDark);
    const seen = await readCard(p);
    await p.close();
    return seen;
}

/** Perceived brightness of an `rgb(...)` string, 0-1. */
const lum = (c) => {
    const n = String(c).match(/[\d.]+/g).map(Number);
    return (0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2]) / 255;
};

const fresh = await cardOn(base + '/', false);
check(fresh.scheme === 'light', 'a fresh install gets the light card', fresh.surface);
check(lum(fresh.surface) > 0.9, 'the card surface is the cream it always was', fresh.surface);
check(lum(fresh.title) < 0.3, 'and the title on it is navy', fresh.title);

const onDarkPage = await cardOn(base + '/dark', false);
check(onDarkPage.scheme === 'light', 'a dark page does not change it - the reader has not asked for dark');

const underForcedDark = await cardOn(base + '/', true);
check(underForcedDark.scheme === 'light', 'nor does a browser forcing dark on every page');

await setTheme('dark');
const chosenDark = await cardOn(base + '/', false);
check(chosenDark.scheme === 'dark', 'choosing dark gives the dark card', chosenDark.surface);
check(lum(chosenDark.surface) < 0.3, 'its surface is dark, so forced dark would leave it alone', chosenDark.surface);
check(lum(chosenDark.title) > 0.8, 'and the title on it is cream', chosenDark.title);

const stillDark = await cardOn(base + '/', true);
check(stillDark.scheme === 'dark', 'and it stays that way whatever the page or the browser is doing');

await setTheme('light');
const backToLight = await cardOn(base + '/', false);
check(backToLight.scheme === 'light', 'switching back to light takes effect too');

// Changing the palette must not re-scan: every other sync change reverts the
// page and picks words afresh, which would rewrite the paragraph being read.
const live = await openCard(base + '/', false);
const before = await live.$$eval('.vocab-master-highlight', els => els.map(e => e.textContent));
await setTheme('dark');
await live.waitForTimeout(600);
const after = await live.$$eval('.vocab-master-highlight', els => els.map(e => e.textContent));
check(JSON.stringify(before) === JSON.stringify(after),
    'flipping the palette leaves the swapped words alone', `${before.length} spans`);
check((await readCard(live)).scheme === 'dark', 'while the open card follows the new palette at once');
await live.close();

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) { console.log('\n=== FAIL ==='); fail.forEach(l => console.log('  -', l)); }
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
