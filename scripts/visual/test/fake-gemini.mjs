// A stand-in for the model, loaded with --import, used to exercise stages 01,
// 02 and 02b end to end without a key or a network.
//
// It is not a mock in the usual sense: it does not assert on calls or replay a
// fixture. It reads the ids out of the prompt the stage actually built and
// answers each one, so the render -> HTTP -> parse -> merge path runs for real
// and a change that breaks the prompt format or the parser shows up here. The
// ANSWERS are arbitrary; the plumbing is not.
//
//   node --import ./scripts/visual/test/fake-gemini.mjs scripts/visual/02-query.mjs
const realFetch = globalThis.fetch;

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
        return ids.map((id, i) => ({
            id,
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
            // vocabulary is actually enforced rather than merely documented.
            bucket: i % 7 === 6 ? 'not-a-real-bucket' : (buckets[i % buckets.length] || 'order')
        }));
    }
    return [];
}

globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (!href.includes('generativelanguage.googleapis.com')) return realFetch(url, init);
    const prompt = JSON.parse(init.body).contents[0].parts[0].text;
    const payload = JSON.stringify(answerFor(prompt));
    return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: payload }] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
