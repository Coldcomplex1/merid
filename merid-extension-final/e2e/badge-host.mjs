// The badge must not take the page down with it.
//
// status-badge.js is the only shadow mount in the extension that adopts a host
// it did not create: mount() looks #merid-status-host up by id and, if this
// instance has not attached a root yet, calls attachShadow() on whatever it
// found. attachShadow() throws on a host that already hosts a shadow tree, and
// nothing caught it - so the throw came out of Status.set(), which is called
// from the middle of the scan and the middle of the AI check. The first call
// site never got as far as scheduling the request; the second had already set
// aiInFlight and never cleared it. With the reveal deferred, every held word
// then stayed hidden: the reader saw an extension that did nothing at all.
//
// A second copy of the extension in the same tab is what produced it in the
// wild - content scripts share the page's DOM, so the second copy finds the
// first copy's host with its own `root` still null. That is not reproducible
// from one extension, but the state it creates is: the page here attaches the
// shadow tree itself, before the content script runs.
//
// The context check is ON, because the damage is downstream of the throw. A
// page that still swaps its words is the only proof that matters.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// The last script in <body> runs before the content script does at
// document_idle, so by the time mount() looks the id up, the host is there and
// already hosting a tree. The marker is how the assertions tell "adopted the
// tree that was there" from "quietly built a second host".
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bài viết</title></head>
<body>
<main>
<p>Giới chức cho biết họ đã phát hiện dấu hiệu bất thường trong hệ thống liên lạc của sân bay từ đầu tuần trước.</p>
<p>Các bên đã đạt được thỏa thuận về việc chia sẻ dữ liệu radar giữa những trung tâm điều hành bay lớn.</p>
<p>Người phát ngôn nói rằng khoản bồi thường cho các hãng hàng không sẽ được tính theo số chuyến bị hủy.</p>
<p>Cơ quan quản lý sẽ ban hành hướng dẫn mới cho các sân bay trong quý tới, theo nguồn tin thân cận.</p>
</main>
<script>
  var squatter = document.createElement('div');
  squatter.id = 'merid-status-host';
  document.body.appendChild(squatter);
  var stolen = squatter.attachShadow({ mode: 'open' });
  var marker = document.createElement('i');
  marker.id = 'page-marker';
  stolen.appendChild(marker);
</script>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/the-gioi/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-badge-host-' + Date.now()),
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

async function until(read, timeout = 20000, step = 200) {
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
// The worker loads its own dataset at boot; let that settle before choosing one.
await sw.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise((r) => setTimeout(r, 100));
    }
});

// Stub Gemini to approve everything: this test is about the badge, not the
// verdicts. Same hostname-matching shape as e2e/ai-check.mjs.
await sw.evaluate(async () => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', focusSize: 0, frequency: 100, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: true
    });
    await chrome.storage.local.set({ geminiApiKey: 'fake-key-for-test', vm_ai_model: 'gemini-flash-lite-latest' });
    await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile', 'knownWords', 'savedWords', 'vm_badge_pos']);
    await self.loadVocabulary('c1');

    if (!self.__realFetch) self.__realFetch = self.fetch;
    const routeOf = (u) => {
        try {
            const raw = typeof u === 'string' ? u : (u && typeof u.url === 'string' ? u.url : String(u));
            return { host: new URL(raw).hostname };
        } catch (e) {
            return { host: '' };
        }
    };
    self.fetch = async (u, opts) => {
        if (routeOf(u).host !== 'generativelanguage.googleapis.com') return self.__realFetch(u, opts);
        const prompt = JSON.parse(opts.body).contents[0].parts[0].text;
        const rows = prompt.split('\n').filter((l) => /^\d+\.\s+english=/.test(l));
        const verdicts = rows.map((_, idx) => ({ i: idx + 1, ok: true }));
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(verdicts) }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });

// --- The throw itself ---
const shadowError = await until(async () => {
    const hit = errors.find((e) => /attachShadow|already hosts a shadow tree/i.test(e));
    return hit || null;
}, 4000);
check(!shadowError, 'mounting on a host that already hosts a shadow tree does not throw',
    shadowError || 'no error');

// --- The damage: held words must still be revealed ---
const revealed = await until(async () => {
    const spans = await page.$$eval('.vocab-master-highlight', (els) => els.map((e) => ({
        word: e.dataset.word, original: e.dataset.original, text: e.textContent
    })));
    const shown = spans.filter((s) => s.text.toLowerCase() !== (s.original || '').toLowerCase());
    return shown.length ? shown : null;
}, 25000);
check(!!revealed, 'the context check still ran and the words it cleared were swapped in',
    revealed ? revealed.map((s) => `${s.original}→${s.text}`).join(', ')
        : 'nothing was ever revealed - the check stalled');

// --- Adopted, not duplicated ---
const badgeHome = await page.evaluate(() => {
    const hosts = document.querySelectorAll('#merid-status-host');
    const host = hosts[0];
    const root = host && host.shadowRoot;
    return {
        hosts: hosts.length,
        pageTree: !!(root && root.querySelector('#page-marker')),
        badge: !!(root && root.querySelector('.badge'))
    };
});
check(badgeHome.hosts === 1, 'no second host was left in the page', `${badgeHome.hosts} hosts`);
check(badgeHome.pageTree, 'the shadow tree that was already there is still the one in use');
check(badgeHome.badge, 'and the badge was built inside it');

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
