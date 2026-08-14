// A page that has no main content when the scan first looks at it, and renders
// one several seconds later - a news SPA that fetches its article after boot.
//
// `maybeRefreshScanRoots` is what catches that: while the scan is rooted in
// document.body it keeps looking for something better. It used to look every
// second for the life of the tab, which on a long or growing page is an O(page)
// measurement burned over and over on an answer that almost never changes - the
// reported cause of Merid making the browser feel slow. The wait now doubles
// after each fruitless look, up to ROOT_REFRESH_MAX_MS.
//
// So this pins the thing that backoff could plausibly break: an article that
// shows up late is still found, and still narrows the scan - the rail beside it
// stays untouched, which is the proof that the root really moved off body
// rather than the words simply arriving by the mutation path.
//
// The rail assertion is the one with teeth, and it is fussier than it looks.
// Two things had to be arranged for it to mean anything. The rail arrives as
// several sibling blocks, so `structuralFeedItem` gives each one its own word
// allowance - hung off a single container it shares the page's allowance, which
// the headline spends in full, and it would read as "left alone" no matter what
// the root was. And the fixture's script sits in <head>, because
// `proseWords(document.body)` counts the source of an inline script in the body,
// and this one carries the article as a string: left there it inflates the page
// count enough that the article can never clear MAIN_TEXT_SHARE and the scan
// never narrows at all. Checked against a build with the refresh disabled: this
// assertion fails there (the rail collects a dozen words), and passes here.
//
// The context check is off - this is about what the scan is willing to look at.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// When the article mounts, and when the rail is topped up with fresh text.
//
// The rail is the discriminator, and it has to arrive AFTER the scan has had a
// chance to narrow - text that was already walked while the page was still
// body-rooted is marked processed and never looked at again, so it would read
// as "left alone" whether the root moved or not. These two are staggered so the
// backoff's 1s/2s/4s/8s ladder resolves in between: the article lands before the
// look at ~7s, the rail well after it.
const RENDER_AFTER_MS = 5000;
const RAIL_AFTER_MS = 12000;

// Vietnamese meanings from dataset-C1.csv:
//   "phát hiện" -> detection    "thỏa thuận" -> settlement
//   "bồi thường" -> compensation   "hướng dẫn" -> guidance
const ARTICLE_PARAS = [
    'Giới chức cho biết họ đã phát hiện dấu hiệu bất thường trong hệ thống liên lạc của sân bay từ đầu tuần trước.',
    'Các bên đã đạt được thỏa thuận về việc chia sẻ dữ liệu radar giữa những trung tâm điều hành bay lớn.',
    'Người phát ngôn nói rằng khoản bồi thường cho các hãng hàng không sẽ được tính theo số chuyến bị hủy.',
    'Cơ quan quản lý sẽ ban hành hướng dẫn mới cho các sân bay trong quý tới, theo nguồn tin thân cận.',
    'Cuộc điều tra kéo dài nhiều tháng và huy động hàng trăm nhân viên kỹ thuật từ ba cơ quan khác nhau.'
];

// The rail carries the same vocabulary as the article, and arrives once the
// scan has had its chance to narrow. If the root moved to the article these are
// outside it and never read; if the scan is still rooted in document.body they
// are as fair game as anything else, and collect words.
const RAIL_ITEMS = [
    'Giới chức đã phát hiện sai sót trong báo cáo tài chính của công ty vào cuối năm ngoái.',
    'Hai bên ký thỏa thuận hợp tác về đào tạo nhân lực cho ngành công nghiệp bán dẫn.',
    'Mức bồi thường cho người dân bị ảnh hưởng đã được hội đồng thẩm định thông qua.',
    'Cơ quan chức năng sẽ ban hành hướng dẫn chi tiết cho các doanh nghiệp trong tháng tới.'
];

// The script lives in <head> on purpose. `proseWords(document.body)` measures
// `document.body.textContent`, which includes the source of any inline <script>
// in the body - and this one carries the whole article as a string. Left in the
// body it inflates the page's word count enough that the article can no longer
// clear MAIN_TEXT_SHARE, and the scan never narrows no matter how well the
// refresh works. That cost a while to find; keep the fixture's data out of body.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tin tức</title>
<script>
document.addEventListener('DOMContentLoaded', function () {
  // The DOM keeps ticking, the way a real app's does - this is what gives
  // maybeRefreshScanRoots something to run on.
  var beat = document.createElement('div');
  beat.setAttribute('aria-hidden', 'true');
  document.body.appendChild(beat);
  setInterval(function () { beat.textContent = 'x' + Date.now(); }, 500);

  setTimeout(function () {
    var main = document.createElement('main');
    main.dataset.region = 'article';
    main.innerHTML = ${JSON.stringify(ARTICLE_PARAS.map((t) => `<p>${t}</p>`).join(''))};
    var slot = document.getElementById('slot');
    slot.textContent = '';
    slot.appendChild(main);
    window.__articleAt = Date.now();
  }, ${RENDER_AFTER_MS});

  setTimeout(function () {
    document.getElementById('rail').insertAdjacentHTML('beforeend',
      ${JSON.stringify(RAIL_ITEMS.map((t) =>
        `<div class="rail-item"><div>Tin liên quan</div><div>${t}</div></div>`).join(''))});
    window.__railAt = Date.now();
  }, ${RAIL_AFTER_MS});
});
</script></head>
<body>
<h1 data-region="headline">Cơ quan điều tra công bố kết luận ban đầu về sự cố</h1>
<div id="shell">
  <div id="slot" data-region="pending"><p>Đang tải nội dung bài viết, vui lòng chờ trong giây lát.</p></div>
  <div id="rail" data-region="rail"><h3>Xem nhiều</h3></div>
</div>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/the-gioi/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-late-content-' + Date.now()),
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
        datasetKey: 'c1', frequency: 100, replacementMode: 'highlight',
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

const found = await page.waitForFunction(
    () => document.querySelectorAll('main .vocab-master-highlight, main .vocab-master-pending').length > 0,
    null, { timeout: 25000 }
).then(() => true).catch(() => false);
// The rail lands last; wait for it and then leave a full debounce-plus-scan of
// margin, so "no words in the rail" means it was refused rather than pending.
await page.waitForFunction(() => !!window.__railAt, null, { timeout: 30000 });
await page.waitForTimeout(3000);

const spans = await page.$$eval('.vocab-master-highlight, .vocab-master-pending', (els) => els.map((e) => {
    const host = e.closest('[data-region]');
    return { word: e.dataset.word, original: e.dataset.original, region: host ? host.dataset.region : 'none' };
}));
const inRegion = (name) => spans.filter((s) => s.region === name);
const list = (name) => inRegion(name).map((s) => `${s.original}→${s.word}`).join(', ') || 'none';

const delay = await page.evaluate(() => window.__articleAt - performance.timeOrigin);

check(found, 'an article that renders late is still picked up',
    `article mounted at ~${(delay / 1000).toFixed(1)}s`);
check(inRegion('article').length > 0, 'the late article gets its words',
    `${inRegion('article').length}: ${list('article')}`);

// The real proof that the scan root moved. This rail text arrived after the
// article did, so it has never been walked before: if the scan were still
// rooted in document.body it would read it and find the same vocabulary the
// article is full of. Nothing here means the root is the article now.
check(inRegion('rail').length === 0, 'the scan narrowed to it - the late rail is left alone', list('rail'));
check(inRegion('headline').length > 0, 'the headline outside it is still scanned', list('headline'));

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
