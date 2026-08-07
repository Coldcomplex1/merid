// The hosted AI check: Merid's own keys, reached through the proxy, metered
// per user. Verifies the extension side of that arrangement - that it proves
// who it is, reuses one anonymous identity, prefers a personal key when there
// is one, and goes quiet gracefully when the day's allowance is spent.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// The word the proxy rejects sits below the fold: an upgrade is deliberately
// parked while its span is on screen, so a short page would be testing the
// viewport guard rather than whether the verdict arrived at all.
// Each paragraph is its own <article> so both get a word allowance, and the
// target below the fold only gets checked once the test scrolls to it - words
// are checked when the reader reaches them, not all at once on load.
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Thử nghiệm</title></head><body>
<article><p>Nhiều doanh nghiệp đã cân nhắc kỹ trước khi đưa ra lựa chọn.</p></article>
<div style="height:2400px"></div>
<article><p>Bãi bỏ quy định cũ là điều cần thiết.</p></article>
</body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-hosted-' + Date.now()),
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
const extId = new URL(sw.url()).host;

await sw.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise(r => setTimeout(r, 100));
    }
});

/**
 * Stand in for Firebase Auth and the proxy. Records every call so the test can
 * assert on what the extension actually sent, and lets each test choose what
 * /api/check answers with.
 */
const installStub = (proxyReply) => sw.evaluate(async (reply) => {
    await chrome.storage.local.set({ __calls: [] });
    self.__reply = reply;
    if (!self.__realFetch) self.__realFetch = self.fetch;

    const record = async (entry) => {
        const cur = (await chrome.storage.local.get('__calls')).__calls || [];
        cur.push(entry);
        await chrome.storage.local.set({ __calls: cur });
    };

    // Resolve a fetch() argument to its host and path. Matching the hostname
    // exactly, rather than asking whether the URL string *contains* a domain,
    // is both what CodeQL wants and simply more correct - "evil.test/?x=
    // generativelanguage.googleapis.com" contains that domain without being it.
    const routeOf = (u) => {
        try {
            const raw = typeof u === 'string' ? u : (u && typeof u.url === 'string' ? u.url : String(u));
            const parsed = new URL(raw);
            return { host: parsed.hostname, path: parsed.pathname };
        } catch (e) {
            return { host: '', path: '' };
        }
    };
    self.fetch = async (u, opts) => {
        const { host, path } = routeOf(u);
        const body = opts && opts.body ? String(opts.body) : '';

        if (host === 'identitytoolkit.googleapis.com' && path.endsWith('signUp')) {
            await record({ kind: 'anon-signup', body });
            return new Response(JSON.stringify({
                localId: 'anon-uid-1', idToken: 'fake-id-token', refreshToken: 'fake-refresh', expiresIn: '3600'
            }), { status: 200 });
        }
        if (host === 'securetoken.googleapis.com') {
            await record({ kind: 'refresh' });
            return new Response(JSON.stringify({
                id_token: 'fake-id-token', user_id: 'anon-uid-1', refresh_token: 'fake-refresh', expires_in: '3600'
            }), { status: 200 });
        }
        if (host === 'merid.site' && path === '/api/check') {
            const parsed = JSON.parse(body || '{}');
            await record({
                kind: 'proxy',
                auth: (opts.headers && opts.headers.Authorization) || '',
                items: parsed.items || [],
                persona: parsed.persona || ''
            });
            const r = self.__reply;
            if (r.status !== 200) return new Response(JSON.stringify(r.payload), { status: r.status });
            const verdicts = (parsed.items || []).map(it =>
                it.word.toLowerCase() === 'abolish' ? 0 : 1);
            const betters = (parsed.items || []).map(it =>
                it.word.toLowerCase() === 'abolish' ? 'terminate' : '');
            return new Response(JSON.stringify({
                ok: true, verdicts, betters, model: 'gemini-3.5-flash-lite',
                used: r.used, limit: r.limit, resetIn: 3600
            }), { status: 200 });
        }
        if (host === 'generativelanguage.googleapis.com') {
            await record({ kind: 'direct-gemini' });
            const prompt = JSON.parse(body).contents[0].parts[0].text;
            const rows = prompt.split('\n').filter(l => /^\d+\.\s+english=/.test(l));
            return new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: JSON.stringify(rows.map((_, i) => ({ i: i + 1, ok: true }))) }] } }]
            }), { status: 200 });
        }
        return self.__realFetch(u, opts);
    };
}, proxyReply);

const calls = () => sw.evaluate(async () =>
    (await chrome.storage.local.get('__calls')).__calls || []);

const reset = () => sw.evaluate(async () => {
    await chrome.storage.sync.set({
        datasetKey: 'c1', frequency: 100, replacementMode: 'replace',
        extensionEnabled: true, aiCheckEnabled: true
    });
    await chrome.storage.local.remove([
        'geminiApiKey', 'vm_ai_cache', 'vm_profile', 'vm_ai_quota', 'vm_anon_auth', 'vm_auth'
    ]);
    await self.loadVocabulary('c1');
});

const ITEMS = [{ word: 'abolish', original: 'bãi bỏ', sentence: 'Bãi bỏ quy định cũ.' }];
const runCheck = () => sw.evaluate(its => self.aiCheckContext(its), ITEMS);

// =====================================================================
// 1. No personal key: the hosted endpoint is used, with proof of identity
// =====================================================================
await reset();
await installStub({ status: 200, used: 1, limit: 20 });
let res = await runCheck();
let log = await calls();

check(res.ok && res.hosted === true, 'the hosted endpoint answers the check', JSON.stringify(res.ok));
check(res.verdicts[0] === 0 && res.betters[0] === 'terminate',
    'verdict and suggestion come back intact', JSON.stringify([res.verdicts, res.betters]));

const proxyCalls = log.filter(c => c.kind === 'proxy');
check(proxyCalls.length === 1, 'exactly one proxy call', String(proxyCalls.length));
check(/^Bearer .+/.test(proxyCalls[0].auth), 'the request carries a bearer token', proxyCalls[0].auth);
check(log.some(c => c.kind === 'anon-signup'), 'an anonymous identity was created for this device');
check(!log.some(c => c.kind === 'direct-gemini'), 'no key was used from the extension itself');

// The page text that leaves the device is the sentence snippet and nothing else.
check(proxyCalls[0].items.length === 1 &&
    Object.keys(proxyCalls[0].items[0]).sort().join() === 'original,sentence,word',
    'only the word, its original and the sentence are sent',
    JSON.stringify(Object.keys(proxyCalls[0].items[0])));

// =====================================================================
// 2. The anonymous identity is created once, not per request
// =====================================================================
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_cache']));
await installStub({ status: 200, used: 2, limit: 20 });
await runCheck();
log = await calls();
check(!log.some(c => c.kind === 'anon-signup'),
    'a second check reuses the stored identity instead of minting another');

// Even after the worker is restarted, the identity survives in storage.
const stored = await sw.evaluate(async () =>
    (await chrome.storage.local.get('vm_anon_auth')).vm_anon_auth);
check(stored && stored.uid === 'anon-uid-1' && !!stored.refreshToken,
    'the identity is persisted, so a restart does not reset the quota', JSON.stringify(stored));

// =====================================================================
// 3. Quota is remembered and reported
// =====================================================================
let quota = await sw.evaluate(async () => (await chrome.storage.local.get('vm_ai_quota')).vm_ai_quota);
check(quota && quota.limit === 20 && quota.used === 2 && quota.exhausted === false,
    'the server\'s count is recorded for the UI', JSON.stringify(quota));

await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_cache']));
await installStub({
    status: 429,
    payload: { ok: false, code: 'quota-exceeded', used: 21, limit: 20, resetIn: 3600, anonymous: true }
});
res = await runCheck();
check(!res.ok && res.quota === true, 'running out is reported as a quota stop, not an error',
    JSON.stringify(res));

quota = await sw.evaluate(async () => (await chrome.storage.local.get('vm_ai_quota')).vm_ai_quota);
check(quota && quota.exhausted === true && quota.anonymous === true,
    'the exhausted state is stored', JSON.stringify(quota));

// The popup says so - quietly, and only in this state.
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
await popup.waitForTimeout(600);
const hint = await popup.$eval('#quota-hint', el => ({ hidden: el.hidden, text: el.textContent }));
check(!hint.hidden && /Sign in/i.test(hint.text),
    'the popup explains the quiet AI, and points anonymous users at signing in', JSON.stringify(hint));

// ...and says nothing once there is budget again.
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_quota']));
await popup.reload({ waitUntil: 'load' });
await popup.waitForTimeout(500);
check(await popup.$eval('#quota-hint', el => el.hidden), 'with budget left the popup stays silent');
await popup.close();

// =====================================================================
// 4. A personal key still wins, and never touches the proxy
// =====================================================================
await reset();
await sw.evaluate(() => chrome.storage.local.set({ geminiApiKey: 'AIzaPersonalKey' }));
await installStub({ status: 200, used: 1, limit: 20 });
res = await runCheck();
log = await calls();
check(res.ok && !res.hosted, 'a saved personal key is used directly', JSON.stringify(res.ok));
check(log.some(c => c.kind === 'direct-gemini'), 'the request went straight to Google');
check(!log.some(c => c.kind === 'proxy'), 'Merid\'s endpoint was not involved at all');

// =====================================================================
// 5. Failures degrade to "no check", never to a broken page
// =====================================================================
await reset();
await installStub({ status: 503, payload: { ok: false, code: 'quota-unavailable' } });

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
const before = await page.$$eval('.vocab-master-highlight', els => els.length);
await page.waitForTimeout(4000);
const after = await page.$$eval('.vocab-master-highlight', els => els.length);
check(before > 0 && after === before,
    'an unavailable endpoint leaves the page exactly as the local engine made it',
    `${before} -> ${after}`);
check(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));

// And with the endpoint working, the page really is corrected end to end.
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_cache']));
await installStub({ status: 200, used: 3, limit: 20 });
const p2 = await ctx.newPage();
await p2.goto(base + '/', { waitUntil: 'load' });
await p2.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
// Scroll to the target (gets it checked), then away (lets the swap land).
await p2.waitForTimeout(1500);
await p2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p2.waitForTimeout(4500);
await p2.evaluate(() => window.scrollTo(0, 0));
await p2.waitForTimeout(1000);
const abolishLeft = await p2.$$eval('.vocab-master-highlight',
    els => els.filter(e => (e.dataset.word || '').toLowerCase() === 'abolish').length);
const upgraded = await p2.$$eval('.vocab-ai-fix', els => els.map(e => e.dataset.word));
check(abolishLeft === 0 && upgraded.includes('terminate'),
    'the hosted verdict reaches the page and swaps the word',
    `${abolishLeft} abolish left, upgraded=${JSON.stringify(upgraded)}`);
await p2.close();

// =====================================================================
// 6. The check is ON without anyone touching a setting
// =====================================================================
// This is what "the AI is not working" looked like: aiCheckEnabled was absent
// from DEFAULT_SETTINGS, every raw read got undefined, and the gate treated
// that as off - so the feature never ran for a single user.
await sw.evaluate(async () => {
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({ datasetKey: 'c1', frequency: 100, replacementMode: 'replace' });
    await chrome.storage.local.remove([
        'geminiApiKey', 'vm_ai_cache', 'vm_profile', 'vm_ai_quota', 'vm_anon_auth', 'vm_auth'
    ]);
    await self.loadVocabulary('c1');
});
await installStub({ status: 200, used: 1, limit: 20 });
res = await runCheck();
check(res.ok && res.hosted === true,
    'with aiCheckEnabled never set, the check still runs', JSON.stringify(res.ok || res));

// ...and switching it off still stops everything.
await sw.evaluate(() => chrome.storage.sync.set({ aiCheckEnabled: false }));
await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_cache']));
res = await runCheck();
check(!res.ok && res.disabled === true, 'turning it off stops every request', JSON.stringify(res));
await sw.evaluate(() => chrome.storage.sync.set({ aiCheckEnabled: true }));

// =====================================================================
// 7. The diagnostic names the broken link
// =====================================================================
const diagnose = () => sw.evaluate(() => self.aiDiagnose());

await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_cache']));
await installStub({ status: 200, used: 2, limit: 20 });
let d = await diagnose();
check(d.ok && d.stage === 'hosted' && /Working/.test(d.message),
    'a healthy setup reports working', JSON.stringify(d));
check(/left today/.test(d.message), 'it says how much allowance is left', d.message);

await sw.evaluate(() => chrome.storage.sync.set({ aiCheckEnabled: false }));
d = await diagnose();
check(!d.ok && d.stage === 'off', 'a switched-off check is named as such', JSON.stringify(d));
await sw.evaluate(() => chrome.storage.sync.set({ aiCheckEnabled: true }));

// Each server failure has to lead somewhere different - that is the whole point.
const cases = [
    [{ status: 500, payload: { ok: false, code: 'server-misconfigured' } }, 'server', /environment variables/i],
    [{ status: 503, payload: { ok: false, code: 'quota-unavailable' } }, 'server', /Upstash/i],
    [{ status: 502, payload: { ok: false, code: 'upstream' } }, 'server', /every Gemini key failed/i],
    [{ status: 401, payload: { ok: false, code: 'unauthorized' } }, 'server', /FIREBASE_PROJECT_ID/],
    [{ status: 429, payload: { ok: false, code: 'quota-exceeded', used: 21, limit: 20, resetIn: 3600, anonymous: true } }, 'quota', /allowance is used up/i]
];
for (const [reply, stage, re] of cases) {
    await sw.evaluate(() => chrome.storage.local.remove(['vm_ai_cache', 'vm_ai_quota']));
    await installStub(reply);
    d = await diagnose();
    check(d.stage === stage && re.test(d.message),
        `${reply.payload.code} is diagnosed distinctly`, `${d.stage}: ${d.message}`);
}

// A personal key is tested on its own path, never through the proxy.
await sw.evaluate(async () => {
    await chrome.storage.local.set({ geminiApiKey: 'AIzaPersonalKey' });
    await chrome.storage.local.remove(['vm_ai_cache']);
});
await installStub({ status: 200, used: 1, limit: 20 });
d = await diagnose();
check(d.ok && d.stage === 'own-key' && /your own API key/i.test(d.message),
    'a personal key is diagnosed on its own path', JSON.stringify(d));
await sw.evaluate(() => chrome.storage.local.remove(['geminiApiKey']));

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) { console.log('\n=== FAIL ==='); fail.forEach(l => console.log('  -', l)); }
console.log(`\n${ok.length} passed, ${fail.length} failed`);

await ctx.close();
server.close();
process.exit(fail.length ? 1 : 0);
