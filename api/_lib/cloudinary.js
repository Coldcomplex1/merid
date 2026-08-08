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
// secret, and SHA-1 the result. `file`, `cloud_name`, `resource_type` and
// `api_key` are excluded - Cloudinary does not sign them.
import crypto from 'node:crypto';

/** Parameters Cloudinary sends but never signs. */
const UNSIGNED_PARAMS = new Set(['file', 'cloud_name', 'resource_type', 'api_key']);

/**
 * Signs upload parameters with the account secret.
 *
 * Empty values are dropped rather than signed as `key=`: Cloudinary omits
 * absent parameters from its own string-to-sign, so signing them here would
 * produce a signature the server disagrees with.
 */
export function signUploadParams(params, apiSecret) {
  if (!apiSecret) throw new Error('missing-api-secret');

  const toSign = Object.keys(params)
    .filter((key) => !UNSIGNED_PARAMS.has(key))
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
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
