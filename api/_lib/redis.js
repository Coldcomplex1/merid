// The one Upstash Redis client, shared by everything that needs a counter.
//
// Redis over HTTP rather than a normal client because a serverless function has
// nowhere to keep a connection pool, and rather than Firestore because the only
// operation any caller needs is an atomic counter - no read-modify-write, no
// transaction, no service-account credentials.
//
// Extracted from quota.js when analytics became a second caller. Two modules
// each holding their own copy of this is how one of them ends up with a bug the
// other already fixed, which is the same reasoning that produced _lib/http.js.

const URL_ENV = 'UPSTASH_REDIS_REST_URL';
const TOKEN_ENV = 'UPSTASH_REDIS_REST_TOKEN';

/** Both halves are needed; one without the other cannot talk to anything. */
export function isConfigured() {
  return !!(process.env[URL_ENV] && process.env[TOKEN_ENV]);
}

/** Which of the two are missing, so a caller can say so instead of guessing. */
export function missingEnv() {
  return [URL_ENV, TOKEN_ENV].filter(name => !process.env[name]);
}

/**
 * Run an array of Redis commands in one round trip.
 *
 * `errCode` is what the thrown error carries as `.code`. Callers map their own
 * failure vocabulary onto it - the quota path has to keep saying 'quota-store'
 * because api/check.js decides whether to fail closed on exactly that value.
 *
 * `timeoutMs` is opt-in, and deliberately off by default: the quota path had no
 * timeout before this module existed, and a refactor is not the place to change
 * how the AI proxy behaves under a slow upstream. The analytics callers pass one
 * because they sit on a page-load path, where a hung Upstash would otherwise pin
 * a function per visitor.
 *
 * @param {string[][]} commands
 * @param {string} errCode
 * @param {{timeoutMs?: number}} [options]
 */
export async function pipeline(commands, errCode = 'redis', options = {}) {
  const base = String(process.env[URL_ENV] || '').replace(/\/$/, '');
  const { timeoutMs } = options;

  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let resp;
  try {
    resp = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env[TOKEN_ENV]}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands),
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch (err) {
    // An abort and a network failure are the same thing to every caller here:
    // the commands did not run. Carry the caller's code either way.
    throw Object.assign(new Error(`${errCode}-unavailable`), { code: errCode, cause: err });
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!resp.ok) throw Object.assign(new Error(`${errCode}-unavailable`), { code: errCode });
  return resp.json();
}
