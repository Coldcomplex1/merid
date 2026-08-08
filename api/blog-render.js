// The entire public blog, served from one function.
//
//   /blog                  Vietnamese index (the blog homepage)
//   /blog/vie              301 -> /blog, so the symmetric URL resolves without
//                          creating a duplicate of the index
//   /blog/en               English index
//   /blog/{lang}/{slug}    a post
//   /sitemap.xml           published posts only
//   /llms.txt              plain-language summary for models that fetch it
//
// Why a function rather than static files: posts live in Firestore so they can
// be written from a browser, and a database-backed page has to be rendered
// somewhere. Rendering it here rather than in the reader's browser is what keeps
// it visible to crawlers that do not run JavaScript, which is the whole point.
//
// It reads Firestore unauthenticated. Security rules permit published posts to
// anyone and deny every draft, so this function holds no credentials at all.
//
// ---------------------------------------------------------------------------
// A note on the shape of this file, which is deliberate.
//
// Everything below the imports is inside a try, and the only things imported at
// the top level are Node built-ins and blog-config.js, which is nothing but
// constants. Modules with real dependencies (marked, sanitize-html) are pulled
// in with await import() inside the handler.
//
// That is not stylistic. A failure while loading a module cannot be caught by a
// try inside the handler, because the module never finishes loading and the
// handler never comes into existence. Vercel reports that as
// FUNCTION_INVOCATION_FAILED with no further detail, which is exactly the
// failure this file shipped with and exactly the thing that is impossible to
// diagnose from the outside. Deferring those imports turns an opaque crash into
// an ordinary error with a message. ESM caches modules, so it costs one
// resolution per cold start.
// ---------------------------------------------------------------------------
import { LANGS, SITE_URL } from './_lib/blog-config.js'

// Listings change whenever something is published; a post changes only when
// edited. Both are short enough that nothing feels stale and long enough that a
// crawl sweeping every URL mostly hits cache.
const CACHE_POST = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'
const CACHE_LIST = 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400'

function send(res, status, body, contentType, cacheControl) {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', cacheControl)
  res.end(body)
}

function sendHtml(res, status, html, cacheControl) {
  send(res, status, html, 'text/html; charset=utf-8', cacheControl)
}

/**
 * Where the request actually points.
 *
 * Query parameters come first because that is what vercel.json puts there, and
 * whether a Vercel rewrite preserves the original path in req.url is not
 * something worth betting the whole blog on. Parsing req.url is kept as a
 * fallback so the function also works when invoked directly, in tests, and under
 * `vercel dev`.
 *
 * @returns {{route: string, lang?: string, slug?: string}}
 */
export function resolveRoute(req) {
  const raw = typeof req?.url === 'string' && req.url ? req.url : '/'
  const url = new URL(raw, SITE_URL)
  const q = url.searchParams

  const declared = q.get('route')
  if (declared) {
    return { route: declared, lang: q.get('lang') ?? undefined, slug: q.get('slug') ?? undefined }
  }

  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path === '/sitemap.xml') return { route: 'sitemap' }
  if (path === '/llms.txt') return { route: 'llms' }

  const segments = path.split('/').filter(Boolean)
  if (segments[0] !== 'blog') return { route: 'notfound' }
  if (segments.length === 1) return { route: 'index', lang: 'vie' }
  // /blog/vie is the symmetric spelling of the Vietnamese index. It redirects
  // rather than rendering, so the index has exactly one canonical URL.
  if (segments.length === 2 && segments[1] === 'vie') return { route: 'redirect' }
  if (segments.length === 2) return { route: 'index', lang: segments[1] }
  if (segments.length === 3) return { route: 'post', lang: segments[1], slug: segments[2] }
  return { route: 'notfound' }
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * A last-resort page with no dependencies at all.
 *
 * Used when even the dynamic import fails, so the route always answers with
 * something a person can read instead of a blank 500 from the platform.
 */
function fallbackPage(title, detail) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.5rem;line-height:1.6">
<h1 style="font-size:1.5rem">${title}</h1>
<p>${detail}</p>
<p><a href="/">Back to Merid</a></p>
</body></html>
`
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8', 'no-store')
    }

    const { route, lang, slug } = resolveRoute(req)

    // Everything with a real dependency behind it loads here, where a failure
    // is catchable. See the note at the top of this file.
    const [{ fetchPost, fetchPublishedPosts, fetchCounterpart }, html] = await Promise.all([
      import('./_lib/posts-rest.js'),
      import('./_lib/blog-html.js'),
    ])
    const { renderIndexPage, renderNotFound, renderPostPage } = html
    const { absolute, indexPath, postPath } = await import('./_lib/blog-config.js')

    const notFound = (l) =>
      sendHtml(res, 404, renderNotFound(LANGS.includes(l) ? l : 'vie'), 'public, max-age=0, s-maxage=60')

    if (route === 'sitemap') {
      const posts = await fetchPublishedPosts()
      const urls = [
        `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
        ...LANGS.map(
          (l) =>
            `  <url>\n    <loc>${xmlEscape(absolute(indexPath(l)))}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`,
        ),
      ]

      for (const post of posts) {
        // hreflang alternates go in the sitemap as well as the page, so the
        // pairing survives even if one page's head is cached stale.
        const alts = posts
          .filter((p) => p.translationKey && p.translationKey === post.translationKey)
          .map(
            (p) =>
              `    <xhtml:link rel="alternate" hreflang="${p.lang === 'vie' ? 'vi' : 'en'}" href="${xmlEscape(absolute(postPath(p.lang, p.slug)))}" />`,
          )

        urls.push(
          `  <url>\n    <loc>${xmlEscape(absolute(postPath(post.lang, post.slug)))}</loc>\n` +
            `    <lastmod>${xmlEscape(String(post.updatedAt || post.publishedAt).slice(0, 10))}</lastmod>\n` +
            `    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n` +
            (alts.length ? `${alts.join('\n')}\n` : '') +
            `  </url>`,
        )
      }

      return send(
        res,
        200,
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`,
        'application/xml; charset=utf-8',
        CACHE_LIST,
      )
    }

    if (route === 'llms') {
      const posts = await fetchPublishedPosts()
      const byLang = (l) =>
        posts
          .filter((p) => p.lang === l)
          .map((p) => `- [${p.title}](${absolute(postPath(p.lang, p.slug))}): ${p.excerpt || ''}`)

      const vie = byLang('vie')
      const en = byLang('en')

      return send(
        res,
        200,
        `# Merid

> Merid is a free Chrome extension for Vietnamese speakers learning English. It
> replaces a small number of Vietnamese words on the pages you already read with
> English vocabulary at SAT, B2, C1 and C2 level, so ordinary browsing doubles as
> vocabulary practice. Word substitution runs locally in the browser. An optional
> AI context check verifies that a substituted word genuinely fits its sentence.

Built by Van Quyet Doan, a student in Ho Chi Minh City, as a solo project.

## Product

- [Merid homepage](${SITE_URL}/): what the extension does, with a live demo.
- [Tutorial](${SITE_URL}/tutorial): setup and settings walkthrough.
- [Build your own dataset](${SITE_URL}/create-dataset): custom vocabulary lists.
- [Privacy policy](${SITE_URL}/privacy-policy): what data does and does not leave the device.

## Blog, Vietnamese

${vie.length ? vie.join('\n') : '- (no posts published yet)'}

## Blog, English

${en.length ? en.join('\n') : '- (no posts published yet)'}

## Sitemap

- [Sitemap](${SITE_URL}/sitemap.xml)
`,
        'text/plain; charset=utf-8',
        CACHE_LIST,
      )
    }

    // /blog/vie -> /blog. One canonical home for the Vietnamese index rather
    // than two URLs serving identical content.
    if (route === 'redirect') {
      res.statusCode = 301
      res.setHeader('Location', '/blog')
      res.setHeader('Cache-Control', CACHE_LIST)
      return res.end()
    }

    if (route === 'index') {
      if (!LANGS.includes(lang)) return notFound('vie')
      return sendHtml(res, 200, renderIndexPage(lang, await fetchPublishedPosts(lang)), CACHE_LIST)
    }

    if (route === 'post') {
      if (!LANGS.includes(lang) || !slug) return notFound(lang)

      const post = await fetchPost(lang, slug)
      // Null covers both "no such post" and "exists but is a draft"; to a reader
      // they are the same thing, and conflating them is what keeps a draft URL
      // from confirming that a draft exists.
      if (!post) return notFound(lang)

      return sendHtml(res, 200, renderPostPage(post, await fetchCounterpart(post)), CACHE_POST)
    }

    return notFound(lang)
  } catch (error) {
    // Nothing may escape this function. An uncaught throw here is reported by
    // the platform as FUNCTION_INVOCATION_FAILED, which tells whoever is
    // debugging it precisely nothing.
    //
    // headersSent matters: setting a header after a partial response throws
    // ERR_HTTP_HEADERS_SENT from inside the catch itself, which is once again
    // uncatchable and produces the same opaque crash.
    const name = error?.name ?? 'Error'
    const message = error?.message ?? String(error)
    const frame = String(error?.stack ?? '').split('\n')[1]?.trim() ?? ''

    console.error('blog-render failed:', error)

    if (res.headersSent) {
      try {
        res.end()
      } catch {
        // The response is already gone; there is nothing further to do.
      }
      return
    }

    res.statusCode = 500
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    // The detail goes in the body on purpose. This is a personal site, the path
    // carries no user data, and logs neither the author nor an assistant helping
    // them can read are worth considerably less than a legible error.
    res.end(
      fallbackPage(
        'The blog is temporarily unavailable',
        `<strong>${name}:</strong> ${message}<br /><small>${frame}</small><br /><br />` +
          `Diagnostics: <a href="/api/blog-health">/api/blog-health</a>`,
      ),
    )
  }
}
