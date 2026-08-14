// Direct messages, on the sites Merid is otherwise built for.
//
// Facebook, Instagram and X serve DMs from the same hostname as the feed, so
// the host lists cannot tell them apart - blocking the host would take the feed
// with it. The path list does, and this drives it through a real browser at the
// real origin: Chromium's --host-resolver-rules points facebook.com at the
// local server, so the extension sees location.host === 'facebook.com' and
// every rule fires exactly as it would on the live site.
//
// What has to hold, in order of how much it would cost to get wrong:
//   1. a DM page is not read at all - not one candidate, checked or otherwise
//   2. the feed on the same host still works, or the fix has eaten the product
//   3. walking from the feed into the inbox without a page load stops the scan
//      and gives the page back
//   4. walking out again resumes
//
// The context check is off throughout: this is about what the scan is willing
// to look at, and a request would only add a timer to wait on.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Vietnamese from dataset-C1.csv, so every fixture has something to lose:
//   "bãi bỏ" -> abolish   "cẩn thận" -> cautious   "vắng mặt" -> absence
const CHAT_LINES = [
    'Mai họp lúc mấy giờ vậy, nhớ cẩn thận đường trơn nhé.',
    'Bên kia đã bãi bỏ quy định cũ rồi, đỡ phải lo.',
    'Hôm qua anh vắng mặt nên chưa nghe thông báo gì cả.'
];
const FEED_LINES = [
    'Cơ quan chức năng đã bãi bỏ quy định cũ về đăng ký kinh doanh từ đầu năm nay.',
    'Người dân được khuyên nên cẩn thận khi đi qua đoạn đường đang sửa chữa.',
    'Sự vắng mặt của đại diện công ty khiến buổi làm việc phải hoãn lại.'
];

const li = (lines, cls) => lines.map(t => `<p class="${cls}">${t}</p>`).join('\n');

// The chat window pinned to the corner of a feed: no URL of its own, so the
// path list cannot see it. Copied from a real Messenger thread a reader
// captured - and the shape is the point:
//
//   - NOT inside any role="dialog". The whole ancestry from the message text
//     up is role="presentation" and role="none", with one role="article" per
//     message, which is what a feed post carries too.
//   - The class names are Facebook's generated ones, worth nothing.
//   - The only two things that mean anything are the role="log" on the
//     transcript and the Vietnamese label on it.
const ROW = (t) => `<div role="presentation"><div role="none">` +
    `<div role="article"><div aria-label="Lúc 23:33, Bạn: ${t.slice(0, 24)}" ` +
    `class="x78zum5 xdt5ytf x1n2onr6"><div class="html-div xexx8yu xyri2b x18d9i69">` +
    `<span class="x193iq5w xeuugli x13faqbe">${t}</span></div></div></div></div></div>`;

const POPUP = `<div class="x9f619 x1n2onr6" id="popup">
  <div role="log" aria-label="Tin nhắn trong cuộc trò chuyện với Văn Quyết Đoàn">
    ${CHAT_LINES.map(ROW).join('\n')}
  </div></div>`;

// The same window as it arrives for a reader whose Facebook is in neither of
// the two languages the label rules know. Everything nameable is gone and the
// role is all that is left - which is the point of leaning on it.
const POPUP_UNLABELLED = `<div class="x9f619 x1n2onr6" id="popup2">
  <div role="log">
    ${CHAT_LINES.map(ROW).join('\n')}
  </div></div>`;

// One document that renders either surface and can switch between them with
// history.pushState - which is how the real site does it, and the case a
// scan-time-only check cannot see.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Fixture</title></head><body>
<div id="app"></div>
<div id="overlay"></div>
<script>
  const FEED = ${JSON.stringify(`<div role="main"><h1>Bảng tin</h1>${li(FEED_LINES, 'feed')}</div>`)};
  const INBOX = ${JSON.stringify(`<div role="main"><h1>Tin nhắn</h1>${li(CHAT_LINES, 'msg')}</div>`)};
  const POPUP = ${JSON.stringify(POPUP)};
  const POPUP_UNLABELLED = ${JSON.stringify(POPUP_UNLABELLED)};
  function render() {
    document.getElementById('app').innerHTML =
      location.pathname.indexOf('/messages') === 0 ? INBOX : FEED;
  }
  window.go = (url) => { history.pushState({}, '', url); render(); };
  window.openChat = () => { document.getElementById('overlay').innerHTML = POPUP; };
  window.openChatUnlabelled = () => { document.getElementById('overlay').innerHTML = POPUP_UNLABELLED; };
  window.addEventListener('popstate', render);
  render();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-private-' + Date.now()),
    {
        headless: true,
        viewport: { width: 1000, height: 800 },
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [
            `--disable-extensions-except=${EXT}`,
            `--load-extension=${EXT}`,
            // The whole point: the page really is served from facebook.com.
            `--host-resolver-rules=MAP facebook.com 127.0.0.1:${port},MAP www.facebook.com 127.0.0.1:${port},MAP instagram.com 127.0.0.1:${port},MAP vnexpress.net 127.0.0.1:${port}`,
            '--ignore-certificate-errors'
        ]
    }
);

const fail = [], ok = [];
const check = (c, label, extra = '') => (c ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });

// A worker that exists is not yet a worker that has its APIs: evaluating too
// early answers with `chrome` undefined and takes the run down with it.
for (let i = 0; i < 60; i++) {
    const ready = await sw.evaluate(() => typeof chrome !== 'undefined' && !!chrome.storage)
        .catch(() => false);
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
}

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
        extensionEnabled: true, aiCheckEnabled: false, vieEngMode: true
    });
    await chrome.storage.local.remove(['vm_profile', 'knownWords', 'savedWords']);
    await self.loadVocabulary('c1');
});

/** Everything Merid has put on the page, shown or still waiting. */
const touched = (p) => p.$$eval('.vocab-master-highlight, .vocab-master-pending', els => els.length);

async function open(url) {
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(1800);   // scan + the mutation debounce behind it
    return { p, errors };
}

// --- 1. A DM page is not read ---
const dm = await open('http://facebook.com/messages/t/123456');
check(await touched(dm.p) === 0, 'nothing is touched in a Facebook message thread',
    `${await touched(dm.p)} candidates`);
const dmText = await dm.p.$eval('body', b => b.innerText.replace(/\s+/g, ' '));
check(/bãi bỏ/.test(dmText) && !/abolish/i.test(dmText),
    'the thread reads exactly as it was written', dmText.slice(0, 80));
check(dm.errors.length === 0, 'no page errors on a blocked page', dm.errors.slice(0, 2).join(' | '));
await dm.p.close();

// --- 2. The feed on the same host still works ---
const feed = await open('http://facebook.com/');
const feedCount = await touched(feed.p);
check(feedCount > 0, 'the Facebook feed is still scanned', `${feedCount} candidates`);
await feed.p.close();

const ig = await open('http://instagram.com/direct/inbox/');
check(await touched(ig.p) === 0, 'nothing is touched in an Instagram inbox');
await ig.p.close();

// A site with no path rules at all is untouched by any of this.
const news = await open('http://vnexpress.net/kinh-doanh/bai-viet');
check(await touched(news.p) > 0, 'an ordinary site is unaffected', `${await touched(news.p)} candidates`);
await news.p.close();

// --- 3. A chat popup over the feed, which has no URL to block ---
const chat = await open('http://facebook.com/');
check(await touched(chat.p) > 0, 'the feed under the popup is scanned');
await chat.p.evaluate(() => window.openChat());
await chat.p.waitForTimeout(1600);
const inPopup = await chat.p.$$eval('#popup .vocab-master-highlight, #popup .vocab-master-pending',
    els => els.length);
check(inPopup === 0, 'nothing is touched inside the chat popup', `${inPopup} candidates`);
check(await chat.p.$eval('#popup', el => !el.closest('[role="dialog"]')),
    'the fixture is the real shape - no dialog anywhere above the messages');
const popupText = await chat.p.$eval('#popup', el => el.innerText.replace(/\s+/g, ' '));
check(/bãi bỏ/.test(popupText) && !/abolish/i.test(popupText),
    'the conversation in it reads as written', popupText.slice(0, 70));
check(await touched(chat.p) > 0, 'and the feed behind it still has its words');

// Strip the label and the role has to carry it alone.
await chat.p.evaluate(() => window.openChatUnlabelled());
await chat.p.waitForTimeout(1600);
const inBare = await chat.p.$$eval('#popup2 .vocab-master-highlight, #popup2 .vocab-master-pending',
    els => els.length);
check(inBare === 0, 'nor in one with no label at all, only role="log"', `${inBare} candidates`);
await chat.p.close();

// --- 4. Feed -> inbox, without a page load ---
const spa = await open('http://facebook.com/');
const before = await touched(spa.p);
check(before > 0, 'the feed was scanned before navigating', `${before} candidates`);

await spa.p.evaluate(() => window.go('/messages/t/999'));
await spa.p.waitForTimeout(1500);
const afterNav = await touched(spa.p);
check(afterNav === 0, 'opening the inbox stops the scan and gives the page back',
    `${afterNav} candidates left`);
const inboxText = await spa.p.$eval('body', b => b.innerText.replace(/\s+/g, ' '));
check(!/abolish|cautious|absence/i.test(inboxText),
    'and no English is left in the conversation', inboxText.slice(0, 80));

// --- 5. ...and back out again ---
await spa.p.evaluate(() => window.go('/'));
await spa.p.waitForTimeout(2000);
const afterBack = await touched(spa.p);
check(afterBack > 0, 'leaving the inbox picks the feed back up', `${afterBack} candidates`);
check(spa.errors.length === 0, 'no page errors across the navigation',
    spa.errors.slice(0, 2).join(' | '));
await spa.p.close();

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) { console.log('\n=== FAIL ==='); fail.forEach(l => console.log('  -', l)); }
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
