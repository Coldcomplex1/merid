// Which model provider answers a context check, and in what order.
//
// There was no such layer before: api/check.js imported Gemini directly and
// that was the whole story. Qwen is the default now - the point is to actually
// run on it, not to leave it as an option nobody reaches - but the AI check is
// an enhancement whose every failure path degrades to "no check", so dropping
// Gemini would trade a working fallback for nothing. It stays underneath.
//
// A provider here is any module exporting `loadKeys()` and the `generate()`
// contract that _lib/gemini.js defines. Both current providers were written to
// that shape deliberately, so this file never has to know which is which.
import * as gemini from './gemini.js';
import * as qwen from './qwen.js';

const PROVIDERS = { qwen, gemini };
const DEFAULT_ORDER = ['qwen', 'gemini'];

/**
 * The order to try, from the environment.
 *
 * Qwen first by default. This is an env var rather than a constant for the
 * same reason MERID_AI_METERED is one: if Qwen misbehaves, the fix should be
 * MERID_AI_PROVIDERS=gemini in the Vercel dashboard and the next request, not a
 * revert and a deploy. Unknown names are dropped rather than throwing - a typo
 * should cost one provider, not the endpoint.
 */
export function providerOrder() {
  const named = String(process.env.MERID_AI_PROVIDERS || '')
    .split(/[,\s]+/)
    .map(n => n.trim().toLowerCase())
    .filter(n => Object.prototype.hasOwnProperty.call(PROVIDERS, n));
  return named.length ? [...new Set(named)] : DEFAULT_ORDER.slice();
}

/**
 * Run a prompt against the first provider that can answer it.
 *
 * A provider with no keys configured is skipped rather than failed: a deploy
 * that only ever set GEMINI_API_KEYS should behave exactly as it did before
 * this file existed, and see no Qwen error for a provider it never asked for.
 *
 * @returns {Promise<{ok:true, text:string, model:string, provider:string, attempts:number}
 *                  | {ok:false, status:number, detail:string, provider:string, attempts:number}>}
 */
export async function generate(opts) {
  let last = null;
  let attempts = 0;

  for (const name of providerOrder()) {
    const provider = PROVIDERS[name];
    if (!provider.loadKeys().length) continue;

    const out = await provider.generate(opts);
    attempts += out.attempts || 0;
    if (out.ok) return { ...out, provider: name, attempts };
    last = { ...out, provider: name };
  }

  if (!last) {
    return { ok: false, status: 500, detail: 'no-keys-configured', provider: '', attempts: 0 };
  }
  return { ...last, attempts };
}

/**
 * Read the model's answer as the array of verdict objects api/check.js expects.
 *
 * Gemini is held to a response schema and returns a bare array, so for that
 * path this is JSON.parse with extra steps. Qwen cannot be: Model Studio's JSON
 * mode returns an object, never an array, so _lib/qwen.js asks for the array
 * under a key and this unwraps it again. The fence-stripping covers both - a
 * model that decides to be helpful and wrap its answer in ```json used to cost
 * the whole batch a 502.
 *
 * @returns {Array|null} null when there is no array to be found.
 */
export function parseVerdictArray(text) {
  let raw = String(text == null ? '' : text).trim();

  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) raw = fenced[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return null;
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    // {"items": [...]} is what qwen.js asks for by name; taking the first array
    // value rather than that exact key also survives a model that answered
    // {"results": [...]} instead, which is the same answer.
    for (const value of Object.values(parsed)) {
      if (Array.isArray(value)) return value;
    }
  }
  return null;
}

/** Exposed for tests. */
export const _internal = { providerOrder, parseVerdictArray, PROVIDERS };
