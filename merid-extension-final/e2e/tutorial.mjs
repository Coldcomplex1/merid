// The tutorial poster, driven the way a reader drives it.
//
// "Hướng dẫn" in the popup cannot show the sheet itself - the panel is a few
// hundred pixels wide and closes as soon as focus leaves it - so the poster is
// put up over the page by the content script. What is worth pinning is that it
// opens at all, that it fits the window rather than arriving at some arbitrary
// size, that every way out of it works, and that the zoom actually changes the
// rendered sheet rather than only a label.
//
// The overlay lives in an open shadow root, so everything below reaches it
// through .shadowRoot - which is also the check that it is isolated from the
// page in the first place.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// A page with its own aggressive CSS: the overlay must not be reachable by any
// of it. If the shadow root ever stopped isolating, these rules would wreck the
// sheet and the size assertions below would drift.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Trang thử</title>
<style>
  * { box-sizing: content-box !important; font-size: 40px !important; color: red !important; }
  div { position: static !important; opacity: 0.2 !important; transform: rotate(3deg) !important; }
  img { width: 12px !important; height: 12px !important; display: none !important; }
  button { all: revert; padding: 40px !important; }
</style></head>
<body>
<p>Người dân trong khu vực cho biết họ đã quen với nhịp sống mới trong tuần qua.</p>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/tin-tuc/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-tutorial-' + Date.now()),
    {
        headless: true,
        viewport: { width: 1280, height: 900 },
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
const extId = new URL(sw.url()).host;

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });

// Drive the path that ships rather than calling the overlay directly: this is
// the exact chrome.tabs.sendMessage call popup.js makes, with the same payload,
// sent from the worker because a content script cannot message itself.
// The worker cannot tell which tab is the one under test - `tabs.url` is
// redacted without the activeTab grant a real popup click carries - so offer
// the message to each in turn and keep the reply that comes back. Only a tab
// running the content script answers at all, which is the thing being checked.
async function pressTutorial() {
    return sw.evaluate(async () => {
        for (const tab of await chrome.tabs.query({})) {
            const res = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { action: 'showTutorial' }, (r) => {
                    resolve(chrome.runtime.lastError ? null : r);
                });
            });
            if (res && res.ok) return res;
        }
        return { ok: false };
    });
}

const host = '#merid-tutorial-host';
const shadow = (sel) => page.evaluate(([h, s]) => {
    const el = document.querySelector(h);
    if (!el || !el.shadowRoot) return null;
    return !!el.shadowRoot.querySelector(s);
}, [host, sel]);

// --- 1. It opens, on a page whose CSS would ruin anything it could reach ---
const answer = await pressTutorial();
check(answer && answer.ok === true, 'the content script accepts the popup\'s request', JSON.stringify(answer));

const appeared = await until(async () => await shadow('.backdrop'));
check(!!appeared, 'the poster opens over the page');
if (!appeared) {
    // Everything below measures the overlay; without one there is nothing to
    // measure, and a stack trace would say less than this line does.
    console.log('\n=== FAIL ===');
    fail.forEach((l) => console.log('  - ' + l));
    console.log(`\n${ok.length} passed, ${fail.length} failed`);
    await ctx.close(); server.close();
    process.exit(1);
}
check(await shadow('img'), 'the sheet itself is in the overlay');
check(await shadow('.close'), 'there is a close button');

// --- 2. The image really loaded, out of the extension, at its full size ---
const shot = await until(async () => {
    const r = await page.evaluate((h) => {
        const im = document.querySelector(h)?.shadowRoot?.querySelector('img');
        if (!im) return null;
        return { complete: im.complete, w: im.naturalWidth, h: im.naturalHeight, src: im.src };
    }, host);
    return r && r.complete && r.w > 0 ? r : null;
});
check(!!shot, 'the poster image loaded');
check(shot && shot.w === 2480 && shot.h === 3508, 'it is the full-resolution sheet',
    shot ? `${shot.w}x${shot.h}` : 'n/a');
check(!!shot && shot.src.startsWith('chrome-extension://'),
    'it is served from the extension, not the page', shot ? shot.src.slice(0, 24) + '...' : 'n/a');

// --- 3. It arrives fitted: whole sheet visible, inside the stage ---
const fitted = await page.evaluate((h) => {
    const root = document.querySelector(h).shadowRoot;
    const im = root.querySelector('img').getBoundingClientRect();
    const st = root.querySelector('.stage').getBoundingClientRect();
    return { iw: im.width, ih: im.height, sw: st.width, sh: st.height, label: root.querySelector('.zoom-label').textContent };
}, host);
check(fitted.ih <= fitted.sh + 1 && fitted.iw <= fitted.sw + 1, 'the whole sheet fits the window on open',
    `sheet ${Math.round(fitted.iw)}x${Math.round(fitted.ih)} in stage ${Math.round(fitted.sw)}x${Math.round(fitted.sh)}`);
check(fitted.ih > fitted.sh * 0.85, 'and fills the space it has rather than sitting tiny',
    `${Math.round(fitted.ih)} of ${Math.round(fitted.sh)}`);
check(fitted.label === '100%', 'fitted reads as 100%', fitted.label);

// --- 4. Zoom changes the rendered sheet, not just the readout ---
const clickShadow = (sel) => page.evaluate(([h, s]) => {
    document.querySelector(h).shadowRoot.querySelector(s).click();
}, [host, sel]);
const sheetSize = () => page.evaluate((h) => {
    const r = document.querySelector(h).shadowRoot;
    const b = r.querySelector('img').getBoundingClientRect();
    return { w: b.width, h: b.height, label: r.querySelector('.zoom-label').textContent };
}, host);

await clickShadow('.zoom-in');
const zoomed = await sheetSize();
check(zoomed.w > fitted.iw * 1.2, 'zoom in enlarges the sheet',
    `${Math.round(fitted.iw)} -> ${Math.round(zoomed.w)} (${zoomed.label})`);

await clickShadow('.zoom-out');
const back = await sheetSize();
check(Math.abs(back.w - fitted.iw) < 2, 'zoom out returns it to the fitted size',
    `${Math.round(back.w)} vs ${Math.round(fitted.iw)} (${back.label})`);

// Zooming out past the fitted size is refused - there is no reason to shrink a
// sheet below the point where all of it is already on screen.
await clickShadow('.zoom-out');
const floor = await sheetSize();
check(Math.abs(floor.w - fitted.iw) < 2 && floor.label === '100%',
    'it will not shrink below fitted', `${Math.round(floor.w)} (${floor.label})`);

// --- 5. The page underneath cannot touch it ---
// The fixture forces `position:static`, `opacity:0.2` and `rotate(3deg)` on
// every div, and hides every img. None of it may land. Opacity is read as "not
// dimmed" rather than exactly 1, since the overlay fades itself in and this can
// catch the tail of that.
const isolated = await page.evaluate((h) => {
    const root = document.querySelector(h).shadowRoot;
    const st = getComputedStyle(root.querySelector('.backdrop'));
    const im = getComputedStyle(root.querySelector('img'));
    return {
        pos: st.position, opacity: parseFloat(st.opacity), transform: st.transform,
        display: im.display, imgW: im.width
    };
}, host);
check(isolated.pos === 'fixed' && isolated.opacity > 0.5 && isolated.transform === 'none',
    "the page's div rules do not reach the backdrop", JSON.stringify(isolated));
check(isolated.display !== 'none' && parseFloat(isolated.imgW) > 100,
    "the page's img rules do not reach the sheet", `display=${isolated.display} width=${isolated.imgW}`);

// --- 6. Every way out ---
await clickShadow('.close');
check(await until(async () => (await shadow('.backdrop')) === false ||
    (await page.$(host)) === null, 5000) !== null, 'the close button closes it');

await pressTutorial();
await until(async () => await shadow('.backdrop'));
// A press that starts and ends on the backdrop, away from the sheet.
await page.mouse.click(20, 450);
check(await until(async () => (await page.$(host)) === null, 5000) !== null,
    'clicking outside the sheet closes it');

await pressTutorial();
await until(async () => await shadow('.backdrop'));
await page.keyboard.press('Escape');
check(await until(async () => (await page.$(host)) === null, 5000) !== null, 'Escape closes it');

// --- 7. A drag on the backdrop that ends outside is not a close ---
await pressTutorial();
await until(async () => await shadow('.backdrop'));
await clickShadow('.zoom-in');
const box = await page.evaluate((h) => {
    const b = document.querySelector(h).shadowRoot.querySelector('.stage').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}, host);
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.mouse.move(20, box.y, { steps: 8 });   // drag off the sheet, onto the backdrop
await page.mouse.up();
check((await page.$(host)) !== null, 'a drag that ends on the backdrop does not close it');

// --- 8. The fallback page stands on its own ---
const tab = await ctx.newPage();
await tab.goto(`chrome-extension://${extId}/tutorial.html`, { waitUntil: 'load' });
const standalone = await until(async () => tab.evaluate((h) => {
    const r = document.querySelector(h)?.shadowRoot;
    if (!r) return null;
    const im = r.querySelector('img');
    return im && im.complete && im.naturalWidth > 0
        ? { close: !!r.querySelector('.close'), zoom: !!r.querySelector('.zoom-in') } : null;
}, host));
check(!!standalone, 'the fallback page renders the poster on its own');
check(standalone && standalone.zoom === true, 'the fallback page can zoom too');
// No close button there: the tab's own is the one that applies.
check(standalone && standalone.close === false, 'and offers no close button, being a tab of its own');
await tab.close();

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
