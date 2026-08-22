// A stand-in for the model, loaded with --import, used to exercise stages 01,
// 02 and 02b end to end without a key or a network.
//
// Not a mock in the usual sense: it does not assert on calls or replay a
// fixture. It reads the ids out of the prompt the stage actually built and
// answers each one, so render -> discovery -> HTTP -> parse -> merge runs for
// real and a change that breaks the prompt format or the parser shows up here.
// The ANSWERS are arbitrary; the plumbing is not.
//
// It also serves the model-list endpoint, because that is now part of the path:
// api/_lib/gemini.js discovers what a key can call rather than assuming, which
// is what stops a retired model name from being a dead end.
//
//   node --import ./scripts/visual/test/fake-gemini.mjs scripts/visual/02-query.mjs
//
// Environment switches, for reproducing the ways this goes wrong in the field:
//
//   MERID_FAKE_MODELS=a,b   the key can call exactly these
//   MERID_FAKE_MODELS=      the key lists nothing (a key with the API disabled)
//   MERID_FAKE_404=name     that model 404s, so the walk to the next one is tested
//   MERID_FAKE_KEY_BAD=1    the key itself is rejected
const realFetch = globalThis.fetch;

// Deliberately WITHOUT gemini-2.0-flash. That name was hardcoded once and 404ed
// against a real key; a default list containing it would let the same mistake
// pass this test.
const DEFAULT_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro'
];

function models() {
    const raw = process.env.MERID_FAKE_MODELS;
    if (raw === undefined) return DEFAULT_MODELS;
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function idsIn(prompt) {
    return [...prompt.matchAll(/^id: (\S+)$/gm)].map(m => m[1]);
}

function answerFor(prompt) {
    const ids = idsIn(prompt);
    // Which stage asked is obvious from what the prompt demands back.
    if (/"kind": "concrete"/.test(prompt)) {
        // Alternate, so both branches of every consumer get exercised.
        return ids.map((id, i) => ({ id, kind: i % 3 === 0 ? 'concrete' : 'abstract' }));
    }
    if (/"query"/.test(prompt)) {
        const kinds = ['object', 'action', 'role'];
        return ids.map((id, i) => ({
            id,
            // Cycle the kinds so the reporting and the parser's closed list are
            // both exercised; every fourth answer uses a name outside the list,
            // which must come back as no kind rather than as itself.
            kind: i % 4 === 3 ? 'something-else' : kinds[i % 3],
            query: id.replace(/-[0-9a-z]{4}$/, '') + ' photograph scene',
            negative: i % 2 ? ['a different sense', 'another meaning'] : [],
            // One in seven refuses, so the "not depictable" path is not dead code.
            depictable: i % 7 !== 6
        }));
    }
    if (/"bucket"/.test(prompt)) {
        const buckets = [...prompt.matchAll(/^ {2}([a-z][a-z-]+)$/gm)].map(m => m[1]);
        return ids.map((id, i) => ({
            id,
            // Every seventh answer is deliberately invalid, to prove the closed
            // vocabulary is enforced rather than merely documented.
            bucket: i % 7 === 6 ? 'not-a-real-bucket' : (buckets[i % buckets.length] || 'order')
        }));
    }
    return [];
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' }
});

globalThis.fetch = async (url, init) => {
    const href = String(url);
    // The HOST, not a substring of the URL. `includes` would also intercept
    // https://evil.test/?x=generativelanguage.googleapis.com, and a stub that
    // answers for the wrong host is a test that proves nothing.
    let host = '';
    try { host = new URL(href).host; } catch (e) { /* not a URL we handle */ }
    if (host !== 'generativelanguage.googleapis.com') return realFetch(url, init);

    if (process.env.MERID_FAKE_KEY_BAD) {
        return json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, 400);
    }

    // Discovery: GET /v1beta/models
    if (!/:generateContent/.test(href)) {
        return json({
            models: models().map(name => ({
                name: 'models/' + name,
                supportedGenerationMethods: ['generateContent']
            }))
        });
    }

    // Generation: POST /v1beta/models/<model>:generateContent
    const model = (href.match(/models\/([^:]+):generateContent/) || [])[1] || '';
    if (process.env.MERID_FAKE_404 && model === process.env.MERID_FAKE_404) {
        return json({ error: { message: 'models/' + model + ' is not found' } }, 404);
    }

    const prompt = JSON.parse(init.body).contents[0].parts[0].text;
    return json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(answerFor(prompt)) }] } }]
    });
};
