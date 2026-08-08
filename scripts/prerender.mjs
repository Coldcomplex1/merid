/**
 * Turns the blog into static files under dist/.
 *
 * Runs after both Vite builds. It does no rendering of its own: src/blog/entry-server.tsx
 * returns a list of {path, body} and this script writes them, so the interesting
 * logic stays in TypeScript where it is type-checked, and this file stays small
 * enough to be obviously correct.
 *
 *   node scripts/prerender.mjs [--check-manifest]
 *
 * --check-manifest additionally fails when api/_generated/posts.js on disk does
 * not match what the content produces, which is what stops the committed
 * publish-queue manifest from drifting away from the posts themselves.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const SSR_ENTRY = join(ROOT, '.blog-ssr', 'entry-server.js')
const MANIFEST_FILE = join(ROOT, 'api', '_generated', 'posts.js')

const RED = '[31m'
const YELLOW = '[33m'
const GREEN = '[32m'
const DIM = '[2m'
const RESET = '[0m'

function fail(message) {
  console.error(`${RED}prerender: ${message}${RESET}`)
  process.exit(1)
}

/**
 * The SPA's stylesheet, by its hashed name. Blog pages link the same file the
 * app links, which means one cached stylesheet for the whole site and the
 * self-hosted font faces coming along without a second declaration.
 */
async function findCssHrefs() {
  const manifestPath = join(DIST, '.vite', 'manifest.json')
  if (!existsSync(manifestPath)) {
    fail(`no ${manifestPath}. Run "vite build" before this script.`)
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry)
  if (!entry) fail('no entry chunk in dist/.vite/manifest.json')

  const css = entry.css ?? []
  if (!css.length) {
    fail('the SPA entry emitted no CSS, so blog pages would render unstyled')
  }
  return css.map((file) => `/${file}`)
}

function renderManifestModule(entries) {
  return `// GENERATED FILE, DO NOT EDIT.
// Written by scripts/prerender.mjs from the frontmatter in src/content/blog.
// Regenerate with: npm run blog:manifest
//
// This is committed so the publish-queue and cron endpoints can read the
// schedule at runtime. Serverless functions cannot reliably reach src/content
// on the deployed filesystem, and generating it during the build would race
// function bundling.
export const posts = ${JSON.stringify(entries, null, 2)}

export default posts
`
}

async function main() {
  // --check-manifest  fail if the committed manifest is stale (used by npm run build)
  // --manifest-only   regenerate the manifest alone, no dist/ writes, no client build needed
  const checkManifest = process.argv.includes('--check-manifest')
  const manifestOnly = process.argv.includes('--manifest-only')

  if (!existsSync(SSR_ENTRY)) {
    fail(`no ${SSR_ENTRY}. Run "vite build --ssr src/blog/entry-server.tsx --outDir .blog-ssr" first.`)
  }

  // In manifest-only mode nothing is styled and nothing is written, so the
  // stylesheet does not need to exist yet.
  const cssHrefs = manifestOnly ? ['/assets/placeholder.css'] : await findCssHrefs()
  const { buildBlog } = await import(pathToFileURL(SSR_ENTRY).href)

  let result
  try {
    result = buildBlog({ cssHrefs })
  } catch (error) {
    // Frontmatter and collection errors are authoring mistakes, and their
    // messages already name the file and field. A stack trace on top of that
    // buries the one line that matters.
    fail(error instanceof Error ? error.message : String(error))
  }

  const manifestSource = renderManifestModule(result.manifest)

  if (checkManifest) {
    const current = existsSync(MANIFEST_FILE) ? await readFile(MANIFEST_FILE, 'utf8') : ''
    if (current !== manifestSource) {
      fail(
        'api/_generated/posts.js is out of date with src/content/blog.\n' +
          '  Run "npm run blog:manifest" and commit the result.',
      )
    }
  } else {
    await mkdir(dirname(MANIFEST_FILE), { recursive: true })
    await writeFile(MANIFEST_FILE, manifestSource, 'utf8')
  }

  if (manifestOnly) {
    console.log(`${GREEN}prerender${RESET} manifest written, ${result.manifest.length} post(s)`)
    return
  }

  for (const file of result.files) {
    const target = join(DIST, file.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.body, 'utf8')
  }

  for (const warning of result.warnings) {
    console.warn(`${YELLOW}warn${RESET} ${warning}`)
  }

  await warnOnMissingImages(result.files)

  const { live, pending, topics } = result.stats
  console.log(
    `${GREEN}prerender${RESET} ${result.files.length} files, ` +
      `${live} post(s) live, ${pending} pending, ${topics} topic(s) ` +
      `${DIM}(css: ${cssHrefs.join(', ')})${RESET}`,
  )

  await submitToIndexNow(result.publishedUrls)
}

/**
 * Images referenced by a post but absent from public/ render as a broken icon in
 * production, which is worse than a missing image and easy to miss in review.
 * This only warns: art often lands after the words do.
 */
async function warnOnMissingImages(files) {
  const missing = new Set()
  for (const file of files) {
    if (!file.path.endsWith('.html')) continue
    for (const match of file.body.matchAll(/<img[^>]+src="(\/[^"]+)"/g)) {
      const src = match[1]
      if (src.startsWith('/assets/')) continue
      if (!existsSync(join(DIST, src.replace(/^\//, '')))) missing.add(src)
    }
  }
  for (const src of missing) {
    console.warn(`${YELLOW}warn${RESET} image referenced but not in public/: ${src}`)
  }
}

/**
 * IndexNow tells Bing, Yandex and others that URLs changed.
 *
 * Google is deliberately not pinged: its sitemap ping endpoint was retired in
 * 2023 and returns 404, and the Indexing API only accepts JobPosting and
 * BroadcastEvent. For Google the working mechanism is the Sitemap line in
 * robots.txt plus a one-time Search Console submission (see docs/BLOG.md).
 *
 * No key configured means no request, and a failed request never fails a build.
 */
async function submitToIndexNow(urls) {
  const key = process.env.INDEXNOW_KEY
  if (!key) {
    console.log(`${DIM}prerender: INDEXNOW_KEY unset, skipping index submission${RESET}`)
    return
  }

  try {
    const response = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'merid.site',
        key,
        keyLocation: `https://merid.site/${key}.txt`,
        urlList: urls,
      }),
    })
    console.log(`${DIM}prerender: IndexNow submitted ${urls.length} URLs, HTTP ${response.status}${RESET}`)
  } catch (error) {
    console.warn(`${YELLOW}warn${RESET} IndexNow submission failed: ${error.message}`)
  }
}

await main()
