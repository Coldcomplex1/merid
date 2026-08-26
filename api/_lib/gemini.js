// Gemini access for the proxy: a pool of keys, model discovery, and fallback.
//
// Model names are NOT hardcoded. Google adds and retires models continuously
// and the ids do not always match the display names in the AI Studio quota
// table, so the pool asks each key what it can actually run and ranks the
// answer. A key that gains a new model starts using it with no code change.

const MODELS_TTL_MS = 60 * 60 * 1000;   // re-discover hourly
const COOLDOWN_MS = 5 * 60 * 1000;      // skip a rate-limited pair for this long

// Warm-instance memory. A cold start simply rediscovers; nothing here is
// required for correctness, it only avoids repeating work and known failures.
const modelCache = new Map();   // keyId -> { models: string[], at: number }
const cooldown = new Map();     // `${keyId}|${model}` -> epoch ms

/** Keys come from one comma-separated env var so adding capacity is a config change. */
export function loadKeys() {
  return String(process.env.GEMINI_API_KEYS || '')
    .split(/[,\s]+/)
    .map(k => k.trim())
    .filter(Boolean);
}

/** Short, non-secret handle for a key - safe to use in cache keys and logs. */
function keyId(key) {
  return key.slice(-6);
}

// Anything that cannot answer a text question, however good it is otherwise.
const NON_TEXT = /(tts|image|imagen|embedding|embed|aqa|vision|audio|veo|live|computer-use|nano-banana)/i;

/**
 * Rank a model for this task: a yes/no verdict plus at most one replacement
 * word. The cheapest, highest-throughput tier is not a compromise here - it is
 * the right tool, and on the free tier the "lite" models carry a daily request
 * allowance roughly 25x the full Flash models (500/day vs 20/day), which is
 * what actually decides how many readers can be served.
 */
function score(name) {
  if (NON_TEXT.test(name)) return -1;
  let s = 0;
  if (/flash-lite/.test(name)) s += 1000;
  else if (/flash/.test(name)) s += 500;
  else if (/pro/.test(name)) s += 100;
  else s += 200;
  // Newer version wins within a tier (gemini-3.5-flash-lite > gemini-2.5-...).
  const v = parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1]);
  if (Number.isFinite(v)) s += v * 10;
  // A bare alias like "gemini-flash-lite-latest" tracks whatever is current,
  // which is usually what we want - nudge it above equally-scored fixed ids.
  if (/-latest$/.test(name)) s += 5;
  return s;
}

/** Ask one key which models it can actually call, best first. */
async function discoverModels(key) {
  const id = keyId(key);
  const hit = modelCache.get(id);
  if (hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.models;

  // x-goog-api-key, the same way callModel below authenticates.
  //
  // These two disagreed: generation sent the header and discovery put the key
  // in the query string. That was invisible while every key was an old-style
  // AIza one, which both paths accept. Google has since moved new keys to an
  // "auth key" format beginning AQ., and a key type that one path accepts and
  // the other does not fails HERE - discovery returns nothing, the pool decides
  // the key can call no model, and the caller is told the key works but has no
  // models rather than that it was refused.
  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    { headers: { 'x-goog-api-key': key } }
  );
  if (!resp.ok) {
    // A key that cannot even list models is broken (or fully blocked); cache an
    // empty list briefly so the pool moves on instead of retrying every request.
    modelCache.set(id, { models: [], at: Date.now() });
    return [];
  }
  const data = await resp.json();
  const models = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name || '').replace(/^models\//, ''))
    .filter(n => n && score(n) > 0)
    .sort((a, b) => score(b) - score(a));

  modelCache.set(id, { models, at: Date.now() });
  return models;
}

function isCooling(id, model, now) {
  const until = cooldown.get(`${id}|${model}`);
  return !!(until && until > now);
}

/**
 * Statuses worth trying elsewhere. Free-tier quotas are per model AND per
 * project, so both a different model on this key and the same model on another
 * key are genuine second chances. 400/401/403 are about the key itself.
 */
const RETRYABLE = new Set([404, 429, 500, 503]);

async function callModel(key, model, prompt, maxOutputTokens, schema) {
  const generationConfig = { temperature: 0, maxOutputTokens };
  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = schema;
  }
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
    }
  );
  if (!resp.ok) {
    let detail = '';
    try {
      const e = await resp.json();
      detail = String((e && e.error && e.error.message) || '').slice(0, 200);
    } catch (e) { /* non-JSON error body */ }
    return { ok: false, status: resp.status, detail };
  }
  const data = await resp.json();
  const text = ((((data.candidates || [])[0] || {}).content || {}).parts || [])
    .map(p => p.text || '').join('');
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
export const _internal = { score, keyId, NON_TEXT };
