// End-to-end check of the Phase 0 + Phase 1 work against a real Chromium with
// the unpacked extension loaded. Serves a synthetic Vietnamese article whose
// words appear in dataset-C1.csv, then drives the tooltip.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Vietnamese meanings taken straight from dataset-C1.csv so matching is real.
// Each <p> is its own "post" with its own replacement budget (content.js
// postRoot -> closest p/li/section), and that budget starts at 2. So to get
// "bãi bỏ" replaced twice on one page it has to be the FIRST match inside two
// separate paragraphs - put anything matchable ahead of it and the budget is
// already spent by the time the scan reaches it.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Thử nghiệm</title></head><body>
<p>Bãi bỏ quy định cũ là điều cần thiết.</p>
<p>Bãi bỏ thêm một lần nữa trong năm nay.</p>
<p>Nhiều doanh nghiệp đã cân nhắc kỹ trước khi đưa ra lựa chọn.</p>
<p>Báo cáo cho thấy sự phá thai đang giảm dần trong nhóm tuổi trẻ.</p>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/kinh-doanh/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-profile-' + Date.now()),
    {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [];
const ok = [];
const check = (cond, label, extra = '') => (cond ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

// The service worker registers asynchronously after launch.
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
check(!!extId, 'service worker booted', extId);

// Force the C1 dataset so the seeded sentences match.
await sw.evaluate(async () => {
    await chrome.storage.sync.set({ datasetKey: 'c1', frequency: 100, replacementMode: 'replace', extensionEnabled: true });
    await chrome.storage.local.remove(['vm_profile', 'knownWords', 'savedWords', 'vm_ai_cache']);
    // Writing datasetKey alone does not rebuild the worker's cached vocabulary;
    // setDataset/loadVocabulary is the path the real UI uses.
    await self.loadVocabulary('c1');
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(1200);

// --- 1. The engine still replaces words (no regression from the refactor) ---
const spans = await page.$$('.vocab-master-highlight');
check(spans.length > 0, 'words were replaced on the page', `${spans.length} spans`);

const levels = await page.$$eval('.vocab-master-highlight', els => els.map(e => e.dataset.level));
check(levels.length > 0 && levels.every(l => l === 'C1'), 'span carries its CEFR level', JSON.stringify([...new Set(levels)]));

// --- 2. "shown" events reached the profile, deduped per headword ---
await page.waitForTimeout(4500); // let the 4s flush timer fire
let profile = await sw.evaluate(async () => (await chrome.storage.local.get('vm_profile')).vm_profile);
check(!!profile, 'profile was created in storage.local');
const shownWords = Object.keys(profile?.words || {});
check(shownWords.length > 0, 'shown events recorded', shownWords.join(', '));

// "bãi bỏ" appears in two paragraphs -> two spans, but must be ONE exposure.
const abolishSpans = await page.$$eval('.vocab-master-highlight',
    els => els.filter(e => (e.dataset.word || '').toLowerCase() === 'abolish').length);
check(abolishSpans >= 2 && profile.words.abolish?.shown === 1,
    'repeated word counts as one exposure',
    `${abolishSpans} spans -> shown=${profile.words.abolish?.shown}`);
check(profile.events === 0, '"shown" alone is not feedback evidence', `events=${profile.events}`);

// --- 3. Tooltip renders with the new thumb buttons ---
await spans[0].hover();
await page.waitForSelector('.vocab-master-tooltip .vm-rate', { timeout: 5000 }).catch(() => { });
const tipVisible = await page.$eval('.vocab-master-tooltip', el => el.style.display).catch(() => 'none');
check(tipVisible === 'block', 'tooltip opened on hover');
check(!!(await page.$('.vm-up')) && !!(await page.$('.vm-down')), 'thumbs up/down rendered');

// The rate group must not squash the two primary actions.
const widths = await page.$$eval('.vm-actions > *', els => els.map(e => Math.round(e.getBoundingClientRect().width)));
check(widths.length === 3 && widths[0] > widths[2] && widths[1] > widths[2],
    'rate group stays narrower than the primary actions', JSON.stringify(widths));

// --- 4. Thumbs-down is recorded and does NOT disturb the text ---
const beforeText = await page.$eval('body', b => b.innerText);
const ratedWord = await page.$eval('.vocab-master-tooltip', el => el.dataset.currentWord);
await page.click('.vm-down');
await page.waitForTimeout(1200); // handleRate flushes immediately
profile = await sw.evaluate(async () => (await chrome.storage.local.get('vm_profile')).vm_profile);
check(profile.words[ratedWord.toLowerCase()]?.down === 1, 'thumbs-down recorded', ratedWord);
check(profile.events > 0, 'rating counts as a feedback event', `events=${profile.events}`);
check(profile.topics?.business, 'topic derived from the URL slug', JSON.stringify(profile.topics));

const afterText = await page.$eval('body', b => b.innerText);
check(beforeText === afterText, 'rating does not disturb the page text');

const disabled = await page.$eval('.vm-down', b => b.disabled);
check(disabled === true, 'rate buttons lock after voting');

// --- 5. "I know this" still unwraps every instance of the headword ---
await page.$$eval('.vocab-master-highlight', els => els[0] && els[0].dispatchEvent(
    new MouseEvent('mouseover', { bubbles: true })));
await page.waitForTimeout(400);
const knowWord = await page.$eval('.vocab-master-tooltip', el => el.dataset.currentWord);
await page.click('.vm-know');
await page.waitForTimeout(900);
const leftover = await page.$$eval('.vocab-master-highlight',
    (els, w) => els.filter(e => (e.dataset.word || '').toLowerCase() === w).length,
    knowWord.toLowerCase());
check(leftover === 0, '"I know this" unwrapped all instances', `${knowWord}: ${leftover} left`);

profile = await sw.evaluate(async () => (await chrome.storage.local.get('vm_profile')).vm_profile);
check(profile.words[knowWord.toLowerCase()]?.known === 1, '"known" recorded in the profile');

// --- 6. The ranker suppresses a known word entirely ---
const suppressed = await sw.evaluate(async (w) => {
    const p = (await chrome.storage.local.get('vm_profile')).vm_profile;
    return self.VMProfile.adjustedFrequency(p, { word: w }, 100);
}, knowWord.toLowerCase());
check(suppressed === 0, 'known word gets frequency 0 from the ranker', String(suppressed));

// --- 7. No page errors introduced ---
const real = errors.filter(e => !/favicon|net::ERR/i.test(e));
check(real.length === 0, 'no console/page errors', real.slice(0, 3).join(' | '));

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) {
    console.log('\n=== FAIL ===');
    fail.forEach(l => console.log('  -', l));
}
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
