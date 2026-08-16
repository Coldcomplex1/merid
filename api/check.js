// POST /api/check - AI context check on Merid's own model-provider keys.
//
// Why this exists at all: shipping API keys inside a Chrome extension puts them
// in every user's file system, and a per-user limit the extension counts is a
// limit the user can reset. Both problems disappear once the keys and the
// counter live on a server the client cannot read or edit.
//
// Request  { items: [{word, original, sentence}], persona?: string }
//          Authorization: Bearer <Firebase ID token>
// Response { ok, verdicts: (0|1)[], betters: string[], model, provider, used, limit }
//
// The extension keeps working without this endpoint - the AI check is an
// enhancement, and every failure path here degrades to "no check", never to a
// broken page.
//
// Which provider answers is _lib/ai.js's business, not this file's: Qwen first,
// Gemini underneath, both reachable through one generate().
import { verifyIdToken } from './_lib/verify.js';
import { consume, isConfigured as quotaConfigured } from './_lib/quota.js';
import { generate, parseVerdictArray } from './_lib/ai.js';
import { readJsonBody, sendJson as send } from './_lib/http.js';

// A signed-in reader is a known, recoverable identity; an anonymous one is a
// device that can mint a fresh id by reinstalling. The lower anonymous
// allowance is what stops that from being an unlimited tap, and gives signing
// in a concrete benefit.
const LIMIT_ANONYMOUS = Number(process.env.MERID_LIMIT_ANONYMOUS || 20);
const LIMIT_SIGNED_IN = Number(process.env.MERID_LIMIT_SIGNED_IN || 50);

// ...and while Merid is small enough that a whole day's model spend is
// noise, nobody is turned away: the limits above are counted but not enforced,
// so a reader gets the check on every page instead of losing it at word 20.
//
// This is a deliberate, reversible trade. Metering is one environment variable
// away - set MERID_AI_METERED=1 in the deployment and the caps above are in
// force again on the next request, no deploy needed - and the counter keeps
// running underneath either way, so the numbers that say when to flip it back
// are already there. Watch it: with no cap, one abusive client can spend the
// whole key pool, and the only thing standing in the way is how few users
// know the endpoint exists.
const METERED = process.env.MERID_AI_METERED === '1';

const MAX_ITEMS = 20;
const MAX_SENTENCE = 180;
const MAX_WORD = 60;
const MAX_PERSONA = 300;

const VERDICT_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      i: { type: 'INTEGER' },
      ok: { type: 'BOOLEAN' },
      better: { type: 'STRING' }
    },
    required: ['i', 'ok']
  }
};

function clip(v, n) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
}

export default async function handler(req, res) {
  // The caller is a Chrome extension, which sends Origin
  // chrome-extension://<id>. There is nothing to protect with CORS here (the
  // Authorization header is what authorizes), but the preflight must pass.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { ok: false, code: 'method' });

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return send(res, 500, { ok: false, code: 'server-misconfigured' });

  // ---- Who is asking ----
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let user;
  try {
    user = await verifyIdToken(token, projectId);
  } catch (e) {
    return send(res, 401, { ok: false, code: 'unauthorized', reason: e.code || 'invalid' });
  }

  // ---- What they sent ----
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return send(res, 400, { ok: false, code: 'bad-json' });
  }
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.slice(0, MAX_ITEMS).map(it => ({
    word: clip(it && it.word, MAX_WORD),
    original: clip(it && it.original, MAX_WORD),
    sentence: clip(it && it.sentence, MAX_SENTENCE)
  })).filter(it => it.word && it.sentence);
  if (!items.length) return send(res, 400, { ok: false, code: 'no-items' });

  // ---- Is there budget for it ----
  const limit = user.provider === 'anonymous' ? LIMIT_ANONYMOUS : LIMIT_SIGNED_IN;
  if (METERED && !quotaConfigured()) return send(res, 500, { ok: false, code: 'server-misconfigured' });

  // Unmetered, the count is still worth keeping - it is the usage record that
  // says when the caps need to come back - but it is only bookkeeping, so a
  // counter that is down or absent no longer costs the reader their check.
  let quota = { used: 0, limit, resetIn: 0 };
  try {
    if (quotaConfigured()) quota = await consume(user.uid, limit);
  } catch (e) {
    // Metered, this fails CLOSED. Serving without a working counter would put
    // the whole key pool behind an unmetered endpoint, and the cost of that is
    // unbounded; the cost of this is one page without an AI check.
    if (METERED) return send(res, 503, { ok: false, code: 'quota-unavailable' });
  }
  if (METERED && !quota.allowed) {
    return send(res, 429, {
      ok: false, code: 'quota-exceeded',
      used: quota.used, limit: quota.limit, resetIn: quota.resetIn,
      anonymous: user.provider === 'anonymous'
    });
  }

  // ---- Ask ----
  // The persona is built on the device from the reader's own ratings and
  // arrives as opaque text; it is clipped and embedded as plain content, never
  // trusted to carry instructions.
  const persona = clip(body.persona, MAX_PERSONA);
  const list = items.map((it, n) =>
    `${n + 1}. english="${it.word}" replaced_vietnamese="${it.original}" sentence="${it.sentence}"`
  ).join('\n');

  const prompt =
    'In each sentence below, one Vietnamese word/phrase was replaced by an English word. ' +
    'For each item decide whether the English word correctly expresses the replaced Vietnamese meaning in that sentence context. ' +
    'Return one object per item with "i" set to the item number shown and "ok" true when the word fits, false when it does not. ' +
    'When "ok" is false, set "better" to a single English word of similar or higher CEFR level that does fit; ' +
    'leave "better" empty when the word already fits or when no good replacement exists.\n' +
    (persona ? `The reader ${persona}. Prefer suggestions that suit them.\n` : '') +
    list;

  const out = await generate({
    prompt,
    maxOutputTokens: 60 + items.length * 28,
    schema: VERDICT_SCHEMA,
    seed: user.uid
  });

  if (!out.ok) {
    return send(res, 502, {
      ok: false, code: 'upstream', status: out.status, provider: out.provider,
      used: quota.used, limit: quota.limit
    });
  }

  const parsed = parseVerdictArray(out.text);
  if (!parsed) {
    return send(res, 502, {
      ok: false, code: 'bad-response', provider: out.provider,
      used: quota.used, limit: quota.limit
    });
  }

  // Default to "keep": an item the model skipped must never be reverted on the
  // strength of an answer nobody gave.
  const verdicts = new Array(items.length).fill(1);
  const betters = new Array(items.length).fill('');
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const n = Number(row.i);
    if (!Number.isInteger(n) || n < 1 || n > items.length) continue;
    const v = row.ok ? 1 : 0;
    verdicts[n - 1] = v;
    if (!v && typeof row.better === 'string') {
      betters[n - 1] = row.better.trim().split(/\s+/)[0].replace(/[^A-Za-z'-]/g, '').slice(0, 40);
    }
  }

  return send(res, 200, {
    ok: true,
    verdicts,
    betters,
    // `model` stays the raw id the provider knows it by - the extension shows
    // it verbatim in "Test the AI check" - and `provider` is added alongside
    // rather than folded into it, so that display keeps working unchanged.
    model: out.model,
    provider: out.provider,
    // `used` keeps counting while unmetered; `limit` is what would apply if the
    // caps came back. The flag is what stops a client turning those two into
    // "17 of 20 left" when nothing is actually being withheld.
    unlimited: !METERED,
    used: quota.used,
    limit: quota.limit,
    resetIn: quota.resetIn
  });
}
