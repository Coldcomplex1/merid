// Unit tests for the AI proxy's server-side pieces.
//
// These are the parts that decide who gets served, from which model, and how
// often - the places where a mistake either leaks Merid's quota or wrongly
// locks a reader out.
import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

import { todayKey, secondsUntilReset } from '../api/_lib/quota.js';
import { _internal as gem } from '../api/_lib/gemini.js';
import { _internal as qw } from '../api/_lib/qwen.js';
import { _internal as ai, generate as aiGenerate } from '../api/_lib/ai.js';
import { verifyIdToken } from '../api/_lib/verify.js';
import { signUploadParams, uploadTarget, signatureAlgorithm } from '../api/_lib/cloudinary.js';
import { slugify } from '../api/_lib/slug.js';
import { readJsonBody } from '../api/_lib/http.js';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Model ranking
// ---------------------------------------------------------------------------
const rank = (names) => names.slice().sort((a, b) => gem.score(b) - gem.score(a));

test('non-text models are rejected outright', () => {
    for (const name of [
        'gemini-2.5-flash-tts', 'gemini-3-pro-image', 'gemini-embedding-1',
        'imagen-4.0-generate', 'gemini-2.5-flash-image', 'veo-3.0-generate',
        'gemini-live-2.5-flash', 'gemini-2.5-computer-use-preview',
        'gemini-2.5-flash-native-audio', 'nano-banana-2'
    ]) {
        assert.ok(gem.score(name) < 0, `${name} must not be usable for a text verdict`);
    }
});

test('text models are accepted', () => {
    for (const name of [
        'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro'
    ]) {
        assert.ok(gem.score(name) > 0, `${name} should be usable`);
    }
});

test('flash-lite outranks flash, which outranks pro', () => {
    // On the free tier the lite tier carries ~25x the daily request allowance
    // (500/day vs 20/day), which is what decides how many readers get served.
    assert.ok(gem.score('gemini-3.1-flash-lite') > gem.score('gemini-3.1-flash'));
    assert.ok(gem.score('gemini-3.1-flash') > gem.score('gemini-3.1-pro'));
});

test('a newer version wins inside a tier', () => {
    assert.ok(gem.score('gemini-3.5-flash-lite') > gem.score('gemini-2.5-flash-lite'));
    assert.ok(gem.score('gemini-3.6-flash') > gem.score('gemini-2.5-flash'));
});

test('the full model list ranks the way the quota table says it should', () => {
    const best = rank([
        'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash',
        'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.5-flash-lite',
        'gemini-3.6-flash', 'gemini-2.5-pro', 'gemini-3.1-pro',
        'gemini-2.5-flash-tts', 'gemini-embedding-2'
    ]);
    assert.strictEqual(best[0], 'gemini-3.5-flash-lite', 'newest lite tier first');
    assert.strictEqual(best[1], 'gemini-3.1-flash-lite');
    assert.ok(best.indexOf('gemini-3.6-flash') < best.indexOf('gemini-2.5-pro'));
    // Non-text models sort last because their score is negative.
    assert.ok(best.indexOf('gemini-2.5-flash-tts') > best.indexOf('gemini-2.5-pro'));
});

test('a bare -latest alias edges out an equally ranked fixed id', () => {
    assert.ok(gem.score('gemini-flash-lite-latest') > gem.score('gemini-flash-lite'));
});

test('keyId never exposes the key', () => {
    const key = 'AIzaSyDSECRETVALUE1234567890abcdef';
    const id = gem.keyId(key);
    assert.strictEqual(id.length, 6);
    assert.ok(key.endsWith(id));
    assert.ok(!id.includes('SECRET'));
});

// ---------------------------------------------------------------------------
// Qwen model ranking
//
// Same job as the Gemini ranking above, different economics. Every model in the
// Model Studio quota table carries its own free-token grant, so walking across
// models is how the free capacity is actually spent - and the walk should start
// at the tier that can do this job for the least, which is flash.
// ---------------------------------------------------------------------------
const qrank = (names) => names.slice().filter(n => qw.score(n) > 0).sort((a, b) => qw.score(b) - qw.score(a));

test('qwen: models that cannot answer a text question are rejected', () => {
    for (const name of [
        'qwen-vl-max', 'qwen3-asr-flash', 'qwen3-omni-flash', 'qwen-tts-latest',
        'qwen3-coder-plus', 'qwen-math-plus', 'qwen3-embedding-v1', 'qwen-mt-plus',
        'qwen-image-edit', 'qwen3-rerank-v1'
    ]) {
        assert.ok(qw.score(name) < 0, `${name} should be rejected`);
    }
});

test('qwen: a thinking variant is rejected, because JSON mode and thinking are exclusive', () => {
    // Model Studio refuses structured output while thinking is on, and this
    // endpoint asks for nothing but structured output.
    assert.ok(qw.score('qwen3.7-max-thinking') < 0);
    assert.ok(qw.score('qwen3.7-max') > 0);
});

test('qwen: the pool is Qwen only - deepseek and glm on the same account are not ranked', () => {
    // They are perfectly good models. They are just not what _lib/qwen.js
    // claims to be reporting when it says which model answered.
    for (const name of ['deepseek-v4-flash', 'deepseek-v3.2', 'glm-5.2', 'wan2.2-kf2v-flash', 'text-embedding-v4']) {
        assert.ok(qw.score(name) < 0, `${name} should not be in the Qwen pool`);
    }
});

test('qwen: flash outranks plus outranks max', () => {
    assert.ok(qw.score('qwen3.7-flash') > qw.score('qwen3.7-plus'));
    assert.ok(qw.score('qwen3.7-plus') > qw.score('qwen3.7-max'));
});

test('qwen: a newer version wins inside a tier', () => {
    assert.ok(qw.score('qwen3.7-flash') > qw.score('qwen3.6-flash'));
    assert.ok(qw.score('qwen3.8-max') > qw.score('qwen3.7-max'));
    // ...and by enough that a newer model's snapshot still beats an older alias.
    assert.ok(qw.score('qwen3.7-flash-2026-07-15') > qw.score('qwen3.6-flash'));
});

test('qwen: an alias edges out its own dated snapshot, but the snapshot stays', () => {
    // The snapshot is the same model with a separate free-token grant, which
    // makes it fallback capacity rather than a duplicate to drop.
    assert.ok(qw.score('qwen3.7-max') > qw.score('qwen3.7-max-2026-06-08'));
    assert.ok(qw.score('qwen3.7-max-2026-06-08') > 0);
    assert.ok(qw.score('qwen3.7-max') > qw.score('qwen3.7-max-preview'));
});

test('qwen: a versioned model outranks the bare alias that has no version', () => {
    assert.ok(qw.score('qwen3.7-plus') > qw.score('qwen-plus'));
    assert.ok(qw.score('qwen-plus-latest') > qw.score('qwen-plus'));
});

test('qwen: the real console listing ranks flash first and max last', () => {
    // Verbatim from the account's quota table, so this test says what the pool
    // will actually do rather than what score() does in the abstract.
    const listing = [
        'qwen3.8-max', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v3.2',
        'qwen3.7-plus', 'qwen3.7-plus-2026-05-26', 'glm-5.2', 'glm-5.1',
        'qwen3.7-flash', 'qwen3.7-flash-2026-07-15', 'qwen3.7-max',
        'qwen3.7-max-2026-06-08', 'qwen3.7-max-preview', 'qwen3.6-flash',
        'qwen3.6-plus', 'wan2.2-kf2v-flash', 'qwen3.5-flash', 'qwen3.5-plus',
        'qwen3.6-max-preview', 'qwen-plus', 'qwen-plus-latest',
        'qwen3.6-27b', 'qwen3.5-397b-a17b'
    ];
    const best = qrank(listing);

    assert.strictEqual(best[0], 'qwen3.7-flash', 'newest flash first');
    assert.ok(best.indexOf('qwen3.6-flash') < best.indexOf('qwen3.7-plus'), 'any flash before any plus');
    assert.ok(best.indexOf('qwen3.7-plus') < best.indexOf('qwen3.8-max'), 'plus before max');
    for (const excluded of ['deepseek-v4-flash', 'glm-5.2', 'wan2.2-kf2v-flash']) {
        assert.ok(!best.includes(excluded), `${excluded} should not be in the pool`);
    }
});

test('qwen: keyId never exposes the key', () => {
    const key = 'sk-SECRETVALUE1234567890abcdef';
    const id = qw.keyId(key);
    assert.strictEqual(id.length, 6);
    assert.ok(key.endsWith(id));
    assert.ok(!id.includes('SECRET'));
});

test('qwen: the base url defaults to the international endpoint', () => {
    // A key minted on one console is a 401 on the other, so this default is the
    // difference between "works" and "nothing works" for a Singapore account.
    const before = process.env.QWEN_BASE_URL;
    delete process.env.QWEN_BASE_URL;
    try {
        assert.strictEqual(qw.baseUrl(), 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
        process.env.QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/';
        assert.strictEqual(qw.baseUrl(), 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    } finally {
        if (before === undefined) delete process.env.QWEN_BASE_URL;
        else process.env.QWEN_BASE_URL = before;
    }
});

test('qwen: the JSON envelope carries the literal word json', () => {
    // Not cosmetic. Model Studio rejects response_format json_object outright
    // when the messages do not contain the word, and the failure is a 400 with
    // nothing in it that points here.
    // Lowercase specifically - the check is for a literal word and there is no
    // guarantee it is case-insensitive.
    assert.ok(qw.JSON_ENVELOPE.includes('json'));
    assert.ok(qw.JSON_ENVELOPE.includes('"items"'));
});

// ---------------------------------------------------------------------------
// Provider order and response parsing
// ---------------------------------------------------------------------------
// Async on purpose. A synchronous version restores the environment the moment
// fn() hands back its promise, which is before the provider walk has got past
// its first await - so the second provider reads an environment that has
// already been torn down and looks unconfigured. That failure mode is invisible
// except as "the fallback never fired".
async function withEnv(vars, fn) {
    const before = {};
    for (const [k, v] of Object.entries(vars)) {
        before[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        return await fn();
    } finally {
        for (const [k, v] of Object.entries(before)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

test('providers: qwen comes first by default', async () => {
    await withEnv({ MERID_AI_PROVIDERS: undefined }, () => {
        assert.deepStrictEqual(ai.providerOrder(), ['qwen', 'gemini']);
    });
});

test('providers: the order is one environment variable away', async () => {
    // The rollback lever: if Qwen misbehaves this is a dashboard edit and the
    // next request, not a revert and a deploy.
    await withEnv({ MERID_AI_PROVIDERS: 'gemini' }, () => {
        assert.deepStrictEqual(ai.providerOrder(), ['gemini']);
    });
    await withEnv({ MERID_AI_PROVIDERS: 'gemini, qwen' }, () => {
        assert.deepStrictEqual(ai.providerOrder(), ['gemini', 'qwen']);
    });
});

test('providers: a typo costs one provider, not the endpoint', async () => {
    await withEnv({ MERID_AI_PROVIDERS: 'qwenn,gemini' }, () => {
        assert.deepStrictEqual(ai.providerOrder(), ['gemini']);
    });
    await withEnv({ MERID_AI_PROVIDERS: 'nonsense' }, () => {
        assert.deepStrictEqual(ai.providerOrder(), ['qwen', 'gemini']);
    });
});

test('parseVerdictArray: a bare array is passed through', () => {
    assert.deepStrictEqual(ai.parseVerdictArray('[{"i":1,"ok":true}]'), [{ i: 1, ok: true }]);
});

test('parseVerdictArray: the {"items": [...]} wrapper qwen must use is unwrapped', () => {
    // Model Studio's JSON mode cannot return a bare array, so this is not an
    // edge case - it is the shape every Qwen answer arrives in.
    assert.deepStrictEqual(ai.parseVerdictArray('{"items":[{"i":1,"ok":false}]}'), [{ i: 1, ok: false }]);
    assert.deepStrictEqual(ai.parseVerdictArray('{"results":[{"i":2,"ok":true}]}'), [{ i: 2, ok: true }]);
});

test('parseVerdictArray: a markdown fence no longer costs the whole batch', () => {
    assert.deepStrictEqual(ai.parseVerdictArray('```json\n[{"i":1,"ok":true}]\n```'), [{ i: 1, ok: true }]);
    assert.deepStrictEqual(ai.parseVerdictArray('```\n{"items":[{"i":1,"ok":true}]}\n```'), [{ i: 1, ok: true }]);
});

test('parseVerdictArray: nothing usable is null, never a partial answer', () => {
    for (const bad of ['', 'sorry, I cannot help', '{"i":1}', 'null', '42', undefined]) {
        assert.strictEqual(ai.parseVerdictArray(bad), null, `${bad} should not parse`);
    }
});

// ---------------------------------------------------------------------------
// Provider failover
// ---------------------------------------------------------------------------
test('failover: qwen answering means gemini is never called', async () => {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        calls.push(String(url));
        if (String(url).includes('/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'qwen3.7-flash' }] }), { status: 200 });
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: '{"items":[{"i":1,"ok":true}]}' } }]
        }), { status: 200 });
    };
    try {
        const out = await withEnv(
            { QWEN_API_KEYS: 'sk-testkeyaaaaaa', GEMINI_API_KEYS: 'AIzaTESTbbbbbb', MERID_AI_PROVIDERS: undefined },
            () => aiGenerate({ prompt: 'p', maxOutputTokens: 64, schema: {}, seed: 'u1' })
        );
        assert.strictEqual(out.ok, true);
        assert.strictEqual(out.provider, 'qwen');
        assert.strictEqual(out.model, 'qwen3.7-flash');
        assert.deepStrictEqual(ai.parseVerdictArray(out.text), [{ i: 1, ok: true }]);
        assert.ok(!calls.some(u => u.includes('generativelanguage')), 'gemini must not be touched');
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('failover: qwen out of quota falls through to gemini rather than 502ing', async () => {
    // Model Studio reports an exhausted allowance as 400, not 429, which is why
    // 400 is retryable in _lib/qwen.js. Get that wrong and the pool gives up on
    // its first spent model.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('dashscope') && u.includes('/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'qwen3.7-flash' }, { id: 'qwen3.6-flash' }] }), { status: 200 });
        }
        if (u.includes('dashscope')) {
            return new Response(JSON.stringify({ message: 'AllocationQuota.Exhausted' }), { status: 400 });
        }
        if (u.includes('generativelanguage') && u.includes('/models?')) {
            return new Response(JSON.stringify({
                models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }]
            }), { status: 200 });
        }
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: '[{"i":1,"ok":true}]' }] } }]
        }), { status: 200 });
    };
    try {
        const out = await withEnv(
            { QWEN_API_KEYS: 'sk-spentkeyccccc', GEMINI_API_KEYS: 'AIzaTESTdddddd', QWEN_MODELS: undefined, MERID_AI_PROVIDERS: undefined },
            () => aiGenerate({ prompt: 'p', maxOutputTokens: 64, schema: {}, seed: 'u2' })
        );
        assert.strictEqual(out.ok, true, 'gemini should have answered');
        assert.strictEqual(out.provider, 'gemini');
        assert.strictEqual(out.model, 'gemini-3.5-flash-lite');
        assert.ok(out.attempts > 1, 'the qwen attempts should be counted too');
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('failover: a provider with no keys is skipped, not failed', async () => {
    // A deploy that only ever set GEMINI_API_KEYS must behave exactly as it did
    // before Qwen existed, and must not see a Qwen error it never asked for.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        const u = String(url);
        assert.ok(!u.includes('dashscope'), 'an unconfigured provider must not be called');
        if (u.includes('/models?')) {
            return new Response(JSON.stringify({
                models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }]
            }), { status: 200 });
        }
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: '[]' }] } }]
        }), { status: 200 });
    };
    try {
        const out = await withEnv(
            { QWEN_API_KEYS: undefined, GEMINI_API_KEYS: 'AIzaTESTeeeeee', MERID_AI_PROVIDERS: undefined },
            () => aiGenerate({ prompt: 'p', maxOutputTokens: 64, schema: {}, seed: 'u3' })
        );
        assert.strictEqual(out.ok, true);
        assert.strictEqual(out.provider, 'gemini');
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('failover: no provider configured at all still says so plainly', async () => {
    const out = await withEnv(
        { QWEN_API_KEYS: undefined, GEMINI_API_KEYS: undefined, MERID_AI_PROVIDERS: undefined },
        () => aiGenerate({ prompt: 'p', maxOutputTokens: 64, schema: {}, seed: 'u4' })
    );
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.status, 500);
    assert.strictEqual(out.detail, 'no-keys-configured');
});

// ---------------------------------------------------------------------------
// Quota windows
// ---------------------------------------------------------------------------
test('the day key is UTC, so everyone resets at the same moment', () => {
    // 23:30 in UTC+7 on the 2nd is still the 1st in UTC.
    assert.strictEqual(todayKey(Date.parse('2026-08-01T23:30:00Z')), '2026-08-01');
    assert.strictEqual(todayKey(Date.parse('2026-08-02T00:30:00Z')), '2026-08-02');
});

test('the TTL runs to the next UTC midnight and never goes negative', () => {
    const justBefore = Date.parse('2026-08-01T23:59:00Z');
    assert.ok(secondsUntilReset(justBefore) <= 60 + 1);
    assert.ok(secondsUntilReset(justBefore) >= 60, 'a floor stops a near-zero TTL');

    const justAfter = Date.parse('2026-08-01T00:00:01Z');
    assert.ok(secondsUntilReset(justAfter) > 86000 && secondsUntilReset(justAfter) <= 86400);

    for (const t of [0, Date.now(), Date.parse('2026-12-31T23:59:59Z')]) {
        assert.ok(secondsUntilReset(t) > 0);
    }
});

test('the last second of a year rolls into the next one', () => {
    assert.strictEqual(todayKey(Date.parse('2026-12-31T23:59:59Z')), '2026-12-31');
    const ttl = secondsUntilReset(Date.parse('2026-12-31T23:59:59Z'));
    assert.ok(ttl > 0 && ttl <= 86400);
});

// ---------------------------------------------------------------------------
// Token verification
//
// A real Firebase token is signed by Google, so these build tokens with a
// throwaway key pair and point the verifier at a stubbed cert endpoint. That
// is the only way to prove the signature check actually rejects a forgery.
// ---------------------------------------------------------------------------
const PROJECT = 'merid-test';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const CERT_PEM = publicKey.export({ type: 'spki', format: 'pem' });

const b64url = (buf) => Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makeToken(claims, { key = privateKey, kid = KID, alg = 'RS256' } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
    const payload = b64url(JSON.stringify(Object.assign({
        aud: PROJECT,
        iss: `https://securetoken.google.com/${PROJECT}`,
        sub: 'uid-123',
        iat: now,
        auth_time: now,
        exp: now + 3600,
        firebase: { sign_in_provider: 'anonymous' }
    }, claims)));
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), key);
    return `${header}.${payload}.${b64url(sig)}`;
}

// Serve our throwaway certificate in place of Google's.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
    if (String(url).includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ [KID]: CERT_PEM }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' }
        });
    }
    return realFetch(url);
};

test('a well-formed token is accepted and its identity returned', async () => {
    const claims = await verifyIdToken(makeToken({}), PROJECT);
    assert.strictEqual(claims.uid, 'uid-123');
    assert.strictEqual(claims.provider, 'anonymous');
});

test('a signed-in provider is distinguished from an anonymous one', async () => {
    const t = makeToken({ firebase: { sign_in_provider: 'password' }, email: 'a@b.c' });
    const claims = await verifyIdToken(t, PROJECT);
    assert.strictEqual(claims.provider, 'password');
    assert.strictEqual(claims.email, 'a@b.c');
});

test('a token signed by the wrong key is rejected', async () => {
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await assert.rejects(
        () => verifyIdToken(makeToken({}, { key: other }), PROJECT),
        (e) => e.code === 'bad-signature');
});

test('a token for another Firebase project is rejected', async () => {
    await assert.rejects(
        () => verifyIdToken(makeToken({ aud: 'someone-else' }), PROJECT),
        (e) => e.code === 'bad-audience');
    await assert.rejects(
        () => verifyIdToken(makeToken({ iss: 'https://evil.example/' }), PROJECT),
        (e) => e.code === 'bad-issuer');
});

test('an expired token is rejected', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    await assert.rejects(
        () => verifyIdToken(makeToken({ exp: past }), PROJECT),
        (e) => e.code === 'expired');
});

test('"alg: none" and unknown key ids are rejected', async () => {
    // The classic JWT forgery: swap the algorithm so no signature is needed.
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'none', kid: KID }));
    const payload = b64url(JSON.stringify({
        aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`,
        sub: 'attacker', iat: now, auth_time: now, exp: now + 3600
    }));
    await assert.rejects(() => verifyIdToken(`${header}.${payload}.`, PROJECT),
        (e) => e.code === 'bad-alg');

    await assert.rejects(
        () => verifyIdToken(makeToken({}, { kid: 'not-a-real-kid' }), PROJECT),
        (e) => e.code === 'unknown-kid');
});

test('junk in the Authorization header is rejected without throwing', async () => {
    for (const bad of ['', 'not-a-token', 'a.b', 'a.b.c.d', '...', null, undefined, 42]) {
        await assert.rejects(() => verifyIdToken(bad, PROJECT), (e) => !!e.code);
    }
});

test('a token with no subject is rejected', async () => {
    await assert.rejects(
        () => verifyIdToken(makeToken({ sub: '' }), PROJECT),
        (e) => e.code === 'no-subject');
});

// ---------------------------------------------------------------------------
// Cloudinary upload signatures
//
// The signature is the whole security boundary for image upload: it is what
// lets the api_secret stay on the server while the browser still uploads
// directly. Getting the string-to-sign wrong fails closed (Cloudinary rejects
// it), but getting the *scope* wrong fails open, so the destination parameters
// are pinned here too.
// ---------------------------------------------------------------------------

test("the signature matches Cloudinary's own documented example", () => {
    // From cloudinary.com/documentation/authentication_signatures: signing
    // "public_id=sample_image&timestamp=1315060510" with the secret "abcd".
    // A golden vector from the vendor beats any amount of self-consistent
    // testing, because it catches a wrong algorithm rather than a wrong call.
    assert.equal(
        signUploadParams({ public_id: 'sample_image', timestamp: 1315060510 }, 'abcd'),
        'b4ad47fb4e25c7bf5f92a20089f9db59bc302313');
});

test('parameters Cloudinary never signs are excluded, and order does not matter', () => {
    const expected = 'b4ad47fb4e25c7bf5f92a20089f9db59bc302313';

    // Same two signed parameters, declared last, surrounded by the four
    // Cloudinary leaves out of the string-to-sign.
    assert.equal(
        signUploadParams({
            file: 'blob:whatever',
            cloud_name: 'merid',
            resource_type: 'image',
            api_key: '123456789',
            timestamp: 1315060510,
            public_id: 'sample_image',
        }, 'abcd'),
        expected);
});

test('empty values are dropped rather than signed as an empty pair', () => {
    // Cloudinary omits absent parameters from its own string-to-sign, so
    // signing "folder=" here would produce a signature the server disagrees
    // with - and an upload button that always fails.
    assert.equal(
        signUploadParams({ public_id: 'sample_image', timestamp: 1315060510, folder: '' }, 'abcd'),
        signUploadParams({ public_id: 'sample_image', timestamp: 1315060510 }, 'abcd'));
});

test('a different secret produces a different signature', () => {
    assert.notEqual(
        signUploadParams({ public_id: 'x', timestamp: 1 }, 'abcd'),
        signUploadParams({ public_id: 'x', timestamp: 1 }, 'abce'));
});

test('signing without a secret throws instead of producing a usable signature', () => {
    // A missing env var must not degrade into a signature computed against the
    // empty string, which would be a valid-looking value that never works.
    assert.throws(() => signUploadParams({ timestamp: 1 }, ''), /missing-api-secret/);
    assert.throws(() => signUploadParams({ timestamp: 1 }, undefined), /missing-api-secret/);
});

test('the upload destination is derived server-side, not taken from the caller', () => {
    const now = Date.UTC(2026, 7, 8);

    // A caller trying to escape the blog folder gets slugified, not obeyed:
    // the traversal collapses into an ordinary name.
    const escape = uploadTarget('../../../etc/passwd.png', slugify, now);
    assert.equal(escape.folder, 'blog/2026');
    assert.ok(!escape.publicId.includes('/'), 'public_id must not contain a path separator');
    assert.ok(!escape.publicId.includes('..'), 'public_id must not contain a traversal');

    // A name that slugifies to nothing still yields a usable id.
    assert.match(uploadTarget('???.png', slugify, now).publicId, /^image-/);
    assert.match(uploadTarget('', slugify, now).publicId, /^image-/);

    // The year comes from the clock, so January uploads do not land in last
    // year's folder.
    assert.equal(uploadTarget('a.png', slugify, Date.UTC(2027, 0, 1)).folder, 'blog/2027');
});

test('re-uploading the same filename never reuses the same public_id', () => {
    // Cached URLs are immutable by design: the same name at a later moment must
    // become a new asset, or a corrected image silently serves the old bytes.
    const first = uploadTarget('cover.png', slugify, 1_000_000);
    const second = uploadTarget('cover.png', slugify, 2_000_000);
    assert.notEqual(first.publicId, second.publicId);
    assert.match(first.publicId, /^cover-/);
});

test('the signature hash follows the account, and defaults to Cloudinary\'s own default', () => {
    // SHA-1 is what a standard account expects. Defaulting to SHA-256 would be
    // the stronger-sounding choice and would break every upload until the
    // account owner asked Cloudinary to switch.
    assert.equal(signatureAlgorithm({}), 'sha1');
    assert.equal(signatureAlgorithm({ CLOUDINARY_SIGNATURE_ALGORITHM: 'sha256' }), 'sha256');
    assert.equal(signatureAlgorithm({ CLOUDINARY_SIGNATURE_ALGORITHM: 'SHA256' }), 'sha256');

    // The default still reproduces the vendor's documented vector.
    assert.equal(
        signUploadParams({ public_id: 'sample_image', timestamp: 1315060510 }, 'abcd',
            signatureAlgorithm({})),
        'b4ad47fb4e25c7bf5f92a20089f9db59bc302313');
});

test('an unrecognised hash is refused rather than silently downgraded', () => {
    // Falling back to sha1 on a typo would produce signatures Cloudinary
    // rejects, with nothing pointing at the misspelt variable as the cause.
    assert.throws(() => signatureAlgorithm({ CLOUDINARY_SIGNATURE_ALGORITHM: 'md5' }),
        /bad-signature-algorithm:md5/);
    assert.throws(() => signatureAlgorithm({ CLOUDINARY_SIGNATURE_ALGORITHM: 'sha-256' }),
        /bad-signature-algorithm/);
    assert.throws(() => signUploadParams({ timestamp: 1 }, 'secret', 'md5'),
        /bad-signature-algorithm:md5/);
});

test('sha256 produces a different, longer signature than sha1', () => {
    const params = { public_id: 'sample_image', timestamp: 1315060510 };
    const one = signUploadParams(params, 'abcd', 'sha1');
    const two = signUploadParams(params, 'abcd', 'sha256');
    assert.equal(one.length, 40);
    assert.equal(two.length, 64);
    assert.notEqual(one, two);
});

// ---------------------------------------------------------------------------
// Request body reading
//
// This is the shape of a bug that does not fail, it hangs: read the stream on
// a body the runtime already parsed and the request never answers, leaving the
// admin's upload button spinning forever with no error to show. Each runtime
// shape gets a test because "handle one and assume the rest" is exactly how
// that shipped.
// ---------------------------------------------------------------------------

/** A request whose stream has already been consumed - 'end' fired long ago. */
function endedStreamRequest(body) {
    const req = new EventEmitter();
    req.body = body;
    // Nothing will ever emit again. A reader that listens here waits forever.
    return req;
}

test('a body Vercel already parsed is used as-is, without touching the stream', async () => {
    // The regression: this must resolve. Before the fix it hung, because the
    // reader iterated a stream that had already ended.
    const parsed = await readJsonBody(endedStreamRequest({ filename: 'cover.png' }));
    assert.deepEqual(parsed, { filename: 'cover.png' });
});

test('a body handed over as a string or Buffer is parsed', async () => {
    assert.deepEqual(
        await readJsonBody(endedStreamRequest('{"filename":"a.png"}')),
        { filename: 'a.png' });
    assert.deepEqual(
        await readJsonBody(endedStreamRequest(Buffer.from('{"filename":"b.png"}'))),
        { filename: 'b.png' });
});

test('an unparsed body is read off the stream', async () => {
    const req = new EventEmitter();
    const promise = readJsonBody(req);
    req.emit('data', '{"filename":');
    req.emit('data', '"c.png"}');
    req.emit('end');
    assert.deepEqual(await promise, { filename: 'c.png' });
});

test('an empty body is an empty object, not a crash', async () => {
    assert.deepEqual(await readJsonBody(endedStreamRequest('')), {});
    assert.deepEqual(await readJsonBody(endedStreamRequest('   ')), {});
});

test('a dead stream times out instead of waiting forever', async () => {
    // No parsed body and a stream that will never emit again: the runtime shape
    // that hung production. It must end in an error the caller can act on, not
    // in a promise nobody ever settles. Short timeout so the suite stays fast;
    // the default is ten seconds.
    await assert.rejects(
        () => readJsonBody(endedStreamRequest(undefined), 50),
        (e) => e.code === 'body-read-timeout');
});

test('the upload endpoint survives an unreadable body rather than hanging on it', async () => {
    // Degrading to a generic filename beats a spinner that never stops. The
    // endpoint catches body failures for exactly this reason.
    const { default: handler } = await import('../api/blog-upload-signature.js');

    // The endpoint checks its configuration before anything else, so give it a
    // complete one; otherwise this asserts the config guard, not the body read.
    const saved = { ...process.env };
    process.env.FIREBASE_PROJECT_ID = 'merid-49dd5';
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';

    const res = {
        code: 0, body: null, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.code = c; return this; },
        send(b) { this.body = b; return this; },
    };
    const req = endedStreamRequest(undefined);
    req.method = 'POST';
    req.headers = {};
    try {
        await handler(req, res);
    } finally {
        process.env = saved;
    }
    // Rejected on the token, having never blocked on the body.
    assert.equal(res.code, 401);
    assert.match(String(res.body), /unauthorized/);
});

test('a non-object JSON body does not masquerade as one', async () => {
    // "null" and "42" parse fine but must not reach a caller expecting fields.
    assert.deepEqual(await readJsonBody(endedStreamRequest('null')), {});
    assert.deepEqual(await readJsonBody(endedStreamRequest('42')), {});
});

test('malformed JSON rejects rather than resolving to something wrong', async () => {
    await assert.rejects(() => readJsonBody(endedStreamRequest('{not json')));
});

test('a stream error rejects instead of hanging', async () => {
    const req = new EventEmitter();
    const promise = readJsonBody(req);
    req.emit('error', new Error('socket-died'));
    await assert.rejects(() => promise, /socket-died/);
});

test('configuration values are trimmed, so an invisible newline cannot break uploads', async () => {
    // The failure this prevents: Cloudinary answers "Invalid cloud_name
    // jcklpfxz" for a value that really is "jcklpfxz\n". The name in the error
    // looks correct, so the evidence points away from the actual cause.
    const { default: handler } = await import('../api/blog-upload-signature.js');
    const saved = { ...process.env };
    process.env.FIREBASE_PROJECT_ID = 'merid-49dd5';
    process.env.CLOUDINARY_CLOUD_NAME = '  jcklpfxz\n';
    process.env.CLOUDINARY_API_KEY = ' key ';
    process.env.CLOUDINARY_API_SECRET = '\tsecret\n';

    const res = {
        code: 0, body: null, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.code = c; return this; },
        send(b) { this.body = b; return this; },
    };
    try {
        await handler({ method: 'POST', headers: { authorization: 'Bearer a.b.c' } }, res);
    } finally {
        process.env = saved;
    }

    // Padding trimmed away, so it got past configuration and failed on the
    // token instead - which is the only thing wrong with this request.
    assert.equal(res.code, 401);
});

test('a cloud name that cannot be one is named here, not blamed on Cloudinary', async () => {
    const { default: handler } = await import('../api/blog-upload-signature.js');
    const saved = { ...process.env };
    process.env.FIREBASE_PROJECT_ID = 'merid-49dd5';
    process.env.CLOUDINARY_CLOUD_NAME = '"jcklpfxz"';   // quotes kept by Vercel
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';

    const res = {
        code: 0, body: null, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.code = c; return this; },
        send(b) { this.body = b; return this; },
    };
    try {
        await handler({ method: 'POST', headers: { authorization: 'Bearer a.b.c' } }, res);
    } finally {
        process.env = saved;
    }

    assert.equal(res.code, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.reason, 'cloud-name-invalid');
    // Quoted in the reply so the stray characters are visible rather than guessed.
    assert.match(body.cloudName, /\\"jcklpfxz\\"/);
});
