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
import { verifyIdToken } from '../api/_lib/verify.js';

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
