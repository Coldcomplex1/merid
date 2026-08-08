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
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LANGS, SITE_URL, absolute, indexPath, postPath } from './_lib/blog-config.js'
import { fetchCounterpart, fetchPost, fetchPublishedPosts } from './_lib/posts-rest.js'
import { renderIndexPage, renderNotFound, renderPostPage } from './_lib/blog-html.js'

// Listings change whenever something is published; a post changes only when
// edited. Both are short enough that nothing feels stale and long enough that a
// crawl sweeping every URL mostly hits cache.
const CACHE_POST = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'
const CACHE_LIST = 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400'

/**
 * The SPA's hashed stylesheet, so blog pages share one cached CSS file with the
 * rest of the site and inherit the self-hosted Vietnamese font faces for free.
 *
 * Read once per cold start from the build manifest. If the manifest is missing
 * the page still renders, just unstyled, which is a far better failure than a
 * 500 on every blog URL.
 */
let cachedCss = null

function cssHrefs() {
  if (cachedCss) return cachedCss

  for (const base of [process.cwd(), join(process.cwd(), 'dist')]) {
    const manifestPath = join(base, '.vite', 'manifest.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const entry = Object.values(manifest).find((chunk) => chunk.isEntry)
      if (entry?.css?.length) {
        cachedCss = entry.css.map((file) => `/${file}`)
        return cachedCss
      }
    } catch {
      // Fall through to the empty default below.
    }
  }

  cachedCss = []
  return cachedCss
}

function send(res, status, body, contentType, cacheControl) {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', cacheControl)
  res.end(body)
}

function sendHtml(res, status, html, cacheControl) {
  send(res, status, html, 'text/html; charset=utf-8', cacheControl)
}

function notFound(res, lang) {
  // A real 404, so a draft URL is indistinguishable from one that never
  // existed and search engines drop it rather than indexing a placeholder.
  sendHtml(res, 404, renderNotFound(lang, cssHrefs()), 'public, max-age=0, s-maxage=60')
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function renderSitemap(res) {
  const posts = await fetchPublishedPosts()

  const urls = [
    `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...LANGS.map(
      (lang) =>
        `  <url>\n    <loc>${xmlEscape(absolute(indexPath(lang)))}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    ),
  ]

  for (const post of posts) {
    // hreflang alternates go in the sitemap as well as the page, so the pairing
    // survives even if one page's head is cached stale.
    const siblings = posts.filter(
      (p) => p.translationKey && p.translationKey === post.translationKey,
    )
    const alts = siblings.map(
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
  send(res, 200, xml, 'application/xml; charset=utf-8', CACHE_LIST)
}

async function renderLlmsTxt(res) {
  const posts = await fetchPublishedPosts()
  const byLang = (lang) =>
    posts
      .filter((p) => p.lang === lang)
      .map((p) => `- [${p.title}](${absolute(postPath(p.lang, p.slug))}): ${p.excerpt || ''}`)

  const vie = byLang('vie')
  const en = byLang('en')

  const body = `# Merid

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
`
  send(res, 200, body, 'text/plain; charset=utf-8', CACHE_LIST)
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  const url = new URL(req.url, SITE_URL)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  try {
    if (path === '/sitemap.xml') return await renderSitemap(res)
    if (path === '/llms.txt') return await renderLlmsTxt(res)

    const segments = path.split('/').filter(Boolean)

    // /blog -> Vietnamese index, the blog homepage.
    if (segments.length === 1 && segments[0] === 'blog') {
      const posts = await fetchPublishedPosts('vie')
      return sendHtml(res, 200, renderIndexPage('vie', posts, cssHrefs()), CACHE_LIST)
    }

    if (segments[0] !== 'blog') return notFound(res, 'vie')

    const lang = segments[1]

    // /blog/vie -> /blog. One canonical home for the Vietnamese index rather
    // than two URLs serving identical content.
    if (segments.length === 2 && lang === 'vie') {
      res.statusCode = 301
      res.setHeader('Location', '/blog')
      res.setHeader('Cache-Control', CACHE_LIST)
      res.end()
      return
    }

    if (!LANGS.includes(lang)) return notFound(res, 'vie')

    // /blog/en -> English index.
    if (segments.length === 2) {
      const posts = await fetchPublishedPosts(lang)
      return sendHtml(res, 200, renderIndexPage(lang, posts, cssHrefs()), CACHE_LIST)
    }

    // /blog/{lang}/{slug} -> a post.
    if (segments.length === 3) {
      const post = await fetchPost(lang, segments[2])
      // Null covers both "no such post" and "exists but is a draft"; to a
      // reader they are the same thing, and conflating them is what keeps a
      // draft URL from confirming that a draft exists.
      if (!post) return notFound(res, lang)

      const counterpart = await fetchCounterpart(post)
      return sendHtml(res, 200, renderPostPage(post, counterpart, cssHrefs()), CACHE_POST)
    }

    return notFound(res, lang)
  } catch (error) {
    // A Firestore outage should not be cached as a 404 for a day.
    res.statusCode = 500
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(`Blog temporarily unavailable: ${error.message}`)
  }
}
