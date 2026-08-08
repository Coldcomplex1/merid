// POST /api/blog-upload-signature - authorise one blog image upload.
//
// The browser cannot upload to Cloudinary on its own, by design. It asks here
// first, proves it is a blog admin, and gets back a signature good for exactly
// one file at exactly one path. CLOUDINARY_API_SECRET stays in the server's
// environment and never reaches the bundle.
//
// This is the same authorisation boundary the Firebase Storage path had, with
// the same single definition of "admin": the existence of admins/{uid}. Nothing
// about who may publish moved into a second place that can drift.
//
// Request  { filename?: string }
//          Authorization: Bearer <Firebase ID token>
// Response { ok, cloudName, apiKey, timestamp, signature, folder, publicId }
//
// api_key is returned deliberately - Cloudinary sends it in the clear with
// every upload and it is not a credential on its own. api_secret is what turns
// it into one, and that never leaves here.
import { verifyIdToken } from './_lib/verify.js';
import { signUploadParams, uploadTarget, signatureAlgorithm } from './_lib/cloudinary.js';
import { slugify } from './_lib/slug.js';

/**
 * Whether this uid is a blog admin, asked with the caller's own token.
 *
 * Reading admins/{uid} with the user's credentials rather than a service
 * account keeps this endpoint secret-free (the same reasoning as verify.js
 * avoiding firebase-admin) and means the rules stay the authority: the read
 * only succeeds because `allow get: if request.auth.uid == uid` permits it.
 *
 * The three outcomes are kept apart because they need different fixes, and
 * collapsing them is what made this exact problem hard to diagnose before:
 *   200 -> the grant exists
 *   404 -> read allowed, no such document: signed in but not an admin
 *   403 -> the read itself was refused, which for a user's own document only
 *          happens when firestore.rules was never deployed
 */
async function adminStatus(projectId, uid, idToken) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/admins/${encodeURIComponent(uid)}`;

  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });

  if (response.ok) return 'admin';
  if (response.status === 404) return 'not-admin';
  if (response.status === 403) return 'rules-not-deployed';
  return 'unreachable';
}

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // A signature is per-user and single-use; a shared cache must never hold one.
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, code: 'method' });

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!projectId || !cloudName || !apiKey || !apiSecret) {
    // Name the missing variables: the alternative is an upload button that
    // fails with nothing to go on until someone reads this file.
    const missing = [
      ['FIREBASE_PROJECT_ID', projectId],
      ['CLOUDINARY_CLOUD_NAME', cloudName],
      ['CLOUDINARY_API_KEY', apiKey],
      ['CLOUDINARY_API_SECRET', apiSecret],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    return send(res, 500, { ok: false, code: 'server-misconfigured', missing });
  }

  const auth = String(req.headers.authorization || '');
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  let user;
  try {
    user = await verifyIdToken(idToken, projectId);
  } catch (e) {
    return send(res, 401, { ok: false, code: 'unauthorized', reason: e.code || 'invalid' });
  }

  const status = await adminStatus(projectId, user.uid, idToken);
  if (status !== 'admin') {
    // 403 for a real "not you", 503 for "the server cannot tell" - a
    // configuration fault must not read as a verdict about the user.
    return send(res, status === 'not-admin' ? 403 : 503, { ok: false, code: status });
  }

  let filename = '';
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.filename === 'string') filename = parsed.filename;
    }
  } catch {
    // A missing or unreadable body only costs a nicer filename.
    filename = '';
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const { folder, publicId } = uploadTarget(filename, slugify);

  let signature;
  try {
    signature = signUploadParams(
      { folder, public_id: publicId, timestamp },
      apiSecret,
      signatureAlgorithm(),
    );
  } catch (e) {
    // Only reachable via a misspelt CLOUDINARY_SIGNATURE_ALGORITHM. Say so:
    // the alternative is an upload that fails at Cloudinary with "Invalid
    // Signature" and no hint that a typo here is the cause.
    return send(res, 500, { ok: false, code: 'server-misconfigured', reason: e.message });
  }

  return send(res, 200, {
    ok: true,
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder,
    publicId,
  });
}
