// What a reader reported from a vnexpress.net article: Merid replacing words
// everywhere BUT the article - in the "Xem nhiều" rail down the right, in the
// "Chọn VnExpress làm nguồn ưu tiên trên Google Search" prompt under the share
// buttons, and in the teasers for other stories inside the piece itself.
//
// The scan used to walk the whole of document.body, so all of that was fair
// game. The fixture below is the reported page's shape, with VnExpress's own
// class names - including `sidebar-1`, which is the MAIN column there, not a
// rail. That name is the trap this has to survive: a region rule that fires on
// an ancestor of the article body would leave the page with nothing scanned.
//
// The context check is off - this is about what the scan is willing to look at.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Vietnamese meanings from dataset-C1.csv, so every region below has something
// Merid would replace if it were willing to look there:
//   "phát hiện"   -> detection      "bồi thường" -> compensation
//   "hướng dẫn"   -> guidance       "thỏa thuận" -> settlement
const ARTICLE_PARAS = [
    'Giới chức cho biết họ đã phát hiện dấu hiệu bất thường trong hệ thống liên lạc của sân bay từ đầu tuần trước.',
    'Cuộc điều tra kéo dài nhiều tháng và huy động hàng trăm nhân viên kỹ thuật từ ba cơ quan khác nhau.',
    'Các bên đã đạt được thỏa thuận về việc chia sẻ dữ liệu radar giữa những trung tâm điều hành bay lớn.',
    'Người phát ngôn nói rằng khoản bồi thường cho các hãng hàng không sẽ được tính theo số chuyến bị hủy.',
    'Báo cáo cũng đề cập tới chi phí bảo trì đội máy bay và kế hoạch thay thế thiết bị đã cũ.',
    'Một quan chức khác cho rằng quy trình hiện nay quá phức tạp và cần được rút gọn đáng kể.',
    'Cơ quan quản lý sẽ ban hành hướng dẫn mới cho các sân bay trong quý tới, theo nguồn tin thân cận.',
    'Hai bên dự kiến gặp lại vào tháng sau để hoàn tất những nội dung còn lại của bản ghi nhớ.'
];

// Teasers for other stories, inside the article body. Headline in its own
// block, summary beside it - the shape every Vietnamese news CMS uses.
const TEASERS = [
    ['Mỹ đã phát hiện mối đe dọa tên lửa nhắm vào chuyên cơ',
        'Tình báo nắm được thông tin về việc sử dụng tên lửa đất đối không nhắm vào chuyên cơ chở lãnh đạo.'],
    ['Chiến thuật giúp mật vụ bảo vệ nguyên thủ quốc gia',
        'Từ bí mật đổi máy bay đến tráo vị trí xe, mật vụ thường xuyên dùng chiến thuật đánh lạc hướng.']
];

// The right-hand rail. Headline links only, the way "Xem nhiều" is built.
const MOST_READ = [
    'Mỹ đã phát hiện mối đe dọa tên lửa nhắm vào chuyên cơ riêng',
    'Cựu nghị sĩ nêu lý do rời khỏi chính trường sau nhiều năm',
    'Tiêm kích rơi khi đang bay huấn luyện ở khu vực phía bắc',
    'Yêu cầu bồi thường thiệt hại sau sự cố kéo dài nhiều giờ',
    'Nơi kim cương được bán rẻ như bắp cải ở một tỉnh miền nam'
];

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bản tin</title>
<style>body{margin:0;font:17px/1.7 system-ui} .container{display:flex;gap:24px;padding:24px}
.sidebar-1{flex:1} .sidebar-2{width:300px} .item_slide_show{margin:16px 0}</style>
</head><body>
<header class="header"><a href="/">Trang chủ</a> <a href="/the-gioi">Thế giới</a></header>
<section class="page-detail">
  <div class="container">
    <div class="sidebar-1">
      <h1 class="title-detail" data-region="headline">Cơ quan hàng không phát hiện lỗ hổng trong hệ thống liên lạc</h1>
      <article class="fck_detail" data-region="article">
        ${ARTICLE_PARAS.slice(0, 4).map((t, i) => `<p data-para="${i}">${t}</p>`).join('\n        ')}
        <div class="box_relate" data-region="teasers">
          ${TEASERS.map(([head, sub]) => `<div class="item_slide_show">
            <h4 class="title-news"><a href="/tin">${head}</a></h4>
            <p class="description">${sub}</p>
          </div>`).join('\n          ')}
        </div>
        ${ARTICLE_PARAS.slice(4).map((t, i) => `<p data-para="${i + 4}">${t}</p>`).join('\n        ')}
      </article>
      <div class="social-detail" data-region="promo">
        <p>Chọn VnExpress làm nguồn ưu tiên trên Google Search. Xem hướng dẫn.</p>
      </div>
    </div>
    <div class="sidebar-2" data-region="rail">
      <div class="box-category">
        <h3>Xem nhiều</h3>
        ${MOST_READ.map((t) => `<article class="item-news"><h3 class="title-news"><a href="/tin">${t}</a></h3></article>`).join('\n        ')}
      </div>
    </div>
  </div>
</section>
<footer data-region="footer"><p>Báo điện tử. Mọi hình thức sao chép cần có thỏa thuận bằng văn bản và hướng dẫn kèm theo.</p></footer>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/the-gioi/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-main-content-' + Date.now()),
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

// The top of the intensity range: the most words Merid will ever put on a page.
// If nothing reaches the rail here, nothing reaches it at any setting.
await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', focusSize: 0, frequency: 100, replacementMode: 'highlight',
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
await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(1500);

// Every candidate, shown or still waiting, tagged with the region it landed in.
const spans = await page.$$eval('.vocab-master-highlight, .vocab-master-pending', (els) => els.map((e) => {
    const teaser = e.closest('[data-region="teasers"]');
    const host = teaser || e.closest('[data-region]');
    return { word: e.dataset.word, original: e.dataset.original, region: host ? host.dataset.region : 'none' };
}));
const inRegion = (name) => spans.filter((s) => s.region === name);
const list = (name) => inRegion(name).map((s) => `${s.original}→${s.word}`).join(', ') || 'none';

check(inRegion('article').length > 0, 'the article body is still scanned',
    `${inRegion('article').length} words: ${list('article')}`);

check(inRegion('rail').length === 0, 'nothing lands in the "Xem nhiều" rail', list('rail'));
check(inRegion('promo').length === 0, 'nothing lands in the Google Search prompt', list('promo'));
check(inRegion('teasers').length === 0, 'nothing lands in the in-article teasers', list('teasers'));
check(inRegion('footer').length === 0, 'nothing lands in the footer', list('footer'));
check(inRegion('none').length === 0, 'nothing lands outside the marked regions', list('none'));

// The headline sits outside <article>, which is where most news CMSs put it.
// It is the one thing outside the article body that is still the article, so
// narrowing the scan must not cost the reader the title.
check(inRegion('headline').length > 0, 'the headline is still scanned', list('headline'));

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
