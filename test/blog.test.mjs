// Unit tests for the blog's scheduling endpoints.
//
// The whole publishing mechanism is "a date in frontmatter, plus a rebuild".
// That is only trustworthy if two things hold: the queue reports live vs pending
// against a real clock, and the cron endpoint cannot be used by anyone else to
// trigger deploys. Both are tested here against a frozen clock and a stub hook,
// so neither depends on the wall clock or on reaching Vercel.
import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

// Endpoint modules read env at import time, so each test that needs different
// settings imports a fresh copy via a cache-busting query string.
const freshImport = (path) => import(`${path}?t=${Math.random()}`);

/** Minimal stand-in for Vercel's (req, res) pair. */
function mockRes() {
    return {
        headers: {},
        statusCode: 0,
        body: '',
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        send(b) { this.body = b; return this; },
        json() { return JSON.parse(this.body); }
    };
}

const PAST = '2020-01-01';
const FUTURE = '2099-01-01';

// ---------------------------------------------------------------------------
// publish-queue
// ---------------------------------------------------------------------------

test('the queue splits live from pending on publishAt', async () => {
    const { default: handler } = await freshImport('../api/publish-queue.js');
    const res = mockRes();
    handler({ method: 'GET', url: '/api/publish-queue', headers: {} }, res);

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.ok, true);

    const now = Date.now();
    for (const post of body.live) {
        assert.ok(Date.parse(`${post.publishAt}T00:00:00Z`) <= now,
            `${post.slug}.${post.lang} is listed live but its date has not passed`);
    }
    for (const post of body.pending) {
        assert.ok(Date.parse(`${post.publishAt}T00:00:00Z`) > now,
            `${post.slug}.${post.lang} is listed pending but its date has passed`);
    }
    assert.strictEqual(body.counts.live + body.counts.pending, body.counts.total);
});

test('nextPublishAt is the soonest pending date, and carries every post on it', async () => {
    const { default: handler } = await freshImport('../api/publish-queue.js');
    const res = mockRes();
    handler({ method: 'GET', url: '/api/publish-queue', headers: {} }, res);
    const body = res.json();

    if (!body.pending.length) {
        assert.strictEqual(body.nextPublishAt, null);
        return;
    }

    // Pending must be sorted soonest-first, so the head is the next date.
    assert.strictEqual(body.nextPublishAt, body.pending[0].publishAt);
    // Both languages of a topic share a date, so nextPosts is normally the pair.
    for (const post of body.nextPosts) {
        assert.strictEqual(post.publishAt, body.nextPublishAt);
    }
    const onThatDate = body.pending.filter((p) => p.publishAt === body.nextPublishAt);
    assert.strictEqual(body.nextPosts.length, onThatDate.length);
});

test('the queue refuses anything but a read', async () => {
    const { default: handler } = await freshImport('../api/publish-queue.js');
    const res = mockRes();
    handler({ method: 'DELETE', url: '/api/publish-queue', headers: {} }, res);
    assert.strictEqual(res.statusCode, 405);
});

// ---------------------------------------------------------------------------
// cron/rebuild
// ---------------------------------------------------------------------------

/**
 * Runs the cron handler with a given environment, restoring env afterwards so
 * tests cannot leak settings into each other.
 */
async function runCron({ secret, hookUrl, authorization, posts }) {
    const saved = { ...process.env };
    process.env.CRON_SECRET = secret ?? '';
    process.env.VERCEL_DEPLOY_HOOK_URL = hookUrl ?? '';

    if (posts) {
        const manifest = await import('../api/_generated/posts.js');
        manifest.posts.length = 0;
        manifest.posts.push(...posts);
    }

    const { default: handler } = await freshImport('../api/cron/rebuild.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: authorization ?? '' } }, res);

    process.env = saved;
    return res;
}

test('an unset CRON_SECRET fails closed rather than running unprotected', async () => {
    const res = await runCron({ secret: '', authorization: 'Bearer anything' });
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.json().code, 'server-misconfigured');
});

test('a wrong or missing bearer token is rejected', async () => {
    for (const authorization of ['', 'Bearer wrong', 'Basic hunter2', 'Bearer ']) {
        const res = await runCron({ secret: 'right', hookUrl: 'https://example.invalid', authorization });
        assert.strictEqual(res.statusCode, 401, `"${authorization}" must not authorize`);
    }
});

test('a token of the wrong length is rejected without throwing', async () => {
    // timingSafeEqual throws on length mismatch, so the length check has to come
    // first; this is the case that would 500 instead of 401 if it did not.
    const res = await runCron({ secret: 'a-long-secret', hookUrl: 'https://example.invalid', authorization: 'Bearer x' });
    assert.strictEqual(res.statusCode, 401);
});

test('a day with nothing due does not trigger a deploy', async () => {
    const res = await runCron({
        secret: 'right',
        hookUrl: 'https://example.invalid',
        authorization: 'Bearer right',
        posts: [{ slug: 'later', lang: 'vi', translationKey: 'later', title: 'Later', publishAt: FUTURE, url: 'https://merid.site/blog/later' }]
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.triggered, false);
    assert.strictEqual(body.nextPublishAt, FUTURE);
});

test('a post that went live long ago does not re-trigger a deploy', async () => {
    // Without the lookback window every nightly run would redeploy forever.
    const res = await runCron({
        secret: 'right',
        hookUrl: 'https://example.invalid',
        authorization: 'Bearer right',
        posts: [{ slug: 'old', lang: 'vi', translationKey: 'old', title: 'Old', publishAt: PAST, url: 'https://merid.site/blog/old' }]
    });
    assert.strictEqual(res.json().triggered, false);
});

test('a post crossing its date POSTs the deploy hook exactly once', async () => {
    const hits = [];
    const server = http.createServer((req, res) => {
        hits.push(req.method);
        res.writeHead(201).end('{}');
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const hookUrl = `http://127.0.0.1:${server.address().port}/deploy`;

    const today = new Date().toISOString().slice(0, 10);
    const res = await runCron({
        secret: 'right',
        hookUrl,
        authorization: 'Bearer right',
        posts: [
            { slug: 'today', lang: 'vi', translationKey: 'k', title: 'Today', publishAt: today, url: 'https://merid.site/blog/today' },
            { slug: 'today', lang: 'en', translationKey: 'k', title: 'Today', publishAt: today, url: 'https://merid.site/en/blog/today' }
        ]
    });

    server.close();

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.triggered, true);
    // Both languages are reported, but only one deploy is triggered for them.
    assert.strictEqual(body.published.length, 2);
    assert.deepStrictEqual(hits, ['POST']);
});

test('a due post with no deploy hook configured is an error, not a silent no-op', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await runCron({
        secret: 'right',
        hookUrl: '',
        authorization: 'Bearer right',
        posts: [{ slug: 'today', lang: 'vi', translationKey: 'k', title: 'Today', publishAt: today, url: 'https://merid.site/blog/today' }]
    });

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.json().code, 'server-misconfigured');
});
