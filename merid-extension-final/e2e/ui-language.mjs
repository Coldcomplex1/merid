// The panel's language follows the reader, not the browser.
//
// merid.site has a VI/EN toggle; the extension's popup did not, because
// chrome.i18n resolves against the BROWSER's UI language and takes no
// override. A Vietnamese reader on an English-locale Chrome could never get
// the Vietnamese panel, however plainly they had asked for it on the site.
//
// What this checks, against the real popup and Settings pages:
//   1. the site's choice, relayed over the merid.site bridge, moves the panel
//   2. an explicit choice in Settings overrides the site's
//   3. the learning card on a page stays English either way
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// "vắng mặt" is the C1 Vietnamese for "absence" (dataset-C1.csv).
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bản tin</title></head>
<body><main><article>
${Array.from({ length: 8 }, (_, i) =>
        `<p>Đoạn ${i + 1}: Sự vắng mặt của ông trong cuộc họp đã được ghi nhận, và các bên vẫn tiếp tục thảo luận về những nội dung còn lại của bản ghi nhớ chung.</p>`).join('\n')}
</article></main></body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/tin/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-ui-language-' + Date.now()),
    {
        headless: true,
        viewport: { width: 1100, height: 900 },
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [];
const ok = [];
const check = (c, label, extra = '') => (c ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

let sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
for (let i = 0; i < 60; i++) {
    if (await sw.evaluate(() => typeof chrome !== 'undefined' && !!chrome.storage).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
}
const extId = new URL(sw.url()).host;

/** Open a panel page and read the strings that prove which catalog it used. */
async function readPanel(page) {
    await page.waitForTimeout(400);
    return page.evaluate(() => ({
        lang: document.documentElement.lang,
        dataset: (document.querySelector('[data-i18n="popupDatasetTitle"]') || {}).textContent || '',
        replacement: (document.querySelector('[data-i18n="optReplacementTitle"]') || {}).textContent || '',
        language: (document.querySelector('[data-i18n="optLanguageTitle"]') || {}).textContent || ''
    }));
}

async function openPopup() {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
    return p;
}
async function openOptions() {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'load' });
    return p;
}

// --- 1. Nothing chosen anywhere: the browser's language decides (English here) ---
await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        uiLang: 'auto', siteLang: '', datasetKey: 'c1', aiCheckEnabled: false,
        // Installing leaves onboardingPending behind and the wizard is modal, so
        // without this it opens over the page and swallows the pointer.
        onboardingDone: true, onboardingPending: false
    });
});
let popup = await openPopup();
let seen = await readPanel(popup);
check(seen.dataset === 'Vocabulary dataset', 'with no choice made, the popup follows the browser', seen.dataset);
await popup.close();

// --- 2. The site says Vietnamese: the panel follows ---
//
// The real path is merid.site → window.postMessage → content-bridge.js →
// this message. The first two links need the actual https://merid.site origin,
// which a local fixture cannot borrow, so the test starts where the bridge
// hands over: the exact runtime message content-bridge.js sends.
const relay = await ctx.newPage();
await relay.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
await relay.evaluate(() => new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'MERID_WEB_LANG', lang: 'vi' }, () => resolve());
}));
await relay.close();

const stored = await sw.evaluate(async () => (await chrome.storage.sync.get(['siteLang'])).siteLang);
check(stored === 'vi', 'the bridge message is stored as the site language', String(stored));

popup = await openPopup();
seen = await readPanel(popup);
check(seen.dataset === 'Bộ từ vựng', 'the popup opens in Vietnamese after the site says so', seen.dataset);
check(seen.lang === 'vi', 'the popup document is tagged vi', seen.lang);
await popup.close();

let options = await openOptions();
seen = await readPanel(options);
check(seen.replacement === 'Thay từ', 'Settings is Vietnamese too', seen.replacement);
check(seen.language === 'Ngôn ngữ', 'the new Language card is translated', seen.language);

// --- 3. An explicit choice in Settings beats the site ---
await options.click('#langSeg button[data-val="en"]');
await options.waitForTimeout(600);
seen = await readPanel(options);
check(seen.replacement === 'Replacement', 'choosing English in Settings repaints the page at once', seen.replacement);
const savedLang = await sw.evaluate(async () => (await chrome.storage.sync.get(['uiLang'])).uiLang);
check(savedLang === 'en', 'the choice is stored', String(savedLang));
await options.close();

popup = await openPopup();
seen = await readPanel(popup);
check(seen.dataset === 'Vocabulary dataset', 'the popup honours the Settings override, not the site', seen.dataset);
await popup.close();

// --- 4. The learning card is English whatever the panel is set to ---
await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        uiLang: 'vi', siteLang: 'vi', datasetKey: 'c1', frequency: 100,
        replacementMode: 'highlight', extensionEnabled: true, aiCheckEnabled: false
    });
    await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile', 'knownWords', 'savedWords']);
    await self.loadVocabulary('c1');
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(800);

const hit = await page.$('.vocab-master-highlight');
check(!!hit, 'a word was replaced to hover');
if (hit) {
    await hit.hover();
    await page.waitForTimeout(600);
    const card = await page.evaluate(() => {
        const el = document.querySelector('.vocab-master-tooltip');
        return el ? el.textContent : '';
    });
    check(/Save to Deck/.test(card), 'the learning card is English even with a Vietnamese panel',
        card.slice(0, 80));
    check(!/Lưu vào bộ thẻ/.test(card), 'the card carries no Vietnamese UI wording');
}

// A Vietnamese popup alongside it, to prove the two really are independent.
popup = await openPopup();
seen = await readPanel(popup);
check(seen.dataset === 'Bộ từ vựng', '…while the popup beside it is Vietnamese', seen.dataset);
await popup.close();

check(!errors.length, 'no console/page errors', errors.join(' | '));

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
