// Request/response plumbing shared by the API functions.
//
// Extracted from api/check.js, which learned these the hard way. Two endpoints
// reading a body two different ways is how one of them ends up with a bug the
// other already fixed - which is exactly what happened: the upload endpoint
// iterated the request stream directly, and on a body Vercel had already parsed
// that iteration never ends, so the request hung until the browser gave up.

/** Ceiling on waiting for a body off the stream. See the note inside. */
const BODY_READ_TIMEOUT_MS = 10_000;

/**
 * Read the request body as JSON, whatever shape the runtime hands it over in.
 *
 * Vercel's Node runtime usually pre-parses a JSON body into `req.body`, but
 * that depends on the content-type header surviving the hop and on the runtime
 * version. When it does not parse, `req.body` is a string - or absent, and the
 * body is still sitting unread on the stream. Handling one of those three and
 * assuming the rest is how an endpoint passes every local test and then answers
 * 400 to every real request.
 *
 * The stream branch is last on purpose. Reaching for it first is the trap: once
 * the runtime has consumed the stream, 'end' has already fired, and a listener
 * attached afterwards waits forever for an event that will never come again.
 */
export async function readJsonBody(req, timeoutMs = BODY_READ_TIMEOUT_MS) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;

  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (typeof req.on === 'function') {
    raw = await new Promise((resolve, reject) => {
      let acc = '';
      // A stream that has already been drained by something else will never
      // emit 'end' again, and without this the await below is permanent. The
      // bodies here are a filename and a short word list; ten seconds is not a
      // slow request, it is a request that is never arriving.
      const timer = setTimeout(
        () => reject(Object.assign(new Error('body-read-timeout'), { code: 'body-read-timeout' })),
        timeoutMs,
      );
      req.on('data', chunk => { acc += chunk; });
      req.on('end', () => { clearTimeout(timer); resolve(acc); });
      req.on('error', error => { clearTimeout(timer); reject(error); });
    });
  }

  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  return (parsed && typeof parsed === 'object') ? parsed : {};
}

/** JSON response that no shared cache may hold, since every body here is per-user. */
export function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}
