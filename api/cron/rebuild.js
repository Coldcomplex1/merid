// GET /api/cron/rebuild - the entire scheduled-publishing mechanism.
//
// Vercel Cron calls this daily at 02:00 UTC (see vercel.json). Posts are static
// HTML generated at build time from a `publishAt` date, so a post goes live by
// being rebuilt after its date has passed. Nothing here mutates any data: it
// looks at the committed manifest, decides whether anything crossed its date in
// the last day, and if so pokes a Vercel Deploy Hook. The build does the rest.
//
// It deliberately does NOT redeploy every night. A deploy that produces byte-
// identical output still invalidates caches, burns build minutes, and buries the
// real publishes in the deployment list. Most days there is nothing to do and
// the right answer is to say so and stop.
import { timingSafeEqual } from 'node:crypto';
import { posts } from '../_generated/posts.js';

// Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron invocations once
// this env var exists. Without it the endpoint would be a public deploy button.
const CRON_SECRET = process.env.CRON_SECRET || '';
const DEPLOY_HOOK_URL = process.env.VERCEL_DEPLOY_HOOK_URL || '';

// One hour of slack past 24 so a cron that fires slightly late, or a deploy that
// failed and left yesterday's post unpublished, still gets picked up. Publishing
// twice is harmless; missing a publish for a day is not.
const LOOKBACK_MS = 25 * 60 * 60 * 1000;

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body, null, 2));
}

/** Constant-time compare that also tolerates length mismatches. */
function secretMatches(provided, expected) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function timeOf(publishAt) {
  return Date.parse(publishAt.length === 10 ? `${publishAt}T00:00:00Z` : publishAt);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return send(res, 405, { ok: false, code: 'method' });
  }

  // Fail closed. An unset secret on a deployed function means anyone who guesses
  // the path can trigger builds, so refuse to run rather than run unprotected.
  if (!CRON_SECRET) {
    return send(res, 500, {
      ok: false,
      code: 'server-misconfigured',
      detail: 'CRON_SECRET is not set. See docs/BLOG.md.',
    });
  }

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !secretMatches(token, CRON_SECRET)) {
    return send(res, 401, { ok: false, code: 'unauthorized' });
  }

  const now = Date.now();
  const due = posts.filter((post) => {
    const at = timeOf(post.publishAt);
    return at <= now && at > now - LOOKBACK_MS;
  });

  if (!due.length) {
    const upcoming = posts
      .filter((post) => timeOf(post.publishAt) > now)
      .sort((a, b) => timeOf(a.publishAt) - timeOf(b.publishAt));
    return send(res, 200, {
      ok: true,
      triggered: false,
      reason: 'nothing crossed its publishAt in the last 25h',
      nextPublishAt: upcoming.length ? upcoming[0].publishAt : null,
    });
  }

  if (!DEPLOY_HOOK_URL) {
    return send(res, 500, {
      ok: false,
      code: 'server-misconfigured',
      detail: 'VERCEL_DEPLOY_HOOK_URL is not set, so the posts due today cannot be published.',
      due: due.map((p) => `${p.slug}.${p.lang}`),
    });
  }

  let status;
  try {
    const response = await fetch(DEPLOY_HOOK_URL, { method: 'POST' });
    status = response.status;
    if (!response.ok) {
      return send(res, 502, {
        ok: false,
        code: 'deploy-hook-failed',
        status,
        due: due.map((p) => `${p.slug}.${p.lang}`),
      });
    }
  } catch (error) {
    return send(res, 502, { ok: false, code: 'deploy-hook-unreachable', detail: error.message });
  }

  return send(res, 200, {
    ok: true,
    triggered: true,
    status,
    published: due.map((p) => ({ slug: p.slug, lang: p.lang, publishAt: p.publishAt, url: p.url })),
  });
}
