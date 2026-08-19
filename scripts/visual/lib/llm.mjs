// A small batching client for the one model this pipeline needs.
//
// Three things it has to get right, none of them clever:
//
//   1. Never ask twice. Every answer is written to a disk cache keyed by the
//      hash of the exact prompt, so a re-run after a crash - or after editing
//      one stage and re-running the lot - costs nothing. That matters more than
//      speed here: the free tier is a rate limit rather than a bill, and the
//      way to stay inside it is to not repeat questions.
//
//   2. Answer in a closed vocabulary. Every caller passes the permitted values
//      and anything outside them is dropped rather than trusted. A model
//      inventing a concept bucket would otherwise reach the extension as a word
//      with no glyph to draw.
//
//   3. Survive being interrupted. The cache is flushed after every batch, not
//      at the end of the run.
//
// --offline answers nothing and lets each caller fall back to its documented
// default. That is how the pipeline is tested without a key, and how you can
// see what a stage would do before spending any quota on it.
import { statePath, ensureState, readJson, writeJson } from './entries.mjs';
import crypto from 'node:crypto';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = process.env.MERID_LLM_MODEL || 'gemini-2.0-flash';

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
        this.offline = offline || !process.env.GEMINI_API_KEY;
        this.stats = { cached: 0, asked: 0, failed: 0, skipped: 0 };
        if (this.offline && !process.env.GEMINI_API_KEY) {
            console.log('[llm] no GEMINI_API_KEY - offline, cached answers only');
        }
    }

    static key(prompt, schemaName) {
        return crypto.createHash('sha256')
            .update(schemaName + ' ' + prompt).digest('hex').slice(0, 32);
    }

    save() { writeJson(this.file, this.cache); }

    /**
     * Ask about a batch of items.
     *
     * `items` stay opaque here: `render` turns them into the prompt and `parse`
     * turns the reply back into a Map keyed by whatever the caller uses.
     * Anything absent from that Map is simply unanswered, which every caller has
     * to handle regardless - models do skip items.
     */
    async askBatch(items, { render, parse, schemaName }) {
        const prompt = render(items);
        const key = Llm.key(prompt, schemaName);
        if (this.cache[key] !== undefined) { this.stats.cached++; return parse(this.cache[key]); }
        if (this.offline) { this.stats.skipped++; return new Map(); }

        const body = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' }
        };
        const url = ENDPOINT + '/' + MODEL + ':generateContent?key=' + process.env.GEMINI_API_KEY;

        // 429 from the free tier means "slower", not "no". Back off and keep the
        // run alive rather than throwing away the batches already paid for.
        for (let attempt = 0; attempt < 5; attempt++) {
            let resp;
            try {
                resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } catch (e) {
                await sleep(2000 * 2 ** attempt);
                continue;
            }
            if (resp.status === 429 || resp.status >= 500) {
                await sleep(2000 * 2 ** attempt);
                continue;
            }
            if (!resp.ok) {
                this.stats.failed++;
                console.warn('[llm] ' + resp.status + ' ' + resp.statusText + ' - skipping this batch');
                return new Map();
            }
            const json = await resp.json();
            const text = (((json || {}).candidates || [])[0] || {}).content
                ? json.candidates[0].content.parts[0].text : '';
            this.cache[key] = text;
            this.save();
            this.stats.asked++;
            return parse(text);
        }
        this.stats.failed++;
        console.warn('[llm] gave up on a batch after 5 attempts');
        return new Map();
    }

    report(label) {
        const s = this.stats;
        console.log('[llm] ' + label + ': ' + s.cached + ' from cache, ' + s.asked +
            ' asked, ' + s.skipped + ' skipped (offline), ' + s.failed + ' failed');
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
