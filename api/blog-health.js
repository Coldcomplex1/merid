// GET /api/blog-health - why is the blog broken?
//
// This exists because a serverless function that dies at module load reports
// FUNCTION_INVOCATION_FAILED and nothing else, and the logs that would explain
// it are not visible to everyone who might be debugging the site.
//
// So it imports NOTHING at the top level. Every check is a dynamic import in its
// own try, and the endpoint reports which ones worked. If it can answer at all,
// it can tell you what is wrong; if it cannot answer either, the problem is the
// deployment rather than this code.
//
// Nothing here is sensitive: module names, a Node version, an HTTP status, and a
// count of already-public posts. Safe to leave up, fine to delete once the blog
// has been stable for a while.

const CHECKS = [
  { name: 'marked', spec: 'marked', probe: (m) => typeof m.marked?.parse === 'function' },
  { name: 'sanitize-html', spec: 'sanitize-html', probe: (m) => typeof m.default === 'function' },
  { name: 'blog-config', spec: './_lib/blog-config.js', probe: (m) => Array.isArray(m.LANGS) },
  { name: 'slug', spec: './_lib/slug.js', probe: (m) => typeof m.slugify === 'function' },
  { name: 'markdown', spec: './_lib/markdown.js', probe: (m) => typeof m.toHtml === 'function' },
  { name: 'sanitize', spec: './_lib/sanitize.js', probe: (m) => typeof m.sanitizeArticleHtml === 'function' },
  { name: 'posts-rest', spec: './_lib/posts-rest.js', probe: (m) => typeof m.fetchPost === 'function' },
  { name: 'blog-html', spec: './_lib/blog-html.js', probe: (m) => typeof m.renderPostPage === 'function' },
]

async function checkModules() {
  const results = []
  for (const check of CHECKS) {
    try {
      const mod = await import(check.spec)
      results.push({
        module: check.name,
        loaded: true,
        usable: Boolean(check.probe(mod)),
      })
    } catch (error) {
      results.push({
        module: check.name,
        loaded: false,
        error: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`,
      })
    }
  }
  return results
}

/** Can the function reach Firestore, and do the rules let it read? */
async function checkFirestore() {
  try {
    const { FIREBASE_PROJECT_ID } = await import('./_lib/blog-config.js')
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`

    const started = Date.now()
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'posts' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: 'published' },
            },
          },
          limit: 100,
        },
      }),
    })

    const ms = Date.now() - started
    if (!response.ok) {
      return {
        reachable: true,
        status: response.status,
        ms,
        // 403 has one overwhelmingly likely cause and it is worth naming.
        hint:
          response.status === 403
            ? 'Rules deny the read. Run: firebase deploy --only firestore:rules'
            : 'Unexpected status from Firestore.',
      }
    }

    const rows = await response.json()
    const posts = rows.filter((r) => r.document)
    return {
      reachable: true,
      status: 200,
      ms,
      publishedPosts: posts.length,
      urls: posts
        .map((r) => r.document.fields)
        .map((f) => `/blog/${f?.lang?.stringValue ?? '?'}/${f?.slug?.stringValue ?? '?'}`),
    }
  } catch (error) {
    return {
      reachable: false,
      error: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`,
    }
  }
}

/** Does the stylesheet the renderer links actually exist on the CDN? */
async function checkStylesheet() {
  try {
    const { SITE_URL } = await import('./_lib/blog-config.js')
    const response = await fetch(`${SITE_URL}/blog.css`, { method: 'HEAD' })
    return {
      status: response.status,
      ok: response.ok,
      hint: response.ok
        ? undefined
        : 'dist/blog.css is missing. scripts/copy-blog-css.mjs should run after vite build.',
    }
  } catch (error) {
    return { ok: false, error: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}` }
  }
}

/** Renders a real page end to end, which is the check that matters most. */
async function checkRender() {
  try {
    const { renderNotFound } = await import('./_lib/blog-html.js')
    const html = renderNotFound('vie')
    return { ok: html.includes('<!doctype html>'), bytes: html.length }
  } catch (error) {
    return { ok: false, error: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}` }
  }
}

export default async function handler(req, res) {
  try {
    const [modules, firestore, stylesheet, render] = await Promise.all([
      checkModules(),
      checkFirestore(),
      checkStylesheet(),
      checkRender(),
    ])

    const broken = modules.filter((m) => !m.loaded || !m.usable).map((m) => m.module)
    const healthy =
      broken.length === 0 && firestore.status === 200 && render.ok === true

    const body = {
      ok: healthy,
      summary: healthy
        ? 'Everything the blog needs is working.'
        : broken.length
          ? `These modules failed to load or are unusable: ${broken.join(', ')}`
          : firestore.status !== 200
            ? 'Modules are fine; Firestore is the problem.'
            : 'Modules and Firestore are fine; rendering is the problem.',
      runtime: {
        node: process.version,
        region: process.env.VERCEL_REGION ?? null,
        deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
      modules,
      firestore,
      stylesheet,
      render,
    }

    res.statusCode = healthy ? 200 : 503
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body, null, 2))
  } catch (error) {
    // Even this must not throw, or it becomes another opaque crash.
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(`blog-health itself failed: ${error?.name}: ${error?.message}`)
  }
}
