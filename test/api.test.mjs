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
import { signUploadParams, uploadTarget, signatureAlgorithm } from '../api/_lib/cloudinary.js';
import { slugify } from '../api/_lib/slug.js';

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
