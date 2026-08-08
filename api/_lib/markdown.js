// Markdown to HTML, shared by the public renderer and the admin preview.
//
// Both sides import this file so the preview cannot drift from the published
// page. Its only dependency is marked, which is ESM and imported from ESM: no
// CommonJS module anywhere in this path has to require() an ESM one. That used
// to be untrue, and it took the whole blog down in production while every local
// test passed, because the bridge only works on Node 22.12 and later and
// Vercel's Node 22 is older. One dependency, one module system, no bridge.
//
// SAFETY MODEL, which is the reason this file looks the way it does.
//
// There is no sanitiser. Instead, raw HTML in a post is *escaped* rather than
// emitted, so every tag that reaches a reader was produced by a renderer
// function below, from a fixed set, with every attribute run through attr().
// Nothing an author types can become a tag or an attribute.
//
// That is a stronger guarantee than filtering after the fact, and it is why
// dropping sanitize-html did not weaken anything: unsafe HTML is now
// unrepresentable rather than removed. The one thing escaping does not cover is
// URLs, since marked happily emits href="javascript:..." - see safeUrl().
//
// Posts are Markdown, not MDX. MDX compiles to JSX, needs a build step, and
// executes what it compiles; none of that is wanted for content typed into a
// browser form and rendered at request time.
import { marked } from 'marked'
import { slugify } from './slug.js'

/** Escapes text destined for an HTML attribute. */
function attr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Escapes text destined for the document body. */
function escapeHtml(value) {
  return attr(value)
}

/**
 * A URL that is safe to put in href or src, or '' if it is not.
 *
 * Escaping tags does nothing for URLs: marked will emit
 * `href="javascript:alert(1)"` verbatim from ordinary Markdown link syntax, and
 * an escaped `javascript:` is still `javascript:`. Blocking that was the one
 * genuinely security-relevant job the old sanitiser did, so it is reimplemented
 * here rather than dropped.
 *
 * Allowlist, not blocklist. Anything whose scheme is not explicitly permitted is
 * refused, which covers javascript:, data:, vbscript: and whatever comes next
 * without needing to have heard of it.
 */
export function safeUrl(url) {
  const value = String(url ?? '').trim()
  if (!value) return ''

  // Site-relative and in-page targets carry no scheme and are always fine.
  if (/^[/#?]/.test(value)) return value

  // A bare word with no colon before the first slash is a relative path too.
  const colon = value.indexOf(':')
  if (colon === -1) return value

  // Control characters are how `java\nscript:` style bypasses are written, so a
  // scheme containing anything but letters, digits, + - . is not a scheme.
  const scheme = value.slice(0, colon).toLowerCase()
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) return ''

  return ['http', 'https', 'mailto'].includes(scheme) ? value : ''
}

/** True for links that leave the site and should open safely. */
function isExternal(href) {
  return /^https?:\/\//i.test(href) && !/(^|\/\/|\.)merid\.site/i.test(href)
}

const renderer = {
  /**
   * Headings carry ids so the table of contents and any in-article anchor
   * resolve. The id comes from the same slugify the URLs use, which means a
   * Vietnamese heading gets a readable ASCII anchor rather than a stripped one.
   */
  heading(token) {
    const text = this.parser.parseInline(token.tokens)
    const id = slugify(this.parser.parseInline(token.tokens).replace(/<[^>]+>/g, ''))
    return `<h${token.depth} id="${attr(id)}">${text}</h${token.depth}>\n`
  },

  /**
   * Images become figures, with the alt text doubling as a visible caption.
   * A screenshot in a how-to post is worth describing to everyone, not only to
   * a screen reader, and it saves the author writing the same sentence twice.
   */
  image(token) {
    const src = safeUrl(token.href)
    // A refused src would otherwise render as a broken image with the caption
    // still under it, which looks like a mistake rather than a rejection.
    if (!src) return escapeHtml(`![${token.text ?? ''}](${token.href ?? ''})`)

    const caption = token.text ? `<figcaption>${attr(token.text)}</figcaption>` : ''
    return `<figure><img src="${attr(src)}" alt="${attr(token.text)}" loading="lazy" decoding="async" />${caption}</figure>`
  },

  link(token) {
    const text = this.parser.parseInline(token.tokens)
    const href = safeUrl(token.href)
    // Drop the link, keep the words. Silently emitting a dead <a> would hide
    // the problem from whoever wrote it.
    if (!href) return text

    const rel = isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${attr(href)}"${rel}>${text}</a>`
  },

  /**
   * Raw HTML in a post is escaped, never emitted.
   *
   * This single override is what makes the output safe by construction: with it
   * in place, every tag on the page comes from a function in this file. Without
   * it, a post could contain <script> and the page would need a sanitiser to
   * take it back out again.
   *
   * Covers both block-level and inline HTML tokens.
   */
  html(token) {
    return escapeHtml(token.text ?? token.raw ?? '')
  },

  /**
   * Tables are the comparison-post workhorse and must not blow out the page on
   * a phone, so each one gets its own horizontally scrollable wrapper.
   */
  table(token) {
    const header = token.header
      .map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`)
      .join('')
    const body = token.rows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`,
      )
      .join('')
    return `<div class="table-scroll"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`
  },
}

/**
 * `==word==` marks an English word standing in for a Vietnamese one, which is
 * the thing Merid does and the one piece of custom formatting the posts need.
 *
 * It exists as a Markdown extension because raw HTML is escaped now, so the
 * `<span class="swap">` the posts used to carry would render as visible angle
 * brackets. A syntax is better than raw HTML anyway: it cannot be mistyped into
 * something that renders as markup, and it does not need the author to remember
 * a class name.
 */
const swapExtension = {
  name: 'swap',
  level: 'inline',
  start(src) {
    return src.indexOf('==')
  },
  tokenizer(src) {
    // The (?!=) guards stop ===x=== and similar from matching greedily.
    const match = /^==(?!=)([\s\S]+?)==(?!=)/.exec(src)
    if (!match) return undefined
    return {
      type: 'swap',
      raw: match[0],
      // Inline tokens, so **bold** inside a swap still works.
      tokens: this.lexer.inlineTokens(match[1].trim()),
    }
  },
  renderer(token) {
    return `<span class="swap">${this.parser.parseInline(token.tokens)}</span>`
  },
}

marked.use({ gfm: true, breaks: false, renderer, extensions: [swapExtension] })

/**
 * Markdown to HTML, safe to put straight on a page.
 *
 * No sanitising step follows this one and none is needed: raw HTML is escaped
 * by the `html` renderer above, so every tag in the output came from a function
 * in this file, and every URL went through safeUrl(). See the module header.
 *
 * @param {string} markdown
 * @returns {string} HTML
 */
export function toHtml(markdown) {
  if (!markdown) return ''
  return marked.parse(markdown, { async: false })
}

/**
 * The H2s of a document, for building a table of contents.
 *
 * Read back out of the rendered HTML rather than out of the Markdown source, so
 * the ids in the contents list are by construction the ids on the page instead
 * of two slugifiers agreeing by convention.
 *
 * @param {string} html Output of toHtml.
 * @returns {{id: string, label: string}[]}
 */
export function extractToc(html) {
  const entries = []
  const pattern = /<h2\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/gi
  let match
  while ((match = pattern.exec(html))) {
    entries.push({ id: match[1], label: stripTags(match[2]) })
  }
  return entries
}

/** Tags out, text left. Used for reading time, excerpts and TOC labels. */
export function stripTags(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Reading time in minutes, never less than one.
 *
 * Vietnamese is counted faster than English because whitespace tokens in
 * Vietnamese are mostly syllables rather than whole words, so the same token
 * count reads through quicker.
 */
export function readingMinutes(text, lang) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length
  const perMinute = lang === 'vie' ? 240 : 200
  return Math.max(1, Math.round(words / perMinute))
}
