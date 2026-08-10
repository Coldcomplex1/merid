// Writes one HTML file per public SPA route, each carrying its own canonical.
//
// vercel.json rewrites every non-API path to a single index.html, so until now
// /tutorial and friends all served the homepage's <link rel="canonical"> and
// og:url. Every marketing page therefore told Google it was a duplicate of
// https://merid.site/, and none of them could be indexed on their own.
//
// React can rewrite the head after it mounts (see usePageMeta in
// src/i18n/LanguageContext.tsx), but a crawler that reads a canonical in the raw
// HTML and a different one in the rendered DOM is entitled to believe the first.
// The only way to remove the contradiction is to ship the right canonical in the
// bytes Vercel serves, which is what this script does.
//
// The body is untouched: these are still the SPA shell, and React renders the
// actual page. Only the head differs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { absolute, MARKETING_PATHS } from '../api/_lib/blog-config.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

/** The SPA routes that get a canonical of their own.
 *
 *  The indexable ones come from MARKETING_PATHS, shared with the sitemap so the
 *  two lists cannot drift. /welcome and /goodbye are added here only: the
 *  extension opens them on install and uninstall, so they are reachable and
 *  should not claim to be the homepage, but they are not search destinations.
 *
 *  '/' is deliberately absent — dist/index.html already carries the homepage
 *  canonical, and it stays the catch-all target for every other path. Routes
 *  behind auth are absent too; public/robots.txt disallows them, so their
 *  canonical never matters. */
export const SEO_ROUTES = [...MARKETING_PATHS, '/welcome', '/goodbye']

/** Replaces one attribute inside one tag, leaving the rest of the tag alone.
 *  Returns null when the tag isn't there, so callers can fail loudly rather
 *  than ship an unchanged canonical. */
function setTagAttribute(html, tagPattern, attribute, value) {
  const tag = html.match(tagPattern)
  if (!tag) return null

  const attributePattern = new RegExp(`(\\b${attribute}=")[^"]*(")`)
  if (!attributePattern.test(tag[0])) return null

  // Function replacements throughout, so a '$' in a URL is a literal '$' and
  // not a back-reference.
  const rewritten = tag[0].replace(attributePattern, (_, open, close) => `${open}${value}${close}`)
  return html.replace(tag[0], () => rewritten)
}

/** index.html with its canonical and og:url pointed at `path`.
 *
 *  Exported for test/seo.test.mjs, which checks the transform without needing a
 *  real build in dist/. Throws rather than returning half-rewritten HTML: a
 *  silently unchanged canonical is exactly the bug this script exists to fix. */
export function withCanonical(html, path) {
  const url = absolute(path)

  const withLink = setTagAttribute(html, /<link\b[^>]*\brel="canonical"[^>]*>/i, 'href', url)
  if (!withLink) throw new Error('no <link rel="canonical" href="..."> to rewrite')

  const withOg = setTagAttribute(
    withLink,
    /<meta\b[^>]*\bproperty="og:url"[^>]*>/i,
    'content',
    url,
  )
  if (!withOg) throw new Error('no <meta property="og:url" content="..."> to rewrite')

  return withOg
}

function fail(message) {
  console.error(`\x1b[31mprerender-seo: ${message}\x1b[0m`)
  process.exit(1)
}

// Only run the build step when executed directly; importing this file for its
// exports (the tests) must not touch the filesystem.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = join(DIST, 'index.html')
  if (!existsSync(source)) fail(`no ${source}. Run "vite build" first.`)

  const html = readFileSync(source, 'utf8')

  for (const route of SEO_ROUTES) {
    // A nested route would need its directory created first, and cleanUrls in
    // vercel.json would serve it from a different path than expected. Nothing
    // needs one today; say so rather than writing a file nobody can reach.
    if (!/^\/[^/]+$/.test(route)) fail(`${route} is nested, which this script does not handle`)

    let page
    try {
      page = withCanonical(html, route)
    } catch (error) {
      fail(`${route}: ${error.message}. Has index.html's head changed?`)
    }
    writeFileSync(join(DIST, `${route.slice(1)}.html`), page)
  }

  console.log(
    `\x1b[32mprerender-seo\x1b[0m ${SEO_ROUTES.length} routes with their own canonical ` +
      `\x1b[2m(${SEO_ROUTES.join(', ')})\x1b[0m`,
  )
}
