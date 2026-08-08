// One-time import of the original MDX posts into Firestore.
//
//   node scripts/migrate-posts.mjs --dry-run    print what would be written
//   node scripts/migrate-posts.mjs --emit       write posts.json for manual import
//   node scripts/migrate-posts.mjs              write to Firestore (needs auth)
//
// This is scaffolding, not part of the system. Once the six posts are in and
// look right, delete it: keeping a second way to create posts around invites
// someone to use it instead of the admin, and then the admin is no longer the
// only path a post can take.
//
// The MDX files it reads are gone from the repo (the whole build-time pipeline
// was removed), so they are passed in from a directory argument.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatStructuredPost } from '../api/_lib/structured-post.js'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const SOURCE_DIR = args.find((a) => !a.startsWith('--')) ?? 'mdx-backup'
const OUT_DIR = 'migrated-posts'

/** Minimal YAML frontmatter reader. Handles exactly what these six files use:
 *  scalars, quoted scalars, and a list of {question, answer} maps. */
function parseFrontmatter(raw) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw)
  if (!match) throw new Error('no frontmatter block')

  const [, head, body] = match
  const data = {}
  const lines = head.split('\n')

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim() || line.startsWith('#')) continue

    const kv = /^([a-zA-Z][a-zA-Z0-9_]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    const [, key, rest] = kv

    if (rest.trim() === '') {
      // A nested block: either a list of maps (faq) or a list of scalars (related).
      const items = []
      let current = null
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        i += 1
        const child = lines[i]
        const listItem = /^\s*-\s*(.*)$/.exec(child)
        if (listItem) {
          const inline = /^([a-zA-Z]+):\s*(.*)$/.exec(listItem[1])
          if (inline) {
            current = { [inline[1]]: unquote(inline[2]) }
            items.push(current)
          } else {
            items.push(unquote(listItem[1]))
            current = null
          }
        } else if (current) {
          const prop = /^\s*([a-zA-Z]+):\s*(.*)$/.exec(child)
          if (prop) current[prop[1]] = unquote(prop[2])
        }
      }
      data[key] = items
    } else {
      data[key] = unquote(rest)
    }
  }

  return { data, body }
}

function unquote(value) {
  const trimmed = String(value).trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * MDX to Markdown.
 *
 * Three constructs need translating, because the posts were written against a
 * deliberately small component set:
 *   - the `import { Todo }` line, which has no meaning outside MDX
 *   - <Todo kind="stat">…</Todo>, which becomes a blockquote so the marker stays
 *     visible in the admin and on the page rather than vanishing silently
 *   - <span className="swap">word</span>, which becomes ==word==. Raw HTML in a
 *     post is escaped now (see api/_lib/markdown.js), so the span would render
 *     as visible angle brackets; ==…== is the supported syntax for it.
 */
function mdxToMarkdown(body) {
  return body
    .replace(/^import\s+.*$/gm, '')
    .replace(/<Todo\s+kind="(\w+)">([\s\S]*?)<\/Todo>/g, (_, kind, inner) => {
      const label = kind === 'stat' ? 'TODO_STAT' : kind === 'image' ? 'TODO_IMAGE' : 'TODO_SCREENSHOT'
      const text = inner.trim().replace(/\s+/g, ' ')
      return `> **${label}** — ${text}`
    })
    // The gold-highlighted English word, as a Markdown extension rather than
    // raw HTML. Runs before the className rewrite so it catches both spellings.
    .replace(/<span\s+class(?:Name)?="swap">([\s\S]*?)<\/span>/g, (_, inner) => `==${inner.trim()}==`)
    .replace(/className=/g, 'class=')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The Toucan pair is the only one that was ever meant to be live today. */
const PUBLISH = new Set(['toucan-vietnamese-support'])

function convert(filename, raw) {
  const { data, body } = parseFrontmatter(raw)

  // 'vi' in the old scheme, 'vie' in the URL scheme the new blog uses.
  const lang = data.lang === 'vi' ? 'vie' : data.lang
  const status = PUBLISH.has(data.translationKey) ? 'published' : 'draft'
  const now = new Date().toISOString()

  const post = {
    id: `${lang}__${data.slug}`,
    slug: data.slug,
    lang,
    title: data.title,
    // The old `answer` block was a 40-60 word extraction target rendered above
    // the body. The new renderer uses `excerpt` in exactly that position, so the
    // answer becomes the excerpt rather than being dropped.
    excerpt: data.answer || data.description || '',
    content: mdxToMarkdown(body),
    author: 'Van Quyet Doan',
    tags: data.targetKeyword ? [data.targetKeyword] : [],
    coverImage: data.cover || '',
    coverAlt: data.coverAlt || '',
    seoTitle: data.title,
    seoDescription: data.description || '',
    status,
    translationKey: data.translationKey || '',
    faq: Array.isArray(data.faq) ? data.faq : [],
    createdAt: now,
    updatedAt: now,
  }

  // Published posts must carry a date; the rules enforce it.
  if (status === 'published') {
    post.publishedAt = new Date(`${data.publishAt}T00:00:00Z`).toISOString()
  }

  return { filename, post }
}

function main() {
  let files
  try {
    files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.mdx'))
  } catch {
    console.error(`Cannot read ${SOURCE_DIR}. Pass the directory holding the .mdx files.`)
    process.exit(1)
  }

  if (!files.length) {
    console.error(`No .mdx files in ${SOURCE_DIR}.`)
    process.exit(1)
  }

  const converted = files
    .sort()
    .map((f) => convert(f, readFileSync(join(SOURCE_DIR, f), 'utf8')))

  for (const { filename, post } of converted) {
    console.log(
      `${post.status === 'published' ? 'PUBLISH' : 'draft  '}  ${post.lang.padEnd(3)}  ` +
        `/blog/${post.lang}/${post.slug}\n` +
        `          ${post.title}\n` +
        `          excerpt ${post.excerpt.length} chars, body ${post.content.length} chars, ` +
        `${post.faq.length} faq, from ${filename}`,
    )
  }

  if (DRY_RUN) return

  // Emitted in the same structured format the editor's paste box reads and the
  // Claude prompt produces. Migrating therefore uses the ordinary weekly path
  // rather than a bulk importer that would exist only for this one afternoon,
  // and every post gets looked at on the way in.
  mkdirSync(OUT_DIR, { recursive: true })
  for (const { post } of converted) {
    const name = `${post.lang}__${post.slug}.txt`
    writeFileSync(join(OUT_DIR, name), formatStructuredPost(post))
  }

  console.log(`\nWrote ${converted.length} files to ${OUT_DIR}/`)
  console.log(
    '\nFor each one: open /admin/blog, click New post, paste the file into\n' +
      '"Paste a draft", press "Fill the form", check it, then Save draft or Publish.\n' +
      '\nThis script deliberately does not write to Firestore. Doing so would need a\n' +
      'service-account key, and the point of the admins/{uid} design is that no such\n' +
      'key exists anywhere. Delete this script once the six posts are in.',
  )

  const publish = converted.filter((c) => c.post.status === 'published')
  if (publish.length) {
    console.log(
      `\nPublish these two (they were live under the old system):\n` +
        publish.map((c) => `  ${c.post.lang}__${c.post.slug}.txt`).join('\n'),
    )
  }
}

main()
