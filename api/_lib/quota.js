// Per-user daily quota, backed by Upstash Redis over HTTP.
//
// Redis rather than Firestore because the only operation needed is an atomic
// counter, and INCR is exactly that - no read-modify-write, no transaction, no
// service-account credentials. The HTTP API also works from a serverless
// function without a connection pool, which a normal Redis client cannot.
//
// The counter is authoritative and lives here, NOT in the extension: a limit
// the client keeps is a limit the client can reset.

const URL_ENV = 'UPSTASH_REDIS_REST_URL';
const TOKEN_ENV = 'UPSTASH_REDIS_REST_TOKEN';

/** Days are UTC so the reset time is the same for every user, everywhere. */
export function todayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Seconds until the UTC day rolls over - used as the counter's TTL. */
export function secondsUntilReset(now = Date.now()) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now) / 1000));
}

export function isConfigured() {
  return !!(process.env[URL_ENV] && process.env[TOKEN_ENV]);
}

async function pipeline(commands) {
  const base = String(process.env[URL_ENV] || '').replace(/\/$/, '');
  const resp = await fetch(`${base}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env[TOKEN_ENV]}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!resp.ok) throw Object.assign(new Error('quota-store-unavailable'), { code: 'quota-store' });
  return resp.json();
}

/**
 * Count one request against `uid`'s daily allowance.
 *
 * Increments first and compares afterwards, so two requests racing cannot both
 * see "one left" and both go through. A request that lands over the limit is
 * rejected but still counted, which is the safe direction: the alternative
 * (decrementing on rejection) reopens the same race.
 *
 * @returns {Promise<{allowed:boolean, used:number, limit:number, resetIn:number}>}
 */
export async function consume(uid, limit, now = Date.now()) {
  const key = `merid:q:${uid}:${todayKey(now)}`;
  const ttl = secondsUntilReset(now);
  const res = await pipeline([
    ['INCR', key],
    ['EXPIRE', key, String(ttl), 'NX']  // NX: never extend an existing window
  ]);
  const used = Number(res && res[0] && res[0].result);
  if (!Number.isFinite(used)) throw Object.assign(new Error('quota-store'), { code: 'quota-store' });
  return { allowed: used <= limit, used, limit, resetIn: ttl };
}

/** Read the current count without spending any of it (for a status endpoint). */
export async function peek(uid, limit, now = Date.now()) {
  const key = `merid:q:${uid}:${todayKey(now)}`;
  const res = await pipeline([['GET', key]]);
  const used = Number((res && res[0] && res[0].result) || 0);
  return { used, limit, remaining: Math.max(0, limit - used), resetIn: secondsUntilReset(now) };
}
