// "Is this uid a blog admin?", asked server-side with the caller's own token.
//
// Extracted from blog-upload-signature.js when the analytics dashboard became a
// second endpoint needing the same answer. One definition of "admin" - the
// existence of admins/{uid} - is the point; a second copy is how the two drift.

/**
 * Whether this uid is an admin, asked with the caller's own token.
 *
 * Reading admins/{uid} with the user's credentials rather than a service
 * account keeps callers secret-free (the same reasoning as verify.js avoiding
 * firebase-admin) and means the rules stay the authority: the read only
 * succeeds because `allow get: if request.auth.uid == uid` permits it.
 *
 * The outcomes are kept apart because they need different fixes, and collapsing
 * them is what made this exact problem hard to diagnose before:
 *   200 -> the grant exists
 *   404 -> read allowed, no such document: signed in but not an admin
 *   403 -> the read itself was refused, which for a user's own document only
 *          happens when firestore.rules was never deployed
 *
 * @returns {Promise<'admin'|'not-admin'|'rules-not-deployed'|'unreachable'>}
 */
export async function adminStatus(projectId, uid, idToken) {
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
 * The refusal an endpoint owes a caller who is not an admin.
 *
 * 403 for a real "not you", 503 for "the server cannot tell" - the distinction
 * blog-upload-signature.js drew first, kept here so every admin endpoint
 * answers the same way.
 */
export function adminRefusal(status) {
  return { status: status === 'not-admin' ? 403 : 503, body: { ok: false, code: status } };
}
