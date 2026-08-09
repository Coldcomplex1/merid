// POST /api/pulse - record one visitor event. See _lib/analytics.js for what
// that means and what it does not (no cookie, no identifier, no IP stored).
//
// WHY THE PATH IS NOT /api/analytics
//   Content blockers match request paths literally, and "analytics" is on every
//   list. A blocked beacon fails silently, so the endpoint would not look
//   broken - the numbers would just be wrong, by an unknown amount, forever.
//   The name is chosen to survive a filter list; nothing about the intent is
//   hidden, which is what this comment is for. Do not "fix" it to /api/analytics.
//
// Request  { type: 'page'|'cta'|'survey', path, lang?, ref?, where?, reasons?, first? }
//          sent as text/plain by navigator.sendBeacon - see below
// Response 204, always. There is no body and no error to read.
import { readJsonBody } from './_lib/http.js';
import {
  clientIp, isBot, isConfigured, normalizeEvent, record, visitorHash, withinRate,
} from './_lib/analytics.js';
import { todayKey } from './_lib/quota.js';

/** Origins whose beacons we accept. A missing Origin is fine - sendBeacon does
 *  not always send one - but a present, foreign one is somebody else's page. */
function originAllowed(origin) {
  if (!origin) return true;
  let host;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === 'merid.site' ||
    host.endsWith('.merid.site') ||
    host.endsWith('.vercel.app') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}

/**
 * Every refusal is a 204.
 *
 * The opposite choice to api/check.js, which fails CLOSED on purpose because
 * serving without a working counter exposes an unmetered Gemini key pool. Here
 * the cost of a dropped event is one missing tally, while the cost of a real
 * status code is paid by every visitor: a red line in the console on any page
 * they load, and an oracle that lets someone enumerate the allowlists by
 * watching 400 turn into 204. sendBeacon discards the response anyway, so the
 * status code communicates nothing to the client that sent it.
 */
function done(res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(204).end();
}

export default async function handler(req, res) {
  // No CORS headers, and no OPTIONS branch, both deliberate. The beacon is a
  // CORS *simple* request - POST plus a text/plain body - so no preflight is
  // ever generated. That is also why the client sends text/plain rather than
  // application/json: sendBeacon cannot set headers, so an application/json
  // Blob would demand a preflight the beacon can never complete, and the
  // browser would drop it without a word. Contrast api/check.js, which must set
  // CORS because its caller is a chrome-extension:// origin.
  if (req.method !== 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).end();
  }

  // Before the body is read and before anything is hashed: with no store to
  // write to there is nothing to do, and this keeps an unconfigured deploy from
  // spending any time at all on beacons.
  if (!isConfigured()) return done(res);

  if (!originAllowed(req.headers.origin)) return done(res);
  if (isBot(req.headers['user-agent'])) return done(res);

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return done(res); // malformed JSON, or a body that never arrived
  }

  const event = normalizeEvent(body);
  if (!event) return done(res);

  try {
    const now = Date.now();
    const hash = visitorHash(clientIp(req), req.headers['user-agent'], todayKey(now));
    if (!(await withinRate(hash, now))) return done(res);
    await record(event, hash, now);
  } catch {
    // Redis unreachable, timed out, or refused. Nothing a visitor can act on.
  }

  return done(res);
}
