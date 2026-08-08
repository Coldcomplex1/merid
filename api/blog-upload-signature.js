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
import { readJsonBody, sendJson as send } from './_lib/http.js';

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

/**
 * Read a configuration value, trimmed.
 *
 * A trailing space or newline survives a copy-paste into Vercel and is then
 * invisible everywhere you would look for it. The dashboard field shows
 * nothing, and Cloudinary's rejection prints the value looking exactly right -
 * "Invalid cloud_name jcklpfxz" for a value that really is `jcklpfxz\n`. On the
 * secret it is worse: the signature comes out wrong and the error blames the
 * signature. Neither is falsifiable by reading the value, so trim it and delete
 * the whole class of failure.
 */
function readEnv(name) {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

/** What a Cloudinary cloud name may contain. Anything else is a paste accident. */
const CLOUD_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, code: 'method' });

  const projectId = readEnv('FIREBASE_PROJECT_ID');
  const cloudName = readEnv('CLOUDINARY_CLOUD_NAME');
  const apiKey = readEnv('CLOUDINARY_API_KEY');
  const apiSecret = readEnv('CLOUDINARY_API_SECRET');

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

  // A cloud name goes straight into the upload URL, so a bad one comes back as
  // Cloudinary's "Invalid cloud_name", which is true but points at the wrong
  // place. Reject it here, where we can say it is our configuration.
  if (!CLOUD_NAME_PATTERN.test(cloudName)) {
    return send(res, 500, {
      ok: false,
      code: 'server-misconfigured',
      reason: 'cloud-name-invalid',
      // Public, and quoted so anything odd is visible rather than inferred.
      cloudName: JSON.stringify(cloudName),
    });
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

  // Via the shared reader, never by iterating the stream: Vercel usually
  // pre-parses the body, and a stream that has already ended never delivers a
  // second 'end' to a listener attached afterwards. Getting that wrong does not
  // fail, it hangs - the browser sits on "Uploading…" until the user gives up.
  let filename = '';
  try {
    const body = await readJsonBody(req);
    if (typeof body.filename === 'string') filename = body.filename;
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
