// Qwen access for the proxy, through Alibaba Model Studio's OpenAI-compatible
// endpoint: a pool of keys, model discovery, and fallback.
//
// A sibling of _lib/gemini.js and deliberately the same shape - same generate()
// signature, same return contract, same key pool / cooldown / discovery
// mechanics - so _lib/ai.js can walk the two without knowing which is which.
// What differs is everything DashScope insists on that Google does not, and
// each of those is written down where it happens rather than left to be
// rediscovered from a 400.

const MODELS_TTL_MS = 60 * 60 * 1000;   // re-discover hourly
const COOLDOWN_MS = 5 * 60 * 1000;      // skip a rate-limited pair for this long

// Warm-instance memory. A cold start simply rediscovers; nothing here is
// required for correctness, it only avoids repeating work and known failures.
const modelCache = new Map();   // keyId -> { models: string[], at: number }
const cooldown = new Map();     // `${keyId}|${model}` -> epoch ms

// The international (Singapore) endpoint. A key minted on the mainland console
// is rejected here and vice versa - the same key string, 401 on the wrong host -
// so this is an environment variable rather than a constant: getting the region
// wrong is a config mistake, and it should be a config fix, not a deploy.
const DEFAULT_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

function baseUrl() {
  return String(process.env.QWEN_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

/** Keys come from one comma-separated env var so adding capacity is a config change. */
export function loadKeys() {
  return String(process.env.QWEN_API_KEYS || '')
    .split(/[,\s]+/)
    .map(k => k.trim())
    .filter(Boolean);
}

/** Short, non-secret handle for a key - safe to use in cache keys and logs. */
function keyId(key) {
  return key.slice(-6);
}

// Model ids are hyphen-delimited, so a marker is matched as a whole segment
// rather than a substring: "qwen3-asr-flash" is speech, but "flash" alone must
// not be what disqualifies it, and no text model should be lost to a stray match.
const NON_TEXT = new Set([
  'vl', 'audio', 'omni', 'asr', 'tts', 'image', 'video', 'embedding', 'embed',
  'rerank', 'ocr', 'mt', 'coder', 'math', 'realtime', 'livetranslate', 'captioner',
  // Not "non-text", but unusable here for a different reason: Model Studio
  // refuses structured output while thinking is on, and this task is nothing
  // but structured output.
  'thinking'
]);

/**
 * Rank a model for this task: a yes/no verdict plus at most one replacement
 * word.
 *
 * Flash first, and that is not a compromise - it is the right tool for one
 * boolean and one word. It also happens to be how the free allowance is
 * actually spent well: each model in the Model Studio quota table carries its
 * own 1M-token grant, so walking across many models multiplies the free
 * capacity, and the cheap tier is where that walk should start.
 *
 * Only qwen-* ids are ranked. The same account also serves deepseek-* and
 * glm-*; they are perfectly good models, but this file is the Qwen pool and
 * mixing them in would make "which provider answered" a lie. QWEN_MODELS names
 * them explicitly if they are ever wanted.
 */
function score(name) {
  if (!/^qwen/i.test(name)) return -1;
  if (name.toLowerCase().split('-').some(seg => NON_TEXT.has(seg))) return -1;

  let s = 0;
  if (/(^|-)flash(-|$)/.test(name)) s += 1000;
  else if (/(^|-)plus(-|$)/.test(name)) s += 500;
  else if (/-\d+b(-|$)/.test(name)) s += 300;   // open weights: qwen3.5-27b, qwen3.5-397b-a17b
  else if (/(^|-)max(-|$)/.test(name)) s += 100;
  else s += 200;

  // Newer version wins within a tier, and by a wide enough margin that a newer
  // model's dated snapshot still outranks an older model's alias.
  const v = parseFloat((name.match(/^qwen(\d+(?:\.\d+)?)/) || [])[1]);
  if (Number.isFinite(v)) s += v * 100;

  // A dated snapshot is the same model as its alias, so it loses the tie - but
  // it stays in the list, because it carries a separate free-token grant. That
  // makes it free fallback capacity, not a duplicate to be filtered out.
  if (/-\d{4}-\d{2}-\d{2}$/.test(name)) s -= 1;
  if (/-preview$/.test(name)) s -= 2;
  if (/-latest$/.test(name)) s += 5;
  return s;
}

// Used only when discovery returns nothing usable. Short on purpose: it exists
// so a listing outage degrades to "the obvious models" instead of to no service.
const SEED_MODELS = ['qwen3.7-flash', 'qwen3.6-flash', 'qwen3.7-plus', 'qwen-plus-latest'];

/** An explicit, ordered list from the environment wins over any ranking. */
function configuredModels() {
  return String(process.env.QWEN_MODELS || '')
    .split(/[,\s]+/)
    .map(m => m.trim())
    .filter(Boolean);
}

/** Ask one key which models it can actually call, best first. */
async function discoverModels(key) {
  const fixed = configuredModels();
  if (fixed.length) return fixed;

  const id = keyId(key);
  const hit = modelCache.get(id);
  if (hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.models;

  let models = [];
  try {
    const resp = await fetch(`${baseUrl()}/models`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      models = (data.data || [])
        .map(m => String((m && m.id) || ''))
        .filter(n => n && score(n) > 0)
        .sort((a, b) => score(b) - score(a));
    }
  } catch (e) { /* network or non-JSON body - fall through to the seed list */ }

  // Unlike Gemini, an empty answer here is not taken as "this key is broken".
  // Model Studio's listing endpoint is not the same surface as inference, and a
  // key that cannot list can still generate, so the seed list keeps the pool
  // working instead of writing the key off on the strength of a side endpoint.
  if (!models.length) models = SEED_MODELS.slice();

  modelCache.set(id, { models, at: Date.now() });
  return models;
}

function isCooling(id, model, now) {
  const until = cooldown.get(`${id}|${model}`);
  return !!(until && until > now);
}

/**
 * Statuses worth trying elsewhere.
 *
 * 400 is on this list, which it is not for Gemini, and that is the important
 * difference: Model Studio reports an exhausted allowance as 400 (Arrearage,
 * AllocationQuota.Exhausted), and a model that will not accept one of the
 * parameters below also answers 400. Both mean "ask a different model", which
 * is exactly what retrying does. 401/403 are about the key itself.
 */
const RETRYABLE = new Set([400, 404, 408, 429, 500, 502, 503]);

// Appended when the caller wants JSON. Three separate DashScope requirements
// are satisfied by this one sentence, and removing any part of it breaks a
// different one:
//   - the literal word "json" must appear in the messages or json_object mode
//     is rejected server-side with a 400;
//   - json_object mode returns an OBJECT, while api/check.js reads an ARRAY, so
//     the array has to be named and wrapped (ai.js unwraps it again);
//   - left to itself the model wraps the answer in a ```json fence.
// Lowercase "json" on purpose: the server-side check looks for the literal word,
// and it is not worth betting the whole provider on it being case-insensitive.
const JSON_ENVELOPE =
  '\nReply with json only, as {"items": [ ... ]} where items is the array of ' +
  'objects described above. No prose, no markdown fences.';

async function callModel(key, model, prompt, maxOutputTokens, schema) {
  const body = {
    model,
    messages: [{ role: 'user', content: schema ? prompt + JSON_ENVELOPE : prompt }],
    temperature: 0,
    // Headroom for the {"items": ...} wrapper the envelope above asks for. A
    // truncated answer is invalid JSON, which costs the whole batch, and these
    // are single-digit tokens.
    max_tokens: maxOutputTokens + 64,
    // Reasoning-capable Qwen3 models reject every non-streaming request unless
    // this is sent explicitly. Not a preference - without it most of the pool
    // is simply unreachable from here.
    enable_thinking: false
  };
  if (schema) body.response_format = { type: 'json_object' };

  const resp = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    let detail = '';
    try {
      // DashScope answers in the OpenAI error shape on some paths and its own
      // on others; read both rather than logging "undefined".
      const e = await resp.json();
      detail = String((e && e.error && e.error.message) || (e && e.message) || '').slice(0, 200);
    } catch (e) { /* non-JSON error body */ }
    return { ok: false, status: resp.status, detail };
  }

  const data = await resp.json();
  const text = String((((data.choices || [])[0] || {}).message || {}).content || '');
  return { ok: true, text };
}

/**
 * Run a prompt against the pool, walking keys and models until one answers.
 *
 * `seed` (the caller's uid) picks the starting key, so one reader stays on one
 * key - their model discovery and cooldowns stay warm - while different readers
 * spread across the pool instead of all hammering the first key.
 *
 * @returns {Promise<{ok:true, text:string, model:string, attempts:number}
 *                  | {ok:false, status:number, detail:string, attempts:number}>}
 */
export async function generate({ prompt, maxOutputTokens, schema, seed = '' }) {
  const keys = loadKeys();
  if (!keys.length) return { ok: false, status: 500, detail: 'no-keys-configured', attempts: 0 };

  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const start = Math.abs(h) % keys.length;

  const now = Date.now();
  let last = { ok: false, status: 503, detail: 'no-model-available' };
  let attempts = 0;

  for (let k = 0; k < keys.length; k++) {
    const key = keys[(start + k) % keys.length];
    const id = keyId(key);
    const models = await discoverModels(key);
    if (!models.length) continue;

    // Cooling-down models go last rather than being dropped: if everything is
    // cooling down we still ask, instead of failing without a single request.
    const hot = models.filter(m => !isCooling(id, m, now));
    const cool = models.filter(m => isCooling(id, m, now));

    for (const model of hot.concat(cool)) {
      attempts++;
      const res = await callModel(key, model, prompt, maxOutputTokens, schema);
      if (res.ok) return { ok: true, text: res.text, model, attempts };

      if (res.status === 429) cooldown.set(`${id}|${model}`, now + COOLDOWN_MS);
      if (res.status === 404) {
        // This key cannot run this model at all - drop it from the cached list
        // rather than cooling it down, so it is not retried for an hour.
        const cached = modelCache.get(id);
        if (cached) cached.models = cached.models.filter(m => m !== model);
      }
      last = res;
      // A rejected key is not a model problem: stop walking ITS models and let
      // the outer loop try the next key.
      if (!RETRYABLE.has(res.status)) break;
    }
  }
  return { ok: false, status: last.status || 503, detail: last.detail || '', attempts };
}

/** Exposed for tests. */
export const _internal = { score, keyId, baseUrl, NON_TEXT, SEED_MODELS, JSON_ENVELOPE };
