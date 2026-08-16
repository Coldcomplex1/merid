// Drive the REAL api/check.js handler end to end: real provider keys, a local
// stand-in for Upstash, and a properly signed token verified against a stubbed
// cert endpoint. Everything except the network hop to Vercel is the real thing.
//
// MANUAL - not part of `npm test` or CI. It needs live keys and spends real
// quota, so it stays opt-in:
//
//   # the default path - Qwen answers
//   QWEN_API_KEYS="sk-..." node test/manual/live-proxy.mjs
//
//   # the fallback on its own
//   MERID_AI_PROVIDERS=gemini GEMINI_API_KEYS="key1,key2" node test/manual/live-proxy.mjs
//
//   # failover: a deliberately wrong Qwen key must land on Gemini, not a 502
//   QWEN_API_KEYS="sk-wrong" GEMINI_API_KEYS="key1" node test/manual/live-proxy.mjs
//
// This is the only test that proves the deployed shape actually works: the
// handler, the prompt, model selection across the key pool, provider failover,
// the quota window and token verification, all against the real API rather
// than a stub. It also covers the three things about Model Studio that a stub
// cannot - that non-streaming calls need enable_thinking, that JSON mode needs
// the word "json" in the prompt, and that it answers with an object where
// Gemini answers with an array. Run it after changing anything in api/ and
// before trusting a deploy.
import http from 'node:http';
import crypto from 'node:crypto';

const PROJECT = 'merid-49dd5';
const KID = 'local-kid';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CERT_PEM = publicKey.export({ type: 'spki', format: 'pem' });

// ---- Upstash stand-in: just enough of the REST pipeline API ----
const store = new Map();
const redis = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
        const cmds = JSON.parse(body || '[]');
        const out = cmds.map(([op, key, arg]) => {
            if (op === 'INCR') { const v = (store.get(key) || 0) + 1; store.set(key, v); return { result: v }; }
            if (op === 'GET') return { result: store.has(key) ? String(store.get(key)) : null };
            if (op === 'EXPIRE') return { result: 1 };
            return { error: 'unsupported ' + op };
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
    });
});
await new Promise(r => redis.listen(0, '127.0.0.1', r));

process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${redis.address().port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'local';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.MERID_LIMIT_ANONYMOUS = '3';   // small, so the limit is reachable

// ---- Serve our cert where Google's would be; everything else is real ----
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
    if (String(u).includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ [KID]: CERT_PEM }), {
            status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' }
        });
    }
    return realFetch(u, o);
};

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function token(provider = 'anonymous', uid = 'local-uid-1') {
    const now = Math.floor(Date.now() / 1000);
    const h = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
    const p = b64url(JSON.stringify({
        aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: uid,
        iat: now, auth_time: now, exp: now + 3600, firebase: { sign_in_provider: provider }
    }));
    return `${h}.${p}.${b64url(crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey))}`;
}

// ---- Minimal Vercel-shaped req/res ----
function call(handler, { method = 'POST', auth, body, rawBody }) {
    const headers = { 'content-type': 'application/json' };
    if (auth) headers.authorization = auth;
    const req = { method, headers, body: rawBody !== undefined ? rawBody : body };
    let statusCode = 0, payload = '';
    const res = {
        setHeader() { },
        status(c) { statusCode = c; return res; },
        send(b) { payload = b; return res; },
        end(b) { payload = b || ''; return res; }
    };
    return handler(req, res).then(() => {
        let json = null;
        try { json = JSON.parse(payload); } catch (e) { }
        return { status: statusCode, json, raw: String(payload).slice(0, 200) };
    });
}

const { default: handler } = await import(new URL('../../api/check.js', import.meta.url).href);

const ITEMS = [
    { word: 'abolish', original: 'bãi bỏ', sentence: 'Chính phủ quyết định abolish quy định cũ.' },
    { word: 'cabinet', original: 'chính phủ', sentence: 'cabinet quyết định bãi bỏ quy định, đặt cạnh bồn rửa.' }
];

const results = [];
const t = (label, cond, extra = '') => results.push(`${cond ? '+' : '-'} ${label}${extra ? ' -> ' + extra : ''}`);

// 1. No token
let r = await call(handler, { body: { items: ITEMS } });
t('no token is rejected 401', r.status === 401 && r.json?.code === 'unauthorized', `${r.status} ${r.json?.code}`);

// 2. Wrong method
r = await call(handler, { method: 'GET', auth: 'Bearer ' + token(), body: {} });
t('GET is rejected 405', r.status === 405, String(r.status));

// 3. Empty items
r = await call(handler, { auth: 'Bearer ' + token(), body: { items: [] } });
t('empty batch is rejected 400', r.status === 400 && r.json?.code === 'no-items', `${r.status} ${r.json?.code}`);

// 4. THE REAL ONE: a signed anonymous user, real Gemini
r = await call(handler, { auth: 'Bearer ' + token(), body: { items: ITEMS } });
t('a real check returns verdicts', r.status === 200 && Array.isArray(r.json?.verdicts),
    `${r.status} ${JSON.stringify(r.json?.verdicts)} provider=${r.json?.provider} model=${r.json?.model}`);
t('the wrong-context word is caught', r.json?.verdicts?.[1] === 0,
    `verdicts=${JSON.stringify(r.json?.verdicts)} betters=${JSON.stringify(r.json?.betters)}`);
t('quota is reported back', r.json?.used === 1 && r.json?.limit === 3, `used=${r.json?.used}/${r.json?.limit}`);

// 5. Body arriving as a raw JSON STRING (some runtimes do not pre-parse)
r = await call(handler, { auth: 'Bearer ' + token('anonymous', 'string-body-uid'), rawBody: JSON.stringify({ items: ITEMS }) });
t('a string body is handled', r.status === 200, `${r.status} ${r.json?.code || ''}`);

// 6. Quota enforcement
for (let i = 0; i < 3; i++) await call(handler, { auth: 'Bearer ' + token(), body: { items: [ITEMS[0]] } });
r = await call(handler, { auth: 'Bearer ' + token(), body: { items: [ITEMS[0]] } });
t('the limit is enforced', r.status === 429 && r.json?.code === 'quota-exceeded',
    `${r.status} ${r.json?.code} used=${r.json?.used}/${r.json?.limit}`);
t('the reply says it was anonymous', r.json?.anonymous === true, String(r.json?.anonymous));

// 7. Signed-in gets the bigger allowance
r = await call(handler, { auth: 'Bearer ' + token('password', 'signed-in-uid'), body: { items: [ITEMS[0]] } });
t('a signed-in user gets the higher limit', r.status === 200 && r.json?.limit === 50,
    `${r.status} limit=${r.json?.limit}`);

// 8. Forged token
const bad = token().split('.'); bad[2] = b64url(Buffer.from('nope'));
r = await call(handler, { auth: 'Bearer ' + bad.join('.'), body: { items: ITEMS } });
t('a forged signature is rejected', r.status === 401, `${r.status} ${r.json?.reason}`);

console.log(results.join('\n'));
console.log(`\n${results.filter(x => x[0] === '+').length} passed, ${results.filter(x => x[0] === '-').length} failed`);
redis.close();
process.exit(results.some(x => x[0] === '-') ? 1 : 0);
