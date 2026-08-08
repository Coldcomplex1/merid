// Cloudinary upload signatures.
//
// The whole point of this file is that `api_secret` never leaves the server.
// The browser gets a signature that authorises exactly one upload, to exactly
// one path, and expires; it never gets the thing that produced the signature.
//
// That matters more than it sounds. Cloudinary's other option, unsigned upload
// presets, puts the cloud name and preset in the JS bundle, and those two
// values ARE the permission - anyone who reads the bundle can upload to the
// account from curl. Signing server-side keeps the same guarantee the old
// Firebase Storage path had: only an admin can put files here.
//
// Algorithm (cloudinary.com/documentation/authentication_signatures): sort the
// parameters alphabetically, join them as `key=value` with `&`, append the API
// secret, and hash the result. `file`, `cloud_name`, `resource_type` and
// `api_key` are excluded - Cloudinary does not sign them.
import crypto from 'node:crypto';

/** Parameters Cloudinary sends but never signs. */
const UNSIGNED_PARAMS = new Set(['file', 'cloud_name', 'resource_type', 'api_key']);

/**
 * Hashes Cloudinary will accept for a signature.
 *
 * SHA-1 is the account default and what Cloudinary's own SDKs send; SHA-256 is
 * available but only for accounts that have asked support to switch, so
 * defaulting to it would break a standard account on its first upload. The
 * choice belongs to the account, not to this file, which is why it is an
 * environment variable rather than a constant.
 *
 * A scanner will flag SHA-1 as weak, and in general it is. It is not forgeable
 * in this construction: the secret is appended rather than prepended, so the
 * length-extension attack that breaks SHA1(secret + message) does not apply,
 * and producing a signature without the secret needs a second preimage - which
 * SHA-1 has never been shown to give up. The collision attacks it has given up
 * produce two attacker-chosen inputs sharing one digest, which buys nothing
 * against a secret the attacker does not hold.
 */
const ALGORITHMS = new Set(['sha1', 'sha256']);

/** The configured hash, defaulting to Cloudinary's own default. */
export function signatureAlgorithm(env = process.env) {
  const requested = String(env.CLOUDINARY_SIGNATURE_ALGORITHM || 'sha1').toLowerCase();
  // An unrecognised value must not silently fall back: uploads would fail with
  // "Invalid Signature" and nothing would point at the typo that caused it.
  if (!ALGORITHMS.has(requested)) throw new Error(`bad-signature-algorithm:${requested}`);
  return requested;
}

/**
 * Signs upload parameters with the account secret.
 *
 * Empty values are dropped rather than signed as `key=`: Cloudinary omits
 * absent parameters from its own string-to-sign, so signing them here would
 * produce a signature the server disagrees with.
 */
export function signUploadParams(params, apiSecret, algorithm = 'sha1') {
  if (!apiSecret) throw new Error('missing-api-secret');
  if (!ALGORITHMS.has(algorithm)) throw new Error(`bad-signature-algorithm:${algorithm}`);

  const toSign = Object.keys(params)
    .filter((key) => !UNSIGNED_PARAMS.has(key))
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto.createHash(algorithm).update(toSign + apiSecret).digest('hex');
}

/**
 * Where an upload is allowed to land, decided here rather than by the caller.
 *
 * The folder and public_id are part of the signed parameters, so a client that
 * edits them in flight produces a signature mismatch and Cloudinary rejects the
 * upload. The browser can therefore choose a *name*, but never a destination.
 *
 * The base36 timestamp suffix means re-uploading a corrected image never
 * collides with the old one, so a URL's bytes are immutable and can be cached
 * for a year.
 */
export function uploadTarget(filename, slugify, now = Date.now()) {
  const name = typeof filename === 'string' ? filename : '';
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;

  return {
    folder: `blog/${new Date(now).getUTCFullYear()}`,
    publicId: `${slugify(stem) || 'image'}-${now.toString(36)}`,
  };
}
