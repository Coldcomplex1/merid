// Copies the built stylesheet to a stable dist/blog.css.
//
// Blog pages are rendered by a serverless function, which cannot find the
// hashed filename Vite emits: dist/ is uploaded to the CDN as static output and
// is NOT part of the function's bundle, so reading dist/.vite/manifest.json at
// request time always failed and every blog page came out unstyled.
//
// A stable name removes the lookup entirely. Vercel invalidates its CDN on each
// deploy, so serving /blog.css without a content hash does not go stale.
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const ASSETS = join(DIST, 'assets')
const TARGET = join(DIST, 'blog.css')

function fail(message) {
  console.error(`\x1b[31mcopy-blog-css: ${message}\x1b[0m`)
  process.exit(1)
}

if (!existsSync(ASSETS)) fail(`no ${ASSETS}. Run "vite build" first.`)

// The app emits exactly one entry stylesheet. Picking the largest .css guards
// against a future second one (a lazy chunk's styles) quietly winning.
const stylesheets = readdirSync(ASSETS)
  .filter((file) => file.endsWith('.css'))
  .map((file) => ({ file, size: statSync(join(ASSETS, file)).size }))
  .sort((a, b) => b.size - a.size)

if (!stylesheets.length) {
  fail('the build emitted no CSS, so every blog page would render unstyled')
}

copyFileSync(join(ASSETS, stylesheets[0].file), TARGET)

console.log(
  `\x1b[32mcopy-blog-css\x1b[0m assets/${stylesheets[0].file} -> blog.css ` +
    `\x1b[2m(${(stylesheets[0].size / 1024).toFixed(1)} kB)\x1b[0m`,
)
