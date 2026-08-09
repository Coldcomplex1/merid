// GET /api/analytics-summary?days=30 - everything the /admin dashboard shows.
//
// Admin-only, on the same single definition of "admin" as the blog: the
// existence of admins/{uid}, asked with the caller's own ID token so this
// endpoint holds no service-account secret and firestore.rules stays the
// authority. See _lib/admin.js.
//
// Request  Authorization: Bearer <Firebase ID token>
// Response { ok: true, range, since, totals, previous, series, paths,
//            placements, reasons, referrers, posts, langs }
import { verifyIdToken } from './_lib/verify.js';
import { adminStatus, adminRefusal } from './_lib/admin.js';
import { sendJson as send } from './_lib/http.js';
import { allTimeDays, isConfigured, readRange } from './_lib/analytics.js';
import { missingEnv } from './_lib/redis.js';

/** A dashboard load costs a few Redis commands per day in the range, so 90 is
 *  the ceiling for an ordinary request. `days=all` is the one way past it, and
 *  it is bounded by the data's own TTL rather than by a number picked here. */
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, code: 'method' });

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return send(res, 500, { ok: false, code: 'server-misconfigured' });

  const auth = String(req.headers.authorization || '');
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  let user;
  try {
    user = await verifyIdToken(idToken, projectId);
  } catch (e) {
    return send(res, 401, { ok: false, code: 'unauthorized', reason: e.code || 'invalid' });
  }

  let status;
  try {
    status = await adminStatus(projectId, user.uid, idToken);
  } catch {
    status = 'unreachable';
  }
  if (status !== 'admin') {
    const refusal = adminRefusal(status);
    return send(res, refusal.status, refusal.body);
  }

  // 503 rather than 500: the feature is absent, not broken. Naming the variables
  // is the whole point - the same reasoning as blog-upload-signature.js, where
  // "which one did I forget" was the question that cost an evening.
  if (!isConfigured()) {
    return send(res, 503, { ok: false, code: 'not-configured', missing: missingEnv() });
  }

  // The range is a key fragment, so it is a number derived from a number and
  // never free text. "all" is the one non-numeric value accepted, and it too
  // resolves to a number before it goes anywhere near a key.
  const asked = String(req.query?.days ?? DEFAULT_DAYS);
  const allTime = asked === 'all';
  const raw = Number.parseInt(asked, 10);
  const days = Number.isFinite(raw) ? Math.min(MAX_DAYS, Math.max(1, raw)) : DEFAULT_DAYS;

  try {
    const span = allTime ? await allTimeDays() : days;
    const summary = await readRange(span, Date.now(), { comparePrevious: !allTime });
    return send(res, 200, { ok: true, allTime, ...summary });
  } catch {
    return send(res, 503, { ok: false, code: 'store-unreachable' });
  }
}
