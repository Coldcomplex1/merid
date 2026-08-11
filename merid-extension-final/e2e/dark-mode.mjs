// The learning card on dark pages.
//
// Two ways a page ends up dark under the reader's eyes. It may be dark itself,
// or the browser may be forcing dark on everything it loads - Cốc Cốc's "Duyệt
// web chế độ tối", Chrome's Auto Dark Theme. The second one is the interesting
// case: it cannot be opted out of (`color-scheme: only light` and
// `forced-color-adjust: none` are both ignored by Chromium), it is invisible to
// getComputedStyle, and left alone it repaints ~97% of the cream card into a
// muddy inversion of itself. content.js detects it through the system colour
// `Canvas` and the card wears its own dark palette instead, which a forcing
// browser leaves standing.
//
// Forced dark is turned on here the way DevTools does it, over CDP, because it
// is a browser-level mode with no page-level switch to flip.
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
    await chrome.storage.local.remove(['vm_profile', 'knownWords', 'savedWords']);
    await self.loadVocabulary('c1');
});

/** Open the card on the first swapped word and report what it is wearing. */
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
    const seen = await p.$eval('.vocab-master-tooltip', el => ({
        scheme: el.dataset.vmScheme,
        // The declared colours, which is what the palette swap changes. What
        // the browser then paints on top is its business, not the page's.
        surface: getComputedStyle(el.querySelector('.vm-card')).backgroundColor,
        title: getComputedStyle(el.querySelector('.vm-title')).color
    }));
    await p.close();
    return seen;
}

/** Perceived brightness of an `rgb(...)` string, 0-1. */
const lum = (c) => {
    const n = String(c).match(/[\d.]+/g).map(Number);
    return (0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2]) / 255;
};

const plain = await openCard(base + '/', false);
check(plain.scheme === 'light', 'an ordinary light page still gets the cream card', plain.surface);
check(lum(plain.surface) > 0.9, 'the card surface is the cream it always was', plain.surface);
check(lum(plain.title) < 0.3, 'and the title on it is navy', plain.title);

const forced = await openCard(base + '/', true);
check(forced.scheme === 'dark', 'a browser forcing dark flips the card to its dark palette', forced.surface);
check(lum(forced.surface) < 0.3, 'the card surface is dark, so forced dark leaves it alone', forced.surface);
check(lum(forced.title) > 0.8, 'and the title on it is cream', forced.title);

const darkPage = await openCard(base + '/dark', false);
check(darkPage.scheme === 'dark', 'a page that is simply dark gets the dark card too', darkPage.surface);

// The detector must not report dark for a light page just because it ran once
// on a dark one: it is re-read on every open, off the page in front of it.
const backToLight = await openCard(base + '/', false);
check(backToLight.scheme === 'light', 'the scheme is re-read per card, not cached from the last page');

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) { console.log('\n=== FAIL ==='); fail.forEach(l => console.log('  -', l)); }
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
