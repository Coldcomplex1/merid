// Merid's own visitor counter: key schema, allowlists, writes and reads.
//
// Everything the feature knows lives here; api/pulse.js and
// api/analytics-summary.js are thin shells around it. That split exists so the
// interesting parts - what a client is allowed to say, and what reaches Redis -
// are testable without an HTTP server.
//
// WHAT IS STORED
//   Counts, and nothing else. No cookie is set, no identifier is issued, and no
//   IP address or user-agent string is ever written anywhere. A visitor is
//   counted once a day through a one-way hash that is fed straight into a
//   HyperLogLog (which keeps registers, never members) and then discarded. The
//   privacy policy describes this in the same terms; keep the two in step.
//
// WHY REDIS
//   The whole write path is atomic counters, which is INCR - see _lib/redis.js.
//   Firestore would need a sharded-counter dance to beat its ~1 write/sec/doc
//   ceiling, and a per-event document would burn the free write tier and then
//   have to be re-aggregated to answer a single question.
import crypto from 'node:crypto';
import { pipeline, isConfigured } from './redis.js';
import { todayKey } from './quota.js';

export { isConfigured };

/** Analytics keys sit beside the quota's `merid:q:`, never colliding with it. */
const NS = 'merid:a';

/** ~400 days. Long enough for a year-over-year look, short enough to self-trim. */
const TTL_SECONDS = 34_560_000;

/** Upstash bills per command even inside a pipeline; ingest sits on a page load. */
const WRITE_TIMEOUT_MS = 1500;
const READ_TIMEOUT_MS = 5000;

/** Past this many members in a day's referrer set, everything new folds into
 *  `other`. Referrer hosts are the one field a client can invent freely, so the
 *  set needs a ceiling that does not depend on the client behaving. */
const REF_MEMBERS_MAX = 200;

/** How many members of each sorted set to read per day. The per-day cap above
 *  bounds the tail; a top-10 table does not need the rest. */
const TOP_PER_DAY = 50;

/** Events a client may send. Anything else writes nothing at all. */
export const EVENT_TYPES = new Set(['page', 'cta', 'survey']);

/**
 * Pathnames worth counting separately, mapped to the field name they get.
 *
 * The client sends a raw pathname and the SERVER decides the bucket, so a
 * hostile or stale client can only ever land somewhere that already exists.
 * Unknown paths collapse to `other`; /admin is dropped entirely, because
 * counting our own visits to the dashboard is how the dashboard starts lying.
 */
export const PATHS = {
  '/': 'home',
  '/tutorial': 'tutorial',
  '/create-dataset': 'create-dataset',
  '/api-key-guide': 'api-key-guide',
  '/privacy-policy': 'privacy-policy',
  '/welcome': 'welcome',
  '/goodbye': 'goodbye',
  '/login': 'login',
  '/signup': 'signup',
  '/my-deck': 'my-deck',
};

/** Where an "Add to Chrome" click came from. Mirrors the Placement union in
 *  src/lib/analytics.ts - when one changes, change the other. */
export const PLACEMENTS = new Set([
  'hero', 'navbar', 'navbar-mobile', 'final-cta', 'footer', 'banner',
  'my-deck', 'goodbye', 'api-key-guide', 'create-dataset', 'tutorial',
  'privacy-policy', 'blog-cta', 'blog-author',
]);

/** Uninstall-survey reasons. Must stay in step with firestore.rules:201-202
 *  and FEEDBACK_REASONS in src/lib/feedback.ts. */
export const REASONS = new Set([
  'too-many', 'wrong-sites', 'not-useful', 'performance',
  'privacy', 'switched', 'testing', 'other',
]);

const LANGS = new Set(['vi', 'en']);

/** Blog languages, as they appear in /blog/{lang}/{slug}. */
const BLOG_LANGS = new Set(['vie', 'en']);

/**
 * Clients that are not people. Zalo and WhatsApp are here because README.md
 * documents that those two fetch the OG card, so they arrive looking like
 * traffic on every shared link.
 */
const BOT_UA =
  /bot|crawler|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|python-requests|node-fetch|axios|facebookexternalhit|whatsapp|zalo|telegram|discord|bingpreview/i;

/** Collapse whitespace, trim, cap. Copied from the clip() in api/check.js: a
 *  five-megabyte `path` should cost one slice, not a key. */
function clip(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Every scalar counter for one day, in one hash: one EXPIRE covers them all,
 *  and the field names are a closed allowlist, so the key cannot grow wild. */
const dayKey = day => `${NS}:d:${day}`;
const uniqueKey = day => `${NS}:u:${day}`;
const refKey = day => `${NS}:ref:${day}`;
const postKey = day => `${NS}:post:${day}`;
const sinceKey = () => `${NS}:since`;
const rateKey = (hash, minute) => `${NS}:rl:${hash}:${minute}`;

/** UTC day string N days before `now`. Reuses the quota's day boundary so both
 *  counters roll over at the same instant. */
export function dayOffset(now, back) {
  return todayKey(now - back * 86_400_000);
}

/** Oldest-first list of UTC day strings covering `days` ending today. */
export function dayRange(now, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayOffset(now, i));
  return out;
}

// ---------------------------------------------------------------------------
// Normalisation - the security boundary of the whole feature
// ---------------------------------------------------------------------------

/** A pathname to its bucket, or null for paths that must not be counted. */
export function normalizePath(raw) {
  const path = clip(raw, 300);
  if (!path.startsWith('/')) return 'other';
  // Never count ourselves looking at the dashboard.
  if (path === '/admin' || path.startsWith('/admin/')) return null;
  if (path === '/blog' || path.startsWith('/blog/')) return 'blog';
  const exact = PATHS[path];
  if (exact) return exact;
  // Trailing slash is the same page to everyone except a string comparison.
  if (path.endsWith('/') && PATHS[path.slice(0, -1)]) return PATHS[path.slice(0, -1)];
  return 'other';
}

/**
 * A referrer to a bare hostname.
 *
 * The path and query string are dropped before anything is stored - a referring
 * URL can carry personal data in its query, and the only question this answers
 * is "which site sent them".
 */
export function normalizeRef(raw, selfHost = 'merid.site') {
  const value = clip(raw, 500);
  if (!value) return 'direct';

  let host;
  try {
    host = new URL(value).hostname;
  } catch {
    return 'direct';
  }

  host = host.toLowerCase().replace(/^www\./, '').slice(0, 64);
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return 'direct';
  if (host === selfHost || host.endsWith(`.${selfHost}`)) return 'internal';
  return host;
}

/** A click placement, or `other` when a stale deploy sends one we retired. */
export function normalizePlacement(raw) {
  const value = clip(raw, 40);
  return PLACEMENTS.has(value) ? value : 'other';
}

/** `vi` / `en`, or null when the client said something else. */
export function normalizeLang(raw) {
  const value = clip(raw, 8).toLowerCase();
  return LANGS.has(value) ? value : null;
}

/** "{lang}/{slug}" for a blog post, or null. Server-validated so the sorted set
 *  is bounded by the number of posts that actually exist. */
export function normalizePost(path) {
  const match = /^\/blog\/([a-z]+)\/([a-z0-9-]{1,80})\/?$/.exec(clip(path, 300));
  if (!match || !BLOG_LANGS.has(match[1])) return null;
  return `${match[1]}/${match[2]}`;
}

export function isBot(userAgent) {
  const ua = clip(userAgent, 300);
  // No user-agent at all is a script, not a browser.
  return !ua || BOT_UA.test(ua);
}

/**
 * One visitor, for one day, as an unrecoverable hash.
 *
 * The day is an input, so the value rotates every midnight UTC and cannot be
 * used to follow anyone across days. The salt stops someone who guesses an
 * IP/user-agent pair from confirming the guess. The result is used for exactly
 * two things - a PFADD member and a rate-limit key name - and is never written
 * as a hash field, a set member, or a log line.
 */
export function visitorHash(ip, userAgent, day) {
  const salt = process.env.ANALYTICS_SALT || 'merid-default-salt';
  return crypto
    .createHash('sha256')
    .update(`${salt}|${day}|${ip || ''}|${userAgent || ''}`)
    .digest('hex')
    .slice(0, 16);
}

/** The caller's IP, for hashing only. Never stored. */
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  return forwarded.split(',')[0].trim() || req.socket?.remoteAddress || '';
}

/**
 * A raw client payload to the event we will actually count, or null.
 *
 * Everything a client can influence is re-derived here from an allowlist, so
 * the set of Redis keys this feature can ever create is fixed at deploy time.
 */
export function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = clip(raw.type, 20);
  if (!EVENT_TYPES.has(type)) return null;

  const path = normalizePath(raw.path);
  if (path === null) return null; // /admin, deliberately uncounted

  const lang = normalizeLang(raw.lang);

  if (type === 'page') {
    return {
      type,
      path,
      lang,
      ref: normalizeRef(raw.ref),
      post: path === 'blog' ? normalizePost(raw.path) : null,
      // Only meaningful on /welcome and /goodbye, where the client's one-shot
      // guard means "this browser has not been here before".
      first: raw.first === true,
    };
  }

  if (type === 'cta') {
    return { type, path, lang, where: normalizePlacement(raw.where) };
  }

  // survey
  const reasons = Array.isArray(raw.reasons)
    ? [...new Set(raw.reasons.map(r => clip(r, 40)).filter(r => REASONS.has(r)))].slice(0, 8)
    : [];
  return { type, path, lang, reasons };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Keys this warm instance has already given a TTL.
 *
 * EXPIRE is idempotent under NX, so a cold start simply re-issues it. Skipping
 * it on a warm instance is worth doing because Upstash bills per command even
 * inside a pipeline, and the TTL calls would otherwise be a third of the volume.
 */
const ttlSeen = new Set();

function withTtl(commands, key) {
  if (ttlSeen.has(key)) return;
  // NX so a later write never extends an existing window - the same reasoning
  // as the quota counter's EXPIRE.
  commands.push(['EXPIRE', key, String(TTL_SECONDS), 'NX']);
  ttlSeen.add(key);
  // Unbounded growth across a long-lived instance is not a real risk (one entry
  // per key per day), but a ceiling costs nothing.
  if (ttlSeen.size > 500) ttlSeen.clear();
}

/** Reset the warm-instance TTL memo. Tests only. */
export function _resetTtlMemo() {
  ttlSeen.clear();
}

/**
 * Is this visitor within their per-minute allowance?
 *
 * Deliberately its own round trip. A pipeline cannot branch, so folding this in
 * with the writes would mean the limiter reported the overage only after the
 * write it exists to prevent had already landed.
 */
export async function withinRate(hash, now, limit = 60) {
  const minute = Math.floor(now / 60_000);
  const key = rateKey(hash, minute);
  const res = await pipeline(
    [['INCR', key], ['EXPIRE', key, '120', 'NX']],
    'analytics',
    { timeoutMs: WRITE_TIMEOUT_MS },
  );
  const used = Number(res?.[0]?.result);
  return !Number.isFinite(used) || used <= limit;
}

/** Whether this instance has already claimed the "first day recorded" marker. */
let sinceSeen = false;

/**
 * Write one event.
 *
 * Returns the command list it ran, which is what the tests assert against -
 * checking the commands is how you prove a raw IP never reaches Redis.
 */
export async function record(event, hash, now = Date.now()) {
  const day = todayKey(now);
  const commands = [];

  const d = dayKey(day);
  const u = uniqueKey(day);

  if (!sinceSeen) {
    // NX: the first day this ever ran, so the dashboard can tell an empty range
    // apart from a counter that was only switched on yesterday.
    commands.push(['SET', sinceKey(), day, 'NX']);
    sinceSeen = true;
  }

  if (event.type === 'page') {
    commands.push(['HINCRBY', d, 'pv', '1']);
    commands.push(['HINCRBY', d, `pv:${event.path}`, '1']);
    commands.push(['PFADD', u, hash]);
    withTtl(commands, u);

    if (event.lang) commands.push(['HINCRBY', d, `lang:${event.lang}`, '1']);

    // A first-ever hit on these two pages is a real install / uninstall: the
    // extension opens /welcome only when details.reason === 'install', and sets
    // /goodbye as its uninstall URL. See merid-extension-final/background.js.
    if (event.first && event.path === 'welcome') commands.push(['HINCRBY', d, 'install', '1']);
    if (event.first && event.path === 'goodbye') commands.push(['HINCRBY', d, 'uninstall', '1']);

    if (event.path === 'blog') {
      commands.push(['HINCRBY', d, 'blogpv', '1']);
      if (event.post) {
        commands.push(['ZINCRBY', postKey(day), '1', event.post]);
        withTtl(commands, postKey(day));
      }
    }

    if (event.ref && event.ref !== 'internal') {
      commands.push(['ZINCRBY', refKey(day), '1', event.ref]);
      withTtl(commands, refKey(day));
    }
  } else if (event.type === 'cta') {
    commands.push(['HINCRBY', d, 'cta', '1']);
    commands.push(['HINCRBY', d, `cta:${event.where}`, '1']);
  } else if (event.type === 'survey') {
    commands.push(['HINCRBY', d, 'surveys', '1']);
    for (const reason of event.reasons) {
      commands.push(['HINCRBY', d, `reason:${reason}`, '1']);
    }
  }

  withTtl(commands, d);

  if (!commands.length) return commands;
  await pipeline(commands, 'analytics', { timeoutMs: WRITE_TIMEOUT_MS });
  return commands;
}

/**
 * Fold a day's referrer set back under its ceiling.
 *
 * Called opportunistically rather than on every write: one extra ZCARD per
 * event would cost more than the problem. A day that overshoots between sweeps
 * is bounded by the per-visitor rate limit.
 */
export async function trimReferrers(now = Date.now()) {
  const key = refKey(todayKey(now));
  const res = await pipeline([['ZCARD', key]], 'analytics', { timeoutMs: WRITE_TIMEOUT_MS });
  const size = Number(res?.[0]?.result || 0);
  if (size <= REF_MEMBERS_MAX) return size;
  // Drop the long tail: the rarest hosts are the ones a flood creates.
  await pipeline(
    [['ZREMRANGEBYRANK', key, '0', String(size - REF_MEMBERS_MAX - 1)]],
    'analytics',
    { timeoutMs: WRITE_TIMEOUT_MS },
  );
  return REF_MEMBERS_MAX;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Upstash returns a hash as a flat [field, value, field, value] array. */
function decodeHash(result) {
  const out = {};
  if (Array.isArray(result)) {
    for (let i = 0; i + 1 < result.length; i += 2) out[result[i]] = Number(result[i + 1]) || 0;
  } else if (result && typeof result === 'object') {
    for (const [k, v] of Object.entries(result)) out[k] = Number(v) || 0;
  }
  return out;
}

/** Upstash returns WITHSCORES as a flat [member, score, member, score] array. */
function decodeZset(result, into) {
  if (!Array.isArray(result)) return into;
  for (let i = 0; i + 1 < result.length; i += 2) {
    const member = String(result[i]);
    into.set(member, (into.get(member) || 0) + (Number(result[i + 1]) || 0));
  }
  return into;
}

function topN(map, keyName, valueName, limit = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => ({ [keyName]: k, [valueName]: v }));
}

/** Sum one hash field across a set of decoded day hashes. */
function sumField(hashes, field) {
  return hashes.reduce((total, h) => total + (h[field] || 0), 0);
}

/** Every field matching `prefix:`, summed and stripped of the prefix. */
function sumPrefixed(hashes, prefix) {
  const out = new Map();
  for (const h of hashes) {
    for (const [field, value] of Object.entries(h)) {
      if (field.startsWith(prefix)) {
        const name = field.slice(prefix.length);
        out.set(name, (out.get(name) || 0) + value);
      }
    }
  }
  return out;
}

const EMPTY_TOTALS = () => ({
  pageviews: 0, uniques: 0, cta: 0, installs: 0, uninstalls: 0, surveys: 0, blogViews: 0,
});

/**
 * Everything the dashboard shows, in one round trip.
 *
 * The previous period of equal length is read alongside so each tile can show a
 * delta. Sorted sets are merged here in JS rather than with ZUNIONSTORE so this
 * stays strictly read-only: no temporary key, and nothing an admin page does can
 * disturb the data it is reading.
 */
export async function readRange(days, now = Date.now()) {
  const current = dayRange(now, days);
  const previous = [];
  for (let i = days * 2 - 1; i >= days; i--) previous.push(dayOffset(now, i));

  const commands = [];
  for (const day of current) commands.push(['HGETALL', dayKey(day)]);
  for (const day of previous) commands.push(['HGETALL', dayKey(day)]);
  for (const day of current) commands.push(['PFCOUNT', uniqueKey(day)]);
  // One command for the whole range: PFCOUNT over N keys returns the union, so
  // a visitor who came back on three days counts once. This is the single
  // reason a HyperLogLog beats a plain set here.
  commands.push(['PFCOUNT', ...current.map(uniqueKey)]);
  commands.push(['PFCOUNT', ...previous.map(uniqueKey)]);
  for (const day of current) {
    commands.push(['ZRANGE', refKey(day), '0', String(TOP_PER_DAY - 1), 'REV', 'WITHSCORES']);
  }
  for (const day of current) {
    commands.push(['ZRANGE', postKey(day), '0', String(TOP_PER_DAY - 1), 'REV', 'WITHSCORES']);
  }
  commands.push(['GET', sinceKey()]);

  const res = await pipeline(commands, 'analytics', { timeoutMs: READ_TIMEOUT_MS });
  const at = i => res?.[i]?.result;

  let cursor = 0;
  const currentHashes = current.map(() => decodeHash(at(cursor++)));
  const previousHashes = previous.map(() => decodeHash(at(cursor++)));
  const dailyUniques = current.map(() => Number(at(cursor++)) || 0);
  const rangeUniques = Number(at(cursor++)) || 0;
  const previousUniques = Number(at(cursor++)) || 0;

  const refs = new Map();
  for (let i = 0; i < current.length; i++) decodeZset(at(cursor++), refs);
  const posts = new Map();
  for (let i = 0; i < current.length; i++) decodeZset(at(cursor++), posts);
  const since = at(cursor++) || null;

  const totalsFor = (hashes, uniques) => ({
    pageviews: sumField(hashes, 'pv'),
    uniques,
    cta: sumField(hashes, 'cta'),
    installs: sumField(hashes, 'install'),
    uninstalls: sumField(hashes, 'uninstall'),
    surveys: sumField(hashes, 'surveys'),
    blogViews: sumField(hashes, 'blogpv'),
  });

  const langCounts = sumPrefixed(currentHashes, 'lang:');

  return {
    range: { from: current[0], to: current[current.length - 1], days },
    since,
    totals: current.length ? totalsFor(currentHashes, rangeUniques) : EMPTY_TOTALS(),
    previous: totalsFor(previousHashes, previousUniques),
    // Every day in the range gets a row, zeros included, so the chart never has
    // to invent a missing point.
    series: current.map((day, i) => ({
      day,
      pageviews: currentHashes[i].pv || 0,
      uniques: dailyUniques[i],
      cta: currentHashes[i].cta || 0,
      installs: currentHashes[i].install || 0,
      uninstalls: currentHashes[i].uninstall || 0,
    })),
    paths: topN(sumPrefixed(currentHashes, 'pv:'), 'path', 'pageviews', 12),
    placements: topN(sumPrefixed(currentHashes, 'cta:'), 'where', 'clicks', 14),
    reasons: topN(sumPrefixed(currentHashes, 'reason:'), 'reason', 'count', 8),
    referrers: topN(refs, 'host', 'visits', 10),
    posts: topN(posts, 'post', 'views', 10),
    langs: { vi: langCounts.get('vi') || 0, en: langCounts.get('en') || 0 },
  };
}

/** Internals the tests reach for, following the convention in _lib/gemini.js. */
export const _internal = {
  clip, dayKey, uniqueKey, refKey, postKey, rateKey, sinceKey,
  decodeHash, decodeZset, topN, sumPrefixed,
  TTL_SECONDS, REF_MEMBERS_MAX, NS,
  resetSince: () => { sinceSeen = false; },
};
