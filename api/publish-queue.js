// GET /api/publish-queue - what is live, what is pending, and what publishes next.
//
// Why this exists: publishing is driven entirely by a date in each post's
// frontmatter plus a daily rebuild, which is a good design precisely because
// there is no database to inspect. The cost is that "when does the next post go
// up" would otherwise mean reading twenty MDX files. This endpoint answers it.
//
// The data comes from api/_generated/posts.js, which is generated from the
// frontmatter and committed. That file is the same input the cron job uses, so
// what this reports and what actually triggers a rebuild can never disagree.
//
// Response { ok, now, live: [...], pending: [...], nextPublishAt, nextPosts, counts }
import { posts } from './_generated/posts.js';

// Optional. When PUBLISH_QUEUE_TOKEN is set, the endpoint requires
// ?token=<value> - useful because the pending list reveals unpublished titles.
const TOKEN = process.env.PUBLISH_QUEUE_TOKEN || '';

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // The answer changes at a date boundary, not per request, but it must never be
  // held long enough to claim a post is pending after it has gone live.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.status(status).send(JSON.stringify(body, null, 2));
}

/** Date-only strings mean midnight UTC, which is how the schedule is authored. */
function timeOf(publishAt) {
  return Date.parse(publishAt.length === 10 ? `${publishAt}T00:00:00Z` : publishAt);
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { ok: false, code: 'method' });
  }

  if (TOKEN) {
    const url = new URL(req.url, 'https://merid.site');
    if (url.searchParams.get('token') !== TOKEN) {
      return send(res, 401, { ok: false, code: 'unauthorized' });
    }
  }

  const now = Date.now();
  const live = [];
  const pending = [];

  for (const post of posts) {
    const entry = {
      slug: post.slug,
      lang: post.lang,
      title: post.title,
      publishAt: post.publishAt,
      url: post.url,
      translationKey: post.translationKey,
    };
    if (timeOf(post.publishAt) <= now) live.push(entry);
    else pending.push(entry);
  }

  // Soonest first for pending, most recent first for live: both are the order
  // you actually want to read them in.
  pending.sort((a, b) => timeOf(a.publishAt) - timeOf(b.publishAt));
  live.sort((a, b) => timeOf(b.publishAt) - timeOf(a.publishAt));

  const nextPublishAt = pending.length ? pending[0].publishAt : null;
  // Both languages of a topic share a date, so "next" is normally two posts.
  const nextPosts = pending.filter((p) => p.publishAt === nextPublishAt);

  return send(res, 200, {
    ok: true,
    now: new Date(now).toISOString(),
    counts: {
      total: posts.length,
      live: live.length,
      pending: pending.length,
      topics: new Set(posts.map((p) => p.translationKey)).size,
    },
    nextPublishAt,
    nextPosts,
    live,
    pending,
  });
}
