// The first-run wizard, driven the way a reader drives it.
//
// Two ways in, and both are checked here because they fail differently: over a
// page, where the wizard is an overlay in a shadow root on someone else's DOM,
// and as onboarding.html, which is what background.js opens on install because
// the tab in front of a new reader runs no content script.
//
// What is worth pinning is not that four panels exist. It is that the answers
// survive the walk back and forth, and that finishing actually configures the
// extension - which means two different roads: `replacementMode` is a plain
// storage write, but `datasetKey` has to go through the setDataset message or
// the worker keeps serving the vocabulary it already parsed. A wizard that
// wrote the key and left the old words loaded would look completely correct
// from the outside, so the last check reads the worker's own vocabulary.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// A page with its own aggressive CSS: the wizard must not be reachable by any
// of it. If the shadow root ever stopped isolating, these rules would wreck the
// sheet and the size assertion below would drift.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Trang thử</title>
<style>
  * { box-sizing: content-box !important; font-size: 44px !important; color: red !important; }
  div { position: static !important; opacity: 0.2 !important; transform: rotate(3deg) !important; }
  button { all: revert; padding: 40px !important; background: lime !important; }
  section { display: block !important; }
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
    path.join(process.env.TMPDIR || '/tmp', 'merid-onboarding-' + Date.now()),
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

// Start from settings that are NOT what the test will pick, so every assertion
// at the end is a change the wizard made rather than a default it agreed with.
await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', replacementMode: 'highlight',
        extensionEnabled: true, aiCheckEnabled: false
    });
    await chrome.storage.sync.remove('onboardingDone');
    await self.loadVocabulary('c1');
});

const page = await ctx.newPage();
const errors = [];
// A 404 for a mode picture is the expected state until the artwork is dropped
// into onboarding/, and is the very thing the drawn fallback exists to absorb -
// the card is correct either way, which the checks below prove. Anything else
// reaching the console, and every thrown error, still counts.
const expected = (text) => /ERR_FILE_NOT_FOUND/.test(text);
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
    if (m.type() === 'error' && !expected(m.text())) errors.push(m.text());
});
await page.goto(url, { waitUntil: 'load' });

// Drive the path that ships rather than calling the overlay directly: this is
// the exact chrome.tabs.sendMessage call popup.js makes, with the same payload,
// sent from the worker because a content script cannot message itself.
async function pressOnboarding() {
    return sw.evaluate(async () => {
        for (const tab of await chrome.tabs.query({})) {
            const res = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { action: 'showOnboarding' }, (r) => {
                    resolve(chrome.runtime.lastError ? null : r);
                });
            });
            if (res && res.ok) return res;
        }
        return { ok: false };
    });
}

const HOST = '#merid-onboarding-host';

/** Read something out of the wizard's shadow root, on any page. */
const probe = (p, fn, arg) => p.evaluate(([h, src, a]) => {
    const el = document.querySelector(h);
    if (!el || !el.shadowRoot) return null;
    // eslint-disable-next-line no-new-func
    return new Function('root', 'arg', 'return (' + src + ')(root, arg)')(el.shadowRoot, a);
}, [HOST, fn.toString(), arg]);

const clickIn = (p, sel) => probe(p, (root, s) => {
    const n = root.querySelector(s);
    if (!n) return false;
    n.click();
    return true;
}, sel);

// =====================================================================
// 1. It opens over a page whose CSS would ruin anything it could reach
// =====================================================================
const answer = await pressOnboarding();
check(answer && answer.ok === true, 'the content script accepts the popup\'s request', JSON.stringify(answer));

const appeared = await until(async () => await probe(page, (root) => !!root.querySelector('.backdrop')));
check(!!appeared, 'the wizard opens over the page');
if (!appeared) {
    console.log('\n=== FAIL ===');
    fail.forEach((l) => console.log('  - ' + l));
    console.log(`\n${ok.length} passed, ${fail.length} failed`);
    await ctx.close(); server.close();
    process.exit(1);
}

check(await probe(page, (root) => root.querySelectorAll('.step').length === 4),
    'there are four steps');
check(await probe(page, (root) => root.querySelectorAll('.step')[0].classList.contains('here')),
    'it starts on step one');
check(await probe(page, (root) => root.querySelector('.rail span').style.width === '25%'),
    'the progress rail starts a quarter filled');

// The page sets `button { padding: 40px }` and a 44px font on everything. If any
// of it reached in, the sheet would not still be the width its own CSS asks for.
const sheet = await probe(page, (root) => {
    const r = root.querySelector('.sheet').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
});
check(sheet && sheet.w === 720, 'the sheet keeps its own width through the page\'s CSS',
    sheet ? sheet.w + 'px' : 'n/a');
check(sheet && sheet.h > 200 && sheet.h <= 700, 'and its own height', sheet ? sheet.h + 'px' : 'n/a');

// =====================================================================
// 2. Step 2 - the dataset cards
// =====================================================================
await clickIn(page, '.btn-next');
check(await probe(page, (root) => root.querySelectorAll('.step')[1].classList.contains('here')),
    'Next moves to the dataset step');

const levels = await probe(page, (root) =>
    [...root.querySelectorAll('.levels .pick')].map((b) => b.dataset.value));
check(Array.isArray(levels) && levels.length === 4, 'four datasets are offered',
    JSON.stringify(levels));
check(Array.isArray(levels) && ['sat', 'c1', 'c2', 'all'].every((k) => levels.includes(k)),
    'they are SAT, C1, C2 and All', JSON.stringify(levels));
check(await probe(page, (root) =>
    root.querySelector('.levels .pick[data-value="c1"]').classList.contains('on')),
    'the current dataset starts selected');

await clickIn(page, '.levels .pick[data-value="c2"]');
const levelPicked = await probe(page, (root) => ({
    c2: root.querySelector('.levels .pick[data-value="c2"]').classList.contains('on'),
    c1: root.querySelector('.levels .pick[data-value="c1"]').classList.contains('on'),
    aria: root.querySelector('.levels .pick[data-value="c2"]').getAttribute('aria-checked')
}));
check(levelPicked && levelPicked.c2 && !levelPicked.c1,
    'clicking a dataset selects it and clears the other', JSON.stringify(levelPicked));
check(levelPicked && levelPicked.aria === 'true', 'and says so to a screen reader');

// =====================================================================
// 3. Step 3 - the display modes
// =====================================================================
await clickIn(page, '.btn-next');
check(await probe(page, (root) => root.querySelectorAll('.step')[2].classList.contains('here')),
    'Next moves to the display-mode step');

const modes = await probe(page, (root) =>
    [...root.querySelectorAll('.modes .pick')].map((b) => b.dataset.value));
check(JSON.stringify(modes) === JSON.stringify(['replace', 'highlight', 'beside']),
    'the three modes are offered in order', JSON.stringify(modes));

// Every card must show one of two things and never nothing: the picture, or
// the mode drawn in its place. Which one is right depends on whether the
// artwork has been added, so ask the extension rather than assuming - this way
// the check keeps its meaning both before the pictures land and after.
const hasArt = await sw.evaluate(() =>
    fetch(chrome.runtime.getURL('onboarding/mode-replace.webp'))
        .then((r) => r.ok).catch(() => false));

const cards = await until(async () => {
    const r = await probe(page, (root) =>
        [...root.querySelectorAll('.modes .pick')].map((c) => {
            const img = c.querySelector('.plate img');
            const demo = c.querySelector('.demo');
            return {
                shot: img ? img.naturalWidth > 0 : false,
                drawn: demo ? demo.textContent.replace(/\s+/g, ' ').trim() : null
            };
        }));
    // Pictures arrive asynchronously; settle before judging.
    return r && r.every((c) => c.shot || c.drawn) ? r : null;
});

check(cards && cards.every((c) => c.shot || c.drawn),
    'every mode card shows either its picture or the mode drawn in its place');

if (hasArt) {
    check(cards && cards.every((c) => c.shot),
        'with the artwork present, all three show their picture',
        cards ? JSON.stringify(cards.map((c) => c.shot)) : 'n/a');
} else {
    const drawn = cards ? cards.map((c) => c.drawn) : null;
    check(drawn && drawn.every((t) => t && t.length > 20),
        'with no artwork, each card draws itself instead');
    check(drawn && /collaborate/.test(drawn[0]) && !/hợp tác/.test(drawn[0]),
        'Replace shows the English in place of the Vietnamese', drawn ? drawn[0] : 'n/a');
    check(drawn && /hợp tác/.test(drawn[1]) && !/collaborate/.test(drawn[1]),
        'Highlight keeps the Vietnamese', drawn ? drawn[1] : 'n/a');
    check(drawn && /hợp tác/.test(drawn[2]) && /collaborate/.test(drawn[2]),
        'Beside shows both', drawn ? drawn[2] : 'n/a');
}

await clickIn(page, '.modes .pick[data-value="beside"]');
check(await probe(page, (root) =>
    root.querySelector('.modes .pick[data-value="beside"]').classList.contains('on')),
    'clicking a mode holds it selected');

// =====================================================================
// 4. Back and forth keeps the answers
// =====================================================================
await clickIn(page, '.btn-back');
check(await probe(page, (root) =>
    root.querySelectorAll('.step')[1].classList.contains('here') &&
    root.querySelector('.levels .pick[data-value="c2"]').classList.contains('on')),
    'Back returns to the dataset step with the answer still on it');

await clickIn(page, '.btn-next');
check(await probe(page, (root) =>
    root.querySelector('.modes .pick[data-value="beside"]').classList.contains('on')),
    'and forward again with the mode still on it');

await clickIn(page, '.btn-next');
const summary = await probe(page, (root) => ({
    here: root.querySelectorAll('.step')[3].classList.contains('here'),
    level: root.querySelector('.sum-level').textContent,
    mode: root.querySelector('.sum-mode').textContent
}));
check(summary && summary.here, 'the last step is reached');
check(await probe(page, (root) => root.querySelector('.rail span').style.width === '100%'),
    'and the rail has filled');
check(summary && summary.level === 'C2', 'it reports the chosen dataset', summary ? summary.level : 'n/a');
check(summary && /Beside/.test(summary.mode), 'and the chosen mode', summary ? summary.mode : 'n/a');

// =====================================================================
// 5. Finishing configures the extension - both roads
// =====================================================================
await clickIn(page, '.btn-next');

const gone = await until(async () => (await page.$(HOST)) === null);
check(!!gone, 'finishing closes the wizard');

const saved = await sw.evaluate(() => new Promise((resolve) => {
    chrome.storage.sync.get(['datasetKey', 'replacementMode', 'onboardingDone'], resolve);
}));
check(saved && saved.datasetKey === 'c2', 'the dataset is saved under the key the extension reads',
    JSON.stringify(saved));
check(saved && saved.replacementMode === 'beside', 'so is the display mode', JSON.stringify(saved));
check(saved && saved.onboardingDone === true, 'and the wizard marks itself done');

// The one that a storage-only write would pass and a real user would fail: the
// worker must have rebuilt its vocabulary, not just recorded a preference.
const loaded = await until(async () => sw.evaluate(() => {
    try {
        if (!vocabulary || !vocabulary.length) return null;
        return { n: vocabulary.length, tags: [...new Set(vocabulary.map((e) => e.dataset))] };
    } catch (e) { return null; }
}));
check(loaded && loaded.tags.length === 1 && loaded.tags[0] === 'C2',
    'the worker actually loaded the C2 vocabulary', loaded ? JSON.stringify(loaded.tags) : 'n/a');

// =====================================================================
// 6. Escape closes without saving over the answers
// =====================================================================
await pressOnboarding();
await until(async () => await probe(page, (root) => !!root.querySelector('.backdrop')));
await page.keyboard.press('Escape');
check(!!(await until(async () => (await page.$(HOST)) === null)), 'Escape closes the wizard');

const afterEscape = await sw.evaluate(() => new Promise((resolve) => {
    chrome.storage.sync.get(['datasetKey', 'replacementMode'], resolve);
}));
check(afterEscape && afterEscape.datasetKey === 'c2' && afterEscape.replacementMode === 'beside',
    'leaving without finishing changes nothing', JSON.stringify(afterEscape));

// =====================================================================
// 7. The standalone page - what a fresh install actually opens
// =====================================================================
const own = await ctx.newPage();
const ownErrors = [];
own.on('pageerror', (e) => ownErrors.push(String(e)));
own.on('console', (m) => {
    if (m.type() === 'error' && !expected(m.text())) ownErrors.push(m.text());
});
await own.goto(`chrome-extension://${extId}/onboarding.html`, { waitUntil: 'load' });

const standalone = await until(async () => await probe(own, (root) => {
    const b = root.querySelector('.backdrop');
    if (!b) return null;
    return {
        standalone: b.classList.contains('standalone'),
        steps: root.querySelectorAll('.step').length,
        levels: root.querySelectorAll('.levels .pick').length
    };
}));
check(!!standalone, 'onboarding.html stands the wizard up on its own');
check(standalone && standalone.standalone, 'and knows it has no page behind it');
check(standalone && standalone.steps === 4 && standalone.levels === 4,
    'with the same four steps and four datasets', JSON.stringify(standalone));

// vocab-core has to be there too, or the dataset labels would be guesses.
check(await own.evaluate(() => !!(window.VMCore && window.VMCore.DATASET_REGISTRY)),
    'the standalone page loads the dataset registry');

check(ownErrors.length === 0, 'the standalone page throws nothing', ownErrors.join(' | '));
check(errors.length === 0, 'nothing throws over the page', errors.join(' | '));

// ---------------------------------------------------------------------
console.log('\n=== PASS ===');
ok.forEach((l) => console.log('  + ' + l));
if (fail.length) {
    console.log('\n=== FAIL ===');
    fail.forEach((l) => console.log('  - ' + l));
}
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
