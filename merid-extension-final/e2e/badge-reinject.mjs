// The reading badge, after the script that draws it has been run a second time
// on a page that is already carrying one.
//
// This is the extension being reloaded or updated under an open tab. Chrome
// tears down the world the old content script lived in, but not the DOM it
// built: the badge's host div is still sitting in the page when the fresh copy
// of status-badge.js starts, with the old shadow tree still hanging off it. A
// second attachShadow on that host throws NotSupportedError outright, which
// took the whole content script down with it.
//
// Re-running the file in the page reproduces exactly that: the IIFE's host and
// root are closure-locals, so a second evaluation starts from null while the
// host it made the first time is still in the document.
//
// No extension is loaded here on purpose. status-badge.js guards its every
// touch of chrome.storage, so it draws and drags in a plain page, and the crash
// under test is pure DOM.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const SRC = fs.readFileSync(new URL('../status-badge.js', import.meta.url), 'utf8');
const HOST = '#merid-status-host';

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Trang</title></head><body><p>Xin chào.</p></body></html>');
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const fail = [], ok = [];
const check = (c, label, extra = '') => (c ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

await page.goto(base);

// --- first run: the badge as a reader normally gets it ---
await page.addScriptTag({ content: SRC });
await page.evaluate(() => window.MeridStatus.set('checking'));
check(await page.locator(HOST).count() === 1, 'first run mounts one host');

// Keep a handle on the copy of set() the first run published. content.js grabs
// window.MeridStatus once, at its own top level, so this is the object it is
// still holding when the second run replaces it.
await page.evaluate(() => { window.__firstStatus = window.MeridStatus; });

const beforeReinject = errors.length;

// --- the reload: same file, fresh closure, host already in the page ---
await page.addScriptTag({ content: SRC });
// The crash lands on this call and not on the injection above: mount() is lazy,
// so the second attachShadow is only reached once something wants the badge up.
try {
    await page.evaluate(() => window.MeridStatus.set('checking'));
} catch (e) {
    errors.push(String(e));
}
const thrown = errors.slice(beforeReinject);
check(thrown.length === 0, 'the badge mounts again after a reload without throwing', thrown.join(' | '));

const after = await page.evaluate(() => {
    const hosts = document.querySelectorAll('#merid-status-host');
    const root = hosts[0] && hosts[0].shadowRoot;
    const badges = root ? root.querySelectorAll('.badge') : [];
    return {
        hosts: hosts.length,
        badges: badges.length,
        showing: badges.length === 1 && badges[0].classList.contains('show')
    };
});
check(after.hosts === 1, 'the leftover host is reused, not stacked on', `hosts=${after.hosts}`);
check(after.badges === 1, 'the adopted shadow tree holds one badge', `badges=${after.badges}`);
check(after.showing, 'the badge shows after the reload');

// The rebuilt badge answers to the pointer. The old badge's listeners went with
// the world that armed them, so a tree left in place would look alive and drag
// nowhere - the failure this rebuild exists to prevent.
const box = await page.evaluate(() => {
    const el = document.querySelector('#merid-status-host')?.shadowRoot?.querySelector('.badge');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (!box) {
    check(false, 'the rebuilt badge still drags', 'no badge on the page to drag');
} else {
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y - 120, { steps: 8 });
    await page.mouse.up();
    const moved = await page.evaluate((start) => {
        const r = document.querySelector('#merid-status-host').shadowRoot
            .querySelector('.badge').getBoundingClientRect();
        return Math.abs((r.left + r.width / 2) - start.x) > 100;
    }, box);
    check(moved, 'the rebuilt badge still drags');
}

// The first run's set() reaches the badge by querying the shadow root, so
// reusing that root rather than attaching a new one keeps a handle taken before
// the reload pointing at the live badge - content.js reads window.MeridStatus
// once, at its top level, and holds that object for the life of the page.
//
// Driven to 'done' rather than 'checking' because each run of the file tracks
// its own state, and this copy was left on 'checking' by the first run: 'done'
// is the one state set() will re-enter, so it is the one that proves the reach
// rather than the bookkeeping.
check(
    await page.evaluate(() => {
        try { window.__firstStatus.set('done'); } catch (e) { return false; }
        return !!document.querySelector('#merid-status-host')?.shadowRoot
            ?.querySelector('.badge')?.classList.contains('done');
    }),
    'the pre-reload copy of set() still drives the badge'
);

// A host that the page threw away - sites that rewrite <body> do this - is
// replaced rather than clung to.
check(
    await page.evaluate(() => {
        try {
            window.MeridStatus.set('idle');
            document.querySelector('#merid-status-host')?.remove();
            window.MeridStatus.set('checking');
        } catch (e) { return false; }
        const hosts = document.querySelectorAll('#merid-status-host');
        return hosts.length === 1 && !!hosts[0].shadowRoot
            && !!hosts[0].shadowRoot.querySelector('.badge')?.classList.contains('show');
    }),
    'a host removed from the page is rebuilt'
);

check(errors.length === 0, 'no page errors overall', errors.join(' | '));

await browser.close();
server.close();

for (const l of ok) console.log(`PASS  ${l}`);
for (const l of fail) console.log(`FAIL  ${l}`);
console.log(`\n${ok.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
