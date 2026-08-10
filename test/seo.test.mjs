// The signals that decide whether a page can be indexed at all: canonicals,
// redirects, and what the sitemap advertises.
//
// These were the one part of the routing story with no coverage, which is how
// the site ended up shipping a homepage canonical on every marketing page and
// linking its own navbar at a URL that 308s.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import handler, { resolveRoute } from '../api/blog-render.js'
import { MARKETING_PATHS, SITE_URL } from '../api/_lib/blog-config.js'
import { SEO_ROUTES, withCanonical } from '../scripts/prerender-seo.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------------------
// Per-route canonicals
// ---------------------------------------------------------------------------

const SHELL = `<!doctype html>
<html lang="vi"><head>
<link rel="canonical" href="https://merid.site/" />
<meta property="og:url" content="https://merid.site/" />
</head><body><div id="root"></div></body></html>`

test('every prerendered route points its canonical at itself', () => {
    for (const route of SEO_ROUTES) {
        const html = withCanonical(SHELL, route)
        assert.ok(
            html.includes(`<link rel="canonical" href="${SITE_URL}${route}" />`),
            `${route} did not get its own canonical`,
        )
        // A canonical and an og:url that disagree are worse than either alone.
        assert.ok(
            html.includes(`<meta property="og:url" content="${SITE_URL}${route}" />`),
            `${route} did not get a matching og:url`,
        )
    }
})

test('the rewrite touches nothing but the two URLs', () => {
    const html = withCanonical(SHELL, '/tutorial')
    assert.ok(html.includes('<div id="root"></div>'))
    assert.ok(html.includes('<html lang="vi">'))
    assert.ok(!html.includes('href="https://merid.site/"'))
})

test('a missing tag fails the build instead of shipping the homepage canonical', () => {
    // The failure this guards against is silent: a head reshuffle that stops
    // matching, every page keeps the homepage canonical, and nothing complains.
    assert.throws(
        () => withCanonical('<html><head></head></html>', '/tutorial'),
        /canonical/,
    )
    assert.throws(
        () => withCanonical('<html><head><link rel="canonical" href="/" /></head></html>', '/tutorial'),
        /og:url/,
    )
})

test('index.html still carries the tags the prerender step rewrites', () => {
    // withCanonical is only ever pointed at dist/index.html, which is this file
    // with the assets hashed. If the head is edited into a shape the regexes
    // miss, this fails here rather than at deploy time.
    const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8')
    const html = withCanonical(indexHtml, '/privacy-policy')
    assert.ok(html.includes(`href="${SITE_URL}/privacy-policy"`))
    assert.ok(html.includes(`content="${SITE_URL}/privacy-policy"`))
})

test('every indexable marketing page gets prerendered', () => {
    for (const path of MARKETING_PATHS) {
        assert.ok(SEO_ROUTES.includes(path), `${path} is in the sitemap but has no canonical`)
    }
})

// ---------------------------------------------------------------------------
// Internal links
// ---------------------------------------------------------------------------

function sourceFiles(dir) {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) return sourceFiles(path)
        return /\.(ts|tsx)$/.test(entry) ? [path] : []
    })
}

test('nothing in the app links to /en/blog', () => {
    // /en/blog permanently redirects to /blog/en. Linking to it from the navbar
    // and footer made Googlebot eat a 308 on every page of the site and file the
    // URL under "Page with redirect, not indexed". Internal links go to the
    // final URL; the redirect exists for inbound links we do not control.
    const offenders = sourceFiles(join(ROOT, 'src')).filter((path) =>
        readFileSync(path, 'utf8').includes('/en/blog'),
    )
    assert.deepEqual(offenders, [])
})

test('the legacy blog URLs still redirect', () => {
    // The fix above is "stop linking to it", not "delete it". Removing these
    // turns every old inbound link into a 404, which is strictly worse.
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
    const sources = vercel.redirects.map((r) => r.source)
    assert.ok(sources.includes('/en/blog'))
    assert.ok(sources.includes('/en/blog/:slug'))
    assert.ok(vercel.redirects.every((r) => r.permanent))
})

test('/blog/vie resolves to a redirect, not a second copy of the index', () => {
    assert.deepEqual(resolveRoute({ url: '/blog/vie' }), { route: 'redirect' })
    assert.equal(resolveRoute({ url: '/blog/vie/' }).route, 'redirect')
    // The posts underneath it are real pages, not redirects.
    assert.deepEqual(resolveRoute({ url: '/blog/vie/hoc-tu-vung' }), {
        route: 'post',
        lang: 'vie',
        slug: 'hoc-tu-vung',
    })
})

// ---------------------------------------------------------------------------
// The SPA fallback
// ---------------------------------------------------------------------------

/** Router paths (src/App.tsx) that prerender-seo.mjs writes no file for, so the
 *  catch-all rewrite is the only thing that can serve them. The signed-in half
 *  of the site is all of it, plus whatever an unknown URL should be: the router
 *  has a '*' route that renders the homepage, and it only ever runs if Vercel
 *  hands the shell over instead of answering 404 itself. */
const SHELL_ONLY_ROUTES = [
    '/login',
    '/signup',
    '/my-deck',
    '/admin',
    '/admin/blog',
    '/admin/blog/new',
    '/admin/blog/abc123/edit',
    '/a-url-nobody-has-ever-visited',
]

test('the SPA fallback points somewhere cleanUrls can actually serve', () => {
    // cleanUrls serves dist/tutorial.html at /tutorial, which is the whole
    // point of the prerender step above -- but it does that by making the built
    // HTML addressable *only* at the extensionless path. A fallback pointing at
    // /index.html then resolves to nothing, and every path in SHELL_ONLY_ROUTES
    // answers Vercel's own 404 rather than the app. That shipped once: /admin
    // and the rest of the signed-in site went dark the day cleanUrls landed,
    // while the prerendered marketing pages kept working and hid it.
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
    const fallback = vercel.rewrites.at(-1)

    assert.ok(vercel.cleanUrls, 'this test is about the cleanUrls interaction')
    assert.ok(fallback.source.includes('(?!api/)'), 'the catch-all is no longer last')
    assert.ok(
        !fallback.destination.endsWith('.html'),
        `the fallback points at ${fallback.destination}, which cleanUrls does not serve`,
    )
})

test('the catch-all covers every path that has no file of its own', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
    const fallback = vercel.rewrites.at(-1)
    // The source is written as a bare regex, so it reads as one here. Vercel
    // compiles it with path-to-regexp, which for a pattern with no :params is
    // the same match.
    const covers = new RegExp(`^${fallback.source}$`)

    for (const path of SHELL_ONLY_ROUTES) {
        assert.ok(covers.test(path), `${path} would 404 instead of reaching the router`)
    }

    // The exclusion earns its keep: an unknown API path should stay a 404
    // rather than be handed a copy of the HTML shell.
    assert.ok(!covers.test('/api/not-a-function'))
})

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

/** Minimal stand-in for a Node response, enough for the handler's send(). */
function fakeRes() {
    return {
        statusCode: 0,
        headers: {},
        body: '',
        setHeader(key, value) {
            this.headers[key.toLowerCase()] = value
        },
        end(body) {
            this.body = body ?? ''
        },
    }
}

async function renderRoute(url) {
    const realFetch = globalThis.fetch
    // No posts: this is about the hand-written URLs, and an empty Firestore
    // answer keeps the test off the network.
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [] })
    try {
        const res = fakeRes()
        await handler({ method: 'GET', url }, res)
        return res
    } finally {
        globalThis.fetch = realFetch
    }
}

test('the sitemap lists the marketing pages, not just the blog', () => {
    return renderRoute('/sitemap.xml').then((res) => {
        assert.equal(res.statusCode, 200)
        assert.match(res.headers['content-type'], /application\/xml/)

        assert.ok(res.body.includes(`<loc>${SITE_URL}/</loc>`))
        for (const path of MARKETING_PATHS) {
            assert.ok(res.body.includes(`<loc>${SITE_URL}${path}</loc>`), `${path} missing`)
        }
        assert.ok(res.body.includes(`<loc>${SITE_URL}/blog</loc>`))
        assert.ok(res.body.includes(`<loc>${SITE_URL}/blog/en</loc>`))
    })
})

test('the sitemap advertises no URL that redirects', () => {
    return renderRoute('/sitemap.xml').then((res) => {
        // A sitemap full of redirects is the other half of the GSC complaint.
        assert.ok(!res.body.includes(`<loc>${SITE_URL}/en/blog`))
        assert.ok(!res.body.includes(`<loc>${SITE_URL}/blog/vie</loc>`))
        // /welcome and /goodbye resolve, but the extension opens them; they are
        // not search destinations.
        assert.ok(!res.body.includes('/welcome'))
        assert.ok(!res.body.includes('/goodbye'))
    })
})

test('/blog/vie answers 301 to the one canonical index', () => {
    return renderRoute('/blog/vie').then((res) => {
        assert.equal(res.statusCode, 301)
        assert.equal(res.headers.location, '/blog')
    })
})
