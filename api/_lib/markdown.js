// Markdown to HTML, shared by the public renderer and the admin preview.
//
// Both sides import this file so the preview cannot drift from the published
// page. It is plain ESM with one dependency (marked) and no Node built-ins, so
// it bundles into the browser without pulling a server-only package along.
//
// Sanitisation deliberately lives in a separate module (./sanitize.js) rather
// than here: sanitize-html is Node-oriented and would add a large dependency
// tree to the client bundle for no benefit, since an author previewing their
// own draft is not a security boundary. The public path always composes the two.
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
    const caption = token.text ? `<figcaption>${attr(token.text)}</figcaption>` : ''
    return `<figure><img src="${attr(token.href)}" alt="${attr(token.text)}" loading="lazy" decoding="async" />${caption}</figure>`
  },

  link(token) {
    const text = this.parser.parseInline(token.tokens)
    const rel = isExternal(token.href) ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${attr(token.href)}"${rel}>${text}</a>`
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

marked.use({ gfm: true, breaks: false, renderer })

/**
 * Markdown to HTML. NOT sanitised - see the module header. The public renderer
 * must pass the result through ./sanitize.js before it reaches a reader.
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
