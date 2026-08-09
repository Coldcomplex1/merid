// Per-user daily quota, backed by Upstash Redis over HTTP (see _lib/redis.js
// for why Redis and not Firestore).
//
// The counter is authoritative and lives here, NOT in the extension: a limit
// the client keeps is a limit the client can reset.
import { isConfigured as redisConfigured, pipeline as redisPipeline } from './redis.js';

/** api/check.js decides whether to fail closed on exactly this code. */
const ERR_CODE = 'quota-store';

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
  return redisConfigured();
}

const pipeline = commands => redisPipeline(commands, ERR_CODE);

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
