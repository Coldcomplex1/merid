// Unit tests for the visitor counter's server-side pieces.
//
// The interesting question here is not "does it count" but "can a client make
// it store something we did not choose". Every value that reaches a Redis key
// is re-derived from an allowlist, and most of what follows is proving that -
// plus the one privacy claim the feature makes, that a raw IP address never
// reaches Redis at all.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

const PROJECT = 'merid-test';

process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.ANALYTICS_SALT = 'test-salt';
process.env.FIREBASE_PROJECT_ID = PROJECT;

const {
    EVENT_TYPES, PLACEMENTS, REASONS, MAX_ALL_TIME_DAYS,
    allTimeDays, clientIp, dayOffset, dayRange, isBot, isConfigured,
    normalizeEvent, normalizeLang, normalizePath, normalizePlacement, normalizePost,
    normalizeRef, readRange, record, visitorHash, withinRate,
    _internal, _resetTtlMemo,
} = await import('../api/_lib/analytics.js');

const { consume } = await import('../api/_lib/quota.js');
const summaryHandler = (await import('../api/analytics-summary.js')).default;

// ---------------------------------------------------------------------------
// A signed token, so the admin gate is exercised for real rather than stubbed.
// Same approach as api.test.mjs: a throwaway key pair plus a stubbed cert
// endpoint is the only way to prove the signature check actually runs.
// ---------------------------------------------------------------------------
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'analytics-test-kid';
const CERT_PEM = publicKey.export({ type: 'spki', format: 'pem' });

const b64url = (buf) => Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makeToken(claims = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        aud: PROJECT,
        iss: `https://securetoken.google.com/${PROJECT}`,
        sub: 'uid-admin', iat: now, auth_time: now, exp: now + 3600,
        firebase: { sign_in_provider: 'password' },
        ...claims,
    }));
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
    return `${header}.${payload}.${b64url(sig)}`;
}

// ---------------------------------------------------------------------------
// A fetch stub that records every pipeline body it is handed
// ---------------------------------------------------------------------------
let sent = [];
let nextResults = null;
/** What Firestore should answer when the admin gate reads admins/{uid}. */
let adminDocStatus = 200;

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    if (String(url).includes('upstash.io')) {
        const commands = JSON.parse(init.body);
        sent.push(commands);
        const results = nextResults ?? commands.map(() => ({ result: 1 }));
        return new Response(JSON.stringify(results), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    if (String(url).includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ [KID]: CERT_PEM }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' }
        });
    }
    if (String(url).includes('/documents/admins/')) {
        return new Response('{}', { status: adminDocStatus });
    }
    return realFetch(url, init);
};

/** A minimal stand-in for Vercel's response object. */
function mockRes() {
    return {
        code: 0, headers: {}, body: null,
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.code = c; return this; },
        send(b) { this.body = b; return this; },
        end() { return this; },
    };
}

async function callSummary({ token, days } = {}) {
    const res = mockRes();
    await summaryHandler(
        {
            method: 'GET',
            headers: token ? { authorization: `Bearer ${token}` } : {},
            query: days === undefined ? {} : { days: String(days) },
        },
        res,
    );
    return { code: res.code, body: res.body ? JSON.parse(res.body) : null };
}

/** Every command from every pipeline this test issued, flattened. */
const allCommands = () => sent.flat();
/** The whole conversation as one string - what actually crossed the wire. */
const wire = () => JSON.stringify(sent);

beforeEach(() => {
    sent = [];
    nextResults = null;
    adminDocStatus = 200;
    _resetTtlMemo();
    _internal.resetSince();
});

// ---------------------------------------------------------------------------
// Keyspace
// ---------------------------------------------------------------------------

test('analytics keys never collide with the quota counter', () => {
    assert.strictEqual(_internal.NS, 'merid:a');
    // quota.js owns merid:q:. A prefix collision would let a page view spend
    // somebody's AI-check allowance.
    for (const key of [
        _internal.dayKey('2026-08-09'),
        _internal.uniqueKey('2026-08-09'),
        _internal.refKey('2026-08-09'),
        _internal.postKey('2026-08-09'),
        _internal.rateKey('abc', 1),
    ]) {
        assert.ok(key.startsWith('merid:a:'), `${key} must be in the analytics namespace`);
        assert.ok(!key.startsWith('merid:q:'));
    }
});

test('day ranges are UTC, oldest first, and cross a month boundary correctly', () => {
    const now = Date.parse('2026-09-02T04:00:00Z');
    assert.deepStrictEqual(dayRange(now, 4), ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
    assert.strictEqual(dayOffset(now, 0), '2026-09-02');
    // Just after midnight UTC is still "today" in UTC even where it is yesterday.
    assert.strictEqual(dayOffset(Date.parse('2026-01-01T00:30:00Z'), 1), '2025-12-31');
});

// ---------------------------------------------------------------------------
// Normalisation - the security boundary
// ---------------------------------------------------------------------------

test('known paths keep their bucket, unknown ones collapse to "other"', () => {
    assert.strictEqual(normalizePath('/'), 'home');
    assert.strictEqual(normalizePath('/tutorial'), 'tutorial');
    assert.strictEqual(normalizePath('/tutorial/'), 'tutorial');
    assert.strictEqual(normalizePath('/blog/en/some-post'), 'blog');
    assert.strictEqual(normalizePath('/nope'), 'other');
    assert.strictEqual(normalizePath('/../../etc/passwd'), 'other');
    assert.strictEqual(normalizePath('x'.repeat(5000)), 'other');
    assert.strictEqual(normalizePath(''), 'other');
});

test('/admin is never counted', () => {
    // Our own visits to the dashboard are exactly the traffic that would make
    // the dashboard lie.
    assert.strictEqual(normalizePath('/admin'), null);
    assert.strictEqual(normalizePath('/admin/blog'), null);
    assert.strictEqual(normalizeEvent({ type: 'page', path: '/admin' }), null);
});

test('an unknown placement lands in "other" but still counts as a click', async () => {
    assert.strictEqual(normalizePlacement('hero'), 'hero');
    assert.strictEqual(normalizePlacement('<script>alert(1)</script>'), 'other');
    assert.strictEqual(normalizePlacement('a:b:c'), 'other');
    assert.strictEqual(normalizePlacement('x'.repeat(300)), 'other');

    // A stale deploy sending a placement we retired must not deflate the
    // funnel's numerator - the total still moves.
    await record(normalizeEvent({ type: 'cta', path: '/', where: 'made-up' }), 'h');
    const fields = allCommands().filter(c => c[0] === 'HINCRBY').map(c => c[2]);
    assert.ok(fields.includes('cta'));
    assert.ok(fields.includes('cta:other'));
});

test('referrers reduce to a bare host, dropping path and query', () => {
    assert.strictEqual(normalizeRef('https://www.Google.com/search?q=secret+thing'), 'google.com');
    assert.strictEqual(normalizeRef('https://news.ycombinator.com/item?id=1'), 'news.ycombinator.com');
    assert.strictEqual(normalizeRef(''), 'direct');
    assert.strictEqual(normalizeRef('not a url'), 'direct');
    assert.strictEqual(normalizeRef('https://merid.site/tutorial'), 'internal');
    assert.strictEqual(normalizeRef('https://blog.merid.site/x'), 'internal');
});

test('a referrer query string never reaches Redis', async () => {
    const event = normalizeEvent({
        type: 'page', path: '/', ref: 'https://mail.example.com/read?token=SECRET-TOKEN&user=someone@example.com',
    });
    await record(event, 'h');
    assert.ok(!wire().includes('SECRET-TOKEN'));
    assert.ok(!wire().includes('someone@example.com'));
    assert.ok(wire().includes('mail.example.com'));
});

test('language is vi or en, or absent', () => {
    assert.strictEqual(normalizeLang('vi'), 'vi');
    assert.strictEqual(normalizeLang('EN'), 'en');
    assert.strictEqual(normalizeLang('fr'), null);
    assert.strictEqual(normalizeLang(''), null);
});

test('blog post ids are server-validated, so the sorted set stays bounded', () => {
    assert.strictEqual(normalizePost('/blog/vie/hoc-tu-vung'), 'vie/hoc-tu-vung');
    assert.strictEqual(normalizePost('/blog/en/a-post/'), 'en/a-post');
    assert.strictEqual(normalizePost('/blog/xx/a-post'), null);      // not a blog language
    assert.strictEqual(normalizePost('/blog/en/Bad Slug!'), null);
    assert.strictEqual(normalizePost('/tutorial'), null);
});

test('unknown event types write nothing at all', async () => {
    assert.strictEqual(normalizeEvent({ type: 'exfiltrate', path: '/' }), null);
    assert.strictEqual(normalizeEvent({ type: '', path: '/' }), null);
    assert.strictEqual(normalizeEvent(null), null);
    assert.strictEqual(normalizeEvent('page'), null);
    assert.strictEqual(sent.length, 0, 'nothing may reach Redis for a rejected event');
});

test('survey reasons are filtered to the firestore.rules allowlist and de-duplicated', () => {
    const event = normalizeEvent({
        type: 'survey', path: '/goodbye',
        reasons: ['too-many', 'too-many', 'made-up', 'privacy', '<script>'],
    });
    assert.deepStrictEqual(event.reasons, ['too-many', 'privacy']);
});

test('the three allowlists are the ones the rest of the system expects', () => {
    assert.deepStrictEqual([...EVENT_TYPES].sort(), ['cta', 'page', 'survey']);
    // Mirrors FEEDBACK_REASONS in src/lib/feedback.ts and firestore.rules:201.
    assert.deepStrictEqual([...REASONS].sort(), [
        'not-useful', 'other', 'performance', 'privacy',
        'switched', 'testing', 'too-many', 'wrong-sites',
    ]);
    assert.ok(PLACEMENTS.has('hero') && PLACEMENTS.has('blog-cta'));
});

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

test('bots and header-less clients are dropped, real browsers are not', () => {
    for (const ua of [
        'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)',
        'ClaudeBot/1.0', 'Googlebot/2.1', 'curl/8.4.0', 'python-requests/2.31',
        'facebookexternalhit/1.1', 'WhatsApp/2.23', 'Zalo', 'HeadlessChrome/120',
    ]) {
        assert.ok(isBot(ua), `${ua} should be treated as a bot`);
    }
    assert.ok(isBot(''), 'no user-agent at all is a script, not a browser');
    assert.ok(isBot(undefined));

    assert.ok(!isBot(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ));
    assert.ok(!isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1'));
});

// ---------------------------------------------------------------------------
// The privacy claim
// ---------------------------------------------------------------------------

test('the visitor hash is stable within a day and different the next', () => {
    const a = visitorHash('203.0.113.7', 'Chrome', '2026-08-09');
    const b = visitorHash('203.0.113.7', 'Chrome', '2026-08-09');
    const nextDay = visitorHash('203.0.113.7', 'Chrome', '2026-08-10');
    const otherIp = visitorHash('203.0.113.8', 'Chrome', '2026-08-09');

    assert.strictEqual(a, b, 'the same visitor counts once per day');
    assert.notStrictEqual(a, nextDay, 'the hash must rotate, or it follows people across days');
    assert.notStrictEqual(a, otherIp);
});

test('the hash does not leak its inputs, and the salt changes it', () => {
    const ip = '203.0.113.7';
    const hash = visitorHash(ip, 'Chrome/126', '2026-08-09');
    assert.ok(!hash.includes(ip));
    assert.ok(!hash.includes('Chrome'));

    process.env.ANALYTICS_SALT = 'a-different-salt';
    assert.notStrictEqual(visitorHash(ip, 'Chrome/126', '2026-08-09'), hash);
    process.env.ANALYTICS_SALT = 'test-salt';
});

test('a raw IP address never reaches Redis', async () => {
    // The claim the privacy policy makes, asserted against the bytes that
    // actually cross the wire rather than against the code that builds them.
    const ip = '198.51.100.42';
    const hash = visitorHash(ip, 'Chrome', '2026-08-09');
    await record(normalizeEvent({ type: 'page', path: '/', lang: 'vi' }), hash);

    assert.ok(sent.length > 0, 'the test must actually have written something');
    assert.ok(!wire().includes(ip), 'the IP address must not appear in any command');
    assert.ok(!wire().includes('Chrome'), 'the user-agent must not appear either');
    assert.ok(wire().includes(hash), 'only the hash goes in');
});

test('clientIp reads the first forwarded hop and never crashes without one', () => {
    assert.strictEqual(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '1.2.3.4');
    assert.strictEqual(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }), '9.9.9.9');
    assert.strictEqual(clientIp({ headers: {} }), '');
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

test('a page view increments the total, the path and the unique-visitor sketch', async () => {
    await record(normalizeEvent({ type: 'page', path: '/tutorial', lang: 'vi' }), 'hash-1');
    const cmds = allCommands();

    assert.ok(cmds.some(c => c[0] === 'HINCRBY' && c[2] === 'pv'));
    assert.ok(cmds.some(c => c[0] === 'HINCRBY' && c[2] === 'pv:tutorial'));
    assert.ok(cmds.some(c => c[0] === 'HINCRBY' && c[2] === 'lang:vi'));
    assert.ok(cmds.some(c => c[0] === 'PFADD' && c[2] === 'hash-1'));
});

test('a first visit to /welcome is an install; a repeat visit is not', async () => {
    await record(normalizeEvent({ type: 'page', path: '/welcome', first: true }), 'h');
    assert.ok(allCommands().some(c => c[0] === 'HINCRBY' && c[2] === 'install'));

    sent = [];
    await record(normalizeEvent({ type: 'page', path: '/welcome' }), 'h');
    assert.ok(!allCommands().some(c => c[0] === 'HINCRBY' && c[2] === 'install'),
        'a refresh of /welcome is a page view, not a second install');
    assert.ok(allCommands().some(c => c[0] === 'HINCRBY' && c[2] === 'pv:welcome'));
});

test('a first visit to /goodbye is an uninstall', async () => {
    await record(normalizeEvent({ type: 'page', path: '/goodbye', first: true }), 'h');
    assert.ok(allCommands().some(c => c[0] === 'HINCRBY' && c[2] === 'uninstall'));
});

test('"first" on any other page counts nothing extra', async () => {
    // The flag is client-supplied, so it must be inert everywhere it is not
    // meaningful - otherwise it is a free counter for anyone who sends it.
    await record(normalizeEvent({ type: 'page', path: '/', first: true }), 'h');
    const fields = allCommands().filter(c => c[0] === 'HINCRBY').map(c => c[2]);
    assert.ok(!fields.includes('install'));
    assert.ok(!fields.includes('uninstall'));
});

test('a blog view counts the post as well as the page', async () => {
    await record(normalizeEvent({ type: 'page', path: '/blog/vie/hoc-tu-vung' }), 'h');
    const cmds = allCommands();
    assert.ok(cmds.some(c => c[0] === 'HINCRBY' && c[2] === 'blogpv'));
    assert.ok(cmds.some(c => c[0] === 'ZINCRBY' && c[3] === 'vie/hoc-tu-vung'));
});

test('an internal referrer is not recorded as a traffic source', async () => {
    await record(normalizeEvent({ type: 'page', path: '/tutorial', ref: 'https://merid.site/' }), 'h');
    assert.ok(!allCommands().some(c => c[0] === 'ZINCRBY' && c[1].includes(':ref:')));
});

test('every key written gets a TTL, and never one that extends an existing window', async () => {
    await record(normalizeEvent({ type: 'page', path: '/', ref: 'https://x.com/a' }), 'h');
    const expires = allCommands().filter(c => c[0] === 'EXPIRE');
    assert.ok(expires.length > 0);
    for (const cmd of expires) {
        assert.strictEqual(cmd[2], String(_internal.TTL_SECONDS));
        assert.strictEqual(cmd[3], 'NX', 'NX or a busy key never expires');
    }
});

test('the TTL is only re-sent after the warm instance forgets it', async () => {
    await record(normalizeEvent({ type: 'page', path: '/' }), 'h');
    const first = allCommands().filter(c => c[0] === 'EXPIRE').length;
    assert.ok(first > 0);

    sent = [];
    await record(normalizeEvent({ type: 'page', path: '/' }), 'h');
    assert.strictEqual(allCommands().filter(c => c[0] === 'EXPIRE').length, 0,
        'a warm instance should not pay for the same EXPIRE twice');
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

test('the rate limiter is its own round trip, so it can actually short-circuit', async () => {
    nextResults = [{ result: 5 }, { result: 1 }];
    assert.strictEqual(await withinRate('h', Date.now(), 60), true);
    assert.strictEqual(sent.length, 1, 'the check must complete before any write is issued');

    sent = [];
    nextResults = [{ result: 61 }, { result: 1 }];
    assert.strictEqual(await withinRate('h', Date.now(), 60), false);
});

test('an unreadable counter lets the visitor through rather than losing them', async () => {
    nextResults = [{ result: null }, { result: null }];
    assert.strictEqual(await withinRate('h', Date.now(), 60), true);
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

test('range uniques are one PFCOUNT over every day, not one per day', async () => {
    nextResults = null;
    await readRange(30).catch(() => {});
    const cmds = sent[0];
    const unions = cmds.filter(c => c[0] === 'PFCOUNT' && c.length > 2);
    assert.strictEqual(unions.length, 2, 'one union for the range, one for the previous range');
    assert.strictEqual(unions[0].length - 1, 30,
        'PFCOUNT over N keys returns the union - that is the whole reason for a HyperLogLog here');
});

test('a read issues exactly one pipeline and writes nothing', async () => {
    await readRange(7).catch(() => {});
    assert.strictEqual(sent.length, 1, 'the dashboard is one round trip');
    const writes = sent[0].filter(c => ['HINCRBY', 'PFADD', 'ZINCRBY', 'SET', 'EXPIRE', 'DEL'].includes(c[0]));
    assert.deepStrictEqual(writes, [], 'reading the dashboard must never modify the data');
});

test('a day with no data becomes a zero row, not a gap', async () => {
    // Redis answers an absent hash with an empty result; a missing row would
    // put a NaN in the chart path and blank the whole graph.
    nextResults = new Array(400).fill({ result: null });
    const summary = await readRange(7);
    assert.strictEqual(summary.series.length, 7);
    for (const row of summary.series) {
        assert.strictEqual(row.pageviews, 0);
        assert.strictEqual(row.uniques, 0);
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(row.day));
    }
    assert.strictEqual(summary.totals.pageviews, 0);
});

test('the summary sums hash fields across days and ranks the breakdowns', async () => {
    const days = 3;
    const hash = ['pv', '10', 'pv:home', '6', 'pv:tutorial', '4', 'cta', '2', 'cta:hero', '2', 'lang:vi', '9'];
    const results = [];
    for (let i = 0; i < days; i++) results.push({ result: hash });      // current
    for (let i = 0; i < days; i++) results.push({ result: [] });        // previous
    for (let i = 0; i < days; i++) results.push({ result: 3 });         // daily uniques
    results.push({ result: 7 });                                        // range union
    results.push({ result: 0 });                                        // previous union
    for (let i = 0; i < days; i++) results.push({ result: ['google.com', '2'] });
    for (let i = 0; i < days; i++) results.push({ result: [] });
    results.push({ result: '2026-06-01' });
    nextResults = results;

    const summary = await readRange(days);
    assert.strictEqual(summary.totals.pageviews, 30);
    assert.strictEqual(summary.totals.uniques, 7, 'uniques come from the union, never from a sum');
    assert.strictEqual(summary.totals.cta, 6);
    assert.strictEqual(summary.since, '2026-06-01');
    assert.deepStrictEqual(summary.paths[0], { path: 'home', pageviews: 18 });
    assert.deepStrictEqual(summary.placements[0], { where: 'hero', clicks: 6 });
    assert.deepStrictEqual(summary.referrers[0], { host: 'google.com', visits: 6 });
    assert.strictEqual(summary.langs.vi, 27);
    assert.strictEqual(summary.series.length, days);
});

// ---------------------------------------------------------------------------
// The refactor that touched the AI proxy
// ---------------------------------------------------------------------------

test('the quota counter still fails with code "quota-store" after the redis.js extraction', async () => {
    // api/check.js fails CLOSED on this path; if the error identity changed,
    // the AI check would start answering the wrong thing on an Upstash outage.
    const stub = globalThis.fetch;
    globalThis.fetch = async () => new Response('nope', { status: 500 });
    try {
        await consume('uid-1', 20);
        assert.fail('a 500 from the store must throw');
    } catch (e) {
        assert.strictEqual(e.code, 'quota-store');
    } finally {
        globalThis.fetch = stub;
    }
});

// ---------------------------------------------------------------------------
// The admin boundary on the read endpoint
// ---------------------------------------------------------------------------

test('the summary refuses everyone who is not a signed-in admin', async () => {
    const noToken = await callSummary({});
    assert.strictEqual(noToken.code, 401);
    assert.strictEqual(noToken.body.code, 'unauthorized');

    const forged = await callSummary({ token: 'not.a.token' });
    assert.strictEqual(forged.code, 401);

    // Firestore answered, and there is no admins/{uid} document: a real "not you".
    adminDocStatus = 404;
    const notAdmin = await callSummary({ token: makeToken() });
    assert.strictEqual(notAdmin.code, 403);
    assert.strictEqual(notAdmin.body.code, 'not-admin');

    // Firestore refused a read it should always allow: the rules are not deployed,
    // which is a server problem, not an answer about this account.
    adminDocStatus = 403;
    const noRules = await callSummary({ token: makeToken() });
    assert.strictEqual(noRules.code, 503);
    assert.strictEqual(noRules.body.code, 'rules-not-deployed');
});

test('an admin gets the summary, and no Redis call happens before the gate passes', async () => {
    adminDocStatus = 404;
    await callSummary({ token: makeToken() });
    assert.strictEqual(sent.length, 0, 'a refused caller must never reach the counter store');

    adminDocStatus = 200;
    const ok = await callSummary({ token: makeToken(), days: 7 });
    assert.strictEqual(ok.code, 200);
    assert.strictEqual(ok.body.ok, true);
    assert.strictEqual(ok.body.range.days, 7);
    assert.strictEqual(ok.body.series.length, 7);
});

test('the day range is clamped, so it can never be free text in a key', async () => {
    for (const [asked, expected] of [[0, 1], [-5, 1], [10_000, 90], ['abc', 30], [45, 45]]) {
        const r = await callSummary({ token: makeToken(), days: asked });
        assert.strictEqual(r.body.range.days, expected, `days=${asked}`);
    }
});

// ---------------------------------------------------------------------------
// All time
// ---------------------------------------------------------------------------

test('all time spans from the first day recorded to today', async () => {
    const now = Date.parse('2026-08-09T12:00:00Z');
    nextResults = [{ result: '2026-08-01' }];
    assert.strictEqual(await allTimeDays(now), 9, 'inclusive of both ends');

    nextResults = [{ result: '2026-08-09' }];
    assert.strictEqual(await allTimeDays(now), 1, 'switched on today is one day');
});

test('all time survives a missing or nonsense "since" marker', async () => {
    const now = Date.parse('2026-08-09T12:00:00Z');
    for (const since of [null, '', 'not-a-date', '2026-13-45']) {
        nextResults = [{ result: since }];
        assert.strictEqual(await allTimeDays(now), 1, `since=${since}`);
    }
});

test('all time is capped at the data\'s own TTL', async () => {
    // Days older than the TTL have expired, so reading further back could only
    // ever cost commands and return nothing.
    nextResults = [{ result: '2019-01-01' }];
    const span = await allTimeDays(Date.parse('2026-08-09T12:00:00Z'));
    assert.strictEqual(span, MAX_ALL_TIME_DAYS);
    assert.ok(span >= 365 && span <= 400, `${span} should be about a year`);
});

test('all time reads no previous period, so it costs half the commands', async () => {
    await readRange(30, Date.now(), { comparePrevious: false }).catch(() => {});
    const withoutPrevious = sent[0].length;

    sent = [];
    await readRange(30).catch(() => {});
    const withPrevious = sent[0].length;

    assert.ok(withoutPrevious < withPrevious);
    // One HGETALL per day plus one union PFCOUNT is what the previous period costs.
    assert.strictEqual(withPrevious - withoutPrevious, 31);
});

test('all time reports zero for the previous period rather than a bogus delta', async () => {
    nextResults = new Array(200).fill({ result: null });
    const summary = await readRange(5, Date.now(), { comparePrevious: false });
    assert.strictEqual(summary.previous.pageviews, 0);
    assert.strictEqual(summary.previous.uniques, 0);
    assert.strictEqual(summary.series.length, 5);
});

test('days=all resolves server-side and is flagged in the response', async () => {
    // The span must come out as a number before it goes anywhere near a key.
    nextResults = [{ result: '2026-08-01' }];
    const r = await callSummary({ token: makeToken(), days: 'all' });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.allTime, true);
    assert.ok(Number.isInteger(r.body.range.days));
    assert.ok(r.body.range.days >= 1);

    // A normal range is not flagged, and still carries a comparison.
    const normal = await callSummary({ token: makeToken(), days: 30 });
    assert.strictEqual(normal.body.allTime, false);
    assert.strictEqual(normal.body.range.days, 30);
});

test('"all" is the only non-numeric range accepted; anything else falls back', async () => {
    for (const bad of ['everything', 'all-time', '../../etc', 'Infinity', 'NaN']) {
        const r = await callSummary({ token: makeToken(), days: bad });
        assert.strictEqual(r.body.allTime, false, `days=${bad} must not mean all time`);
        assert.strictEqual(r.body.range.days, 30, `days=${bad} should fall back to the default`);
    }
});

test('an unconfigured store names the variables instead of failing blank', async () => {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
        const r = await callSummary({ token: makeToken() });
        assert.strictEqual(r.code, 503);
        assert.strictEqual(r.body.code, 'not-configured');
        assert.deepStrictEqual(r.body.missing,
            ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']);
    } finally {
        process.env.UPSTASH_REDIS_REST_URL = url;
        process.env.UPSTASH_REDIS_REST_TOKEN = token;
    }
});

test('isConfigured needs both halves of the Upstash credentials', () => {
    assert.ok(isConfigured());
    const url = process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    assert.ok(!isConfigured(), 'half a credential is not a configured store');
    process.env.UPSTASH_REDIS_REST_URL = url;
});
