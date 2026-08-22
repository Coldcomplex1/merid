// Batching in front of the model, and a disk cache in front of that.
//
// The talking to Google is NOT done here. api/_lib/gemini.js already does it,
// has no imports, and knows two things this pipeline learned the hard way:
//
//   Model names cannot be hardcoded. Its header comment says so outright, and
//   its RETRYABLE set lists 404 alongside 429 - "this key cannot run that
//   model, try another" rather than "something is broken". An earlier version
//   of this file pinned `gemini-2.0-flash` and got a 404 on a perfectly good
//   key, which is exactly the failure that comment is warning about.
//
//   Which tier you land on decides whether the run is possible at all. Its
//   ranking prefers `flash-lite` because on the free tier those carry roughly
//   500 requests a day against 20 for full Flash. This pipeline needs about
//   130. On the wrong tier it is not slow, it is a week long.
//
// So what is left here is the part that is specific to a batch pipeline:
//
//   1. Never ask twice. Every answer is cached on disk under the hash of the
//      exact prompt, so a re-run after a crash - or after editing one stage and
//      re-running the lot - costs nothing. On a free tier that matters more
//      than speed: the limit is requests, not money.
//
//   2. Answer in a closed vocabulary. Callers pass the permitted values and
//      anything else is dropped rather than coerced. A model inventing a
//      concept name would otherwise reach the extension as a word with no glyph
//      to draw.
//
//   3. Fail loudly and early when the failure is permanent. A missing key or a
//      key that cannot list a single model will fail identically on all 73
//      batches, so it stops the run at the first one with a message naming the
//      likely cause. Transient trouble is counted and reported instead.
//
// --offline answers nothing and lets each caller fall back to its documented
// default. It is for seeing what a stage WOULD do. It is not a way to run the
// pipeline without a key: nothing downstream will have anything to work on.
import { statePath, ensureState, readJson, writeJson } from './entries.mjs';
import { generate, loadKeys, _internal } from '../../../api/_lib/gemini.js';
import crypto from 'node:crypto';

// Batches come back as a JSON array of up to 60 objects. The default is far
// too small for that and truncation looks exactly like a bad answer.
const MAX_OUTPUT_TOKENS = Number(process.env.MERID_LLM_MAX_TOKENS || 8192);

/**
 * Thrown when every remaining batch would fail the same way.
 *
 * Stages let this through rather than catching it: continuing past a key that
 * cannot work produces an empty output file and a confusing error three stages
 * later, which is the failure this whole pipeline just had.
 */
export class LlmUnusable extends Error {
    constructor(message) { super(message); this.name = 'LlmUnusable'; }
}

/**
 * The pooled client reads GEMINI_API_KEYS (plural, comma-separated). One key in
 * GEMINI_API_KEY is the ordinary case and the documented one, so accept it and
 * normalise rather than making the caller know which name a shared module
 * happens to want.
 */
function normaliseKeyEnv() {
    if (!process.env.GEMINI_API_KEYS && process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEYS = process.env.GEMINI_API_KEY;
    }
    return loadKeys();
}

/** Which models this key can actually call - asked once, to report, not to choose. */
async function listModels(key) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' +
        encodeURIComponent(key);
    let resp;
    try { resp = await fetch(url); } catch (e) {
        throw new LlmUnusable('could not reach the Gemini API: ' + e.message);
    }
    if (!resp.ok) {
        let detail = '';
        try {
            const body = await resp.json();
            detail = String((body && body.error && body.error.message) || '').slice(0, 200);
        } catch (e) { /* non-JSON error body */ }
        throw new LlmUnusable(
            'the key was rejected (HTTP ' + resp.status + ')' + (detail ? ': ' + detail : '') +
            '\n  An AI Studio key starts with "AIzaSy". A key starting with "AQ." is an' +
            '\n  ephemeral Live-API token and cannot be used here.' +
            '\n  Make one at https://aistudio.google.com/apikey');
    }
    const body = await resp.json();
    return (body.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => String(m.name || '').replace(/^models\//, ''));
}

export class Llm {
    /**
     * @param {object} opts
     * @param {string} opts.name      cache file name, one per stage
     * @param {boolean} opts.offline  answer nothing, spend nothing
     */
    constructor({ name, offline = false }) {
        ensureState();
        this.file = statePath('llm-cache-' + name + '.json');
        this.cache = readJson(this.file, {});
        this.keys = normaliseKeyEnv();
        this.offline = offline || !this.keys.length;
        this.checked = false;
        this.stats = { cached: 0, asked: 0, failed: 0, skipped: 0 };
        this.models = [];
        if (this.offline && !this.keys.length) {
            console.log('[llm] no GEMINI_API_KEY set - offline, cached answers only');
        }
    }

    static key(prompt, schemaName) {
        return crypto.createHash('sha256')
            .update(schemaName + ' ' + prompt).digest('hex').slice(0, 32);
    }

    save() { writeJson(this.file, this.cache); }

    /**
     * Check the key once, before spending a batch finding out it is broken.
     *
     * Reports the models it found, so a run that later behaves oddly can be
     * tied to the tier it actually landed on rather than the one assumed.
     */
    async preflight() {
        if (this.checked || this.offline) return;
        this.checked = true;
        this.models = await listModels(this.keys[0]);
        if (!this.models.length) {
            throw new LlmUnusable(
                'the key works but can call no text model at all.' +
                '\n  Enable the Generative Language API for its project, or make a new key' +
                '\n  at https://aistudio.google.com/apikey');
        }
        // Report the model that will actually be picked, using the same scorer
        // that picks it. Guessing separately here would print a name the run
        // then does not use, which is worse than printing nothing.
        const best = this.models.slice().sort((a, b) => _internal.score(b) - _internal.score(a))[0];
        console.log('[llm] key can call ' + this.models.length + ' models; starting with ' + best +
            (/flash-lite/.test(best)
                ? ' (the free tier gives these ~25x the daily requests of full Flash)'
                : ' - NOT a flash-lite model, so expect a small daily allowance'));
    }

    /**
     * Ask about a batch.
     *
     * `items` stay opaque: `render` builds the prompt and `parse` turns the
     * reply into a Map keyed by whatever the caller uses. Anything absent from
     * that Map is unanswered, which every caller handles anyway - models do
     * skip items.
     */
    async askBatch(items, { render, parse, schemaName }) {
        const prompt = render(items);
        const key = Llm.key(prompt, schemaName);
        if (this.cache[key] !== undefined) { this.stats.cached++; return parse(this.cache[key]); }
        if (this.offline) { this.stats.skipped++; return new Map(); }

        await this.preflight();

        const res = await generate({ prompt, maxOutputTokens: MAX_OUTPUT_TOKENS, seed: schemaName });
        if (!res.ok) {
            // Nothing answered on any model of any key. Another batch will do
            // the same thing, so say so now rather than 72 more times.
            if (res.detail === 'no-model-available' || res.detail === 'no-keys-configured') {
                throw new LlmUnusable(
                    'no model would answer (' + res.detail + ', ' + res.attempts + ' attempts).' +
                    '\n  Check the key at https://aistudio.google.com/apikey');
            }
            this.stats.failed++;
            console.warn('[llm] batch failed: HTTP ' + res.status +
                (res.detail ? ' ' + res.detail : '') + ' - carrying on');
            return new Map();
        }
        this.cache[key] = res.text;
        this.save();
        this.stats.asked++;
        this.lastModel = res.model;
        return parse(res.text);
    }

    report(label) {
        const s = this.stats;
        console.log('[llm] ' + label + ': ' + s.cached + ' from cache, ' + s.asked +
            ' asked, ' + s.skipped + ' skipped (offline), ' + s.failed + ' failed' +
            (this.lastModel ? ' [' + this.lastModel + ']' : ''));
        if (s.skipped && !s.asked && !s.cached) {
            console.log('[llm] NOTE: offline answered nothing, so the stages after this one' +
                '\n      will have nothing to work on. Offline shows what a stage would do;' +
                '\n      it is not a way to run the pipeline without a key.');
        }
    }
}

/** Pull the first JSON array or object out of a model reply. */
export function parseJsonish(text) {
    if (!text) return null;
    const trimmed = String(text).trim()
        .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(trimmed); } catch (e) { /* fall through */ }
    const start = trimmed.search(/[[{]/);
    if (start < 0) return null;
    const end = Math.max(trimmed.lastIndexOf(']'), trimmed.lastIndexOf('}'));
    if (end <= start) return null;
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch (e) { return null; }
}

/** Split into batches of `size`. */
export function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}
