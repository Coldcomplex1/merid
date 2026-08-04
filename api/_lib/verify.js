// Firebase ID token verification, dependency-free.
//
// Deliberately does NOT use firebase-admin: it needs a service-account secret,
// pulls in a large dependency tree, and all we need here is "is this a real
// token from our project, and whose is it". Verifying the RS256 signature
// against Google's published certificates gives exactly that.
//
// Google's docs for this flow:
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
import crypto from 'node:crypto';

const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// Certificates rotate roughly daily and the response carries a max-age. Cache
// them across warm invocations so a normal request does no extra round trip.
let certCache = { certs: null, expiresAt: 0 };

async function getCerts() {
  const now = Date.now();
  if (certCache.certs && now < certCache.expiresAt) return certCache.certs;

  const resp = await fetch(CERT_URL);
  if (!resp.ok) throw new Error('cert-fetch-failed');
  const certs = await resp.json();

  // Honour Google's own cache lifetime, with a floor so a missing/odd header
  // cannot turn this into a fetch on every single request.
  const cc = resp.headers.get('cache-control') || '';
  const maxAge = Number((cc.match(/max-age=(\d+)/) || [])[1]) || 3600;
  certCache = { certs, expiresAt: now + Math.max(300, maxAge) * 1000 };
  return certs;
}

function b64urlToBuffer(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeSegment(seg) {
  return JSON.parse(b64urlToBuffer(seg).toString('utf8'));
}

/**
 * Verify a Firebase ID token and return its claims.
 *
 * @param {string} token
 * @param {string} projectId
 * @returns {Promise<{uid:string, provider:string, email:string|null}>}
 * @throws {Error} with a short `code` describing what was wrong
 */
export async function verifyIdToken(token, projectId) {
  const err = (code) => Object.assign(new Error(code), { code });

  if (typeof token !== 'string' || !token) throw err('no-token');
  const parts = token.split('.');
  if (parts.length !== 3) throw err('malformed-token');

  let header, payload;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch (e) {
    throw err('malformed-token');
  }

  if (header.alg !== 'RS256') throw err('bad-alg');
  if (!header.kid) throw err('no-kid');

  // Claim checks BEFORE the signature check are cheap and reject the bulk of
  // junk without touching the cert endpoint; the signature check below is what
  // actually makes any of them trustworthy.
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw err('bad-audience');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw err('bad-issuer');
  if (!payload.sub || typeof payload.sub !== 'string') throw err('no-subject');
  if (!(payload.exp > now)) throw err('expired');
  if (!(payload.iat <= now + 60)) throw err('issued-in-future');
  if (!(payload.auth_time <= now + 60)) throw err('bad-auth-time');

  const certs = await getCerts();
  const cert = certs[header.kid];
  if (!cert) throw err('unknown-kid');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(cert, b64urlToBuffer(parts[2]))) throw err('bad-signature');

  return {
    uid: payload.sub,
    provider: (payload.firebase && payload.firebase.sign_in_provider) || 'unknown',
    email: payload.email || null
  };
}
