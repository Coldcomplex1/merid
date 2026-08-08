// The hand-off format between a draft and the editor.
//
// This is the shape the reusable Claude prompt in BLOG_WORKFLOW.md asks for, and
// the shape scripts/migrate-posts.mjs emits. One parser serves both, so the
// import path the migration uses is the same one used every week rather than a
// second route that quietly rots.
//
//   TITLE: Toucan có hỗ trợ tiếng Việt không?
//   SLUG: toucan-co-ho-tro-tieng-viet-khong
//   LANG: vie
//   EXCERPT: ...
//   SEO TITLE: ...
//   SEO DESCRIPTION: ...
//   TAGS: học từ vựng, toucan
//   TRANSLATION KEY: toucan-vietnamese-support
//   COVER IMAGE IDEA: ...
//   FAQ:
//   Q: Toucan có miễn phí không?
//   A: Có bản miễn phí và gói trả phí.
//   ARTICLE:
//   ## Câu hỏi đầu tiên
//   ...
//
// ARTICLE comes last and swallows everything after it, which is what keeps a
// heading or a colon inside the body from being mistaken for a field.

const FIELDS = {
  TITLE: 'title',
  SLUG: 'slug',
  LANG: 'lang',
  EXCERPT: 'excerpt',
  'SEO TITLE': 'seoTitle',
  'SEO DESCRIPTION': 'seoDescription',
  TAGS: 'tags',
  'TRANSLATION KEY': 'translationKey',
  'COVER IMAGE': 'coverImage',
  'COVER IMAGE IDEA': 'coverIdea',
  'COVER ALT': 'coverAlt',
  AUTHOR: 'author',
  CANONICAL: 'canonicalUrl',
}

const FIELD_PATTERN = new RegExp(
  `^(${Object.keys(FIELDS)
    .map((k) => k.replace(/ /g, '\\s+'))
    .join('|')}|FAQ|ARTICLE)\\s*:\\s*(.*)$`,
  'i',
)

/**
 * Every field a paste can carry. All optional: a paste that only sets a body is
 * as valid as one that sets everything, and the editor merges whatever arrives
 * onto what is already in the form.
 *
 * @typedef {object} ParsedPostFields
 * @property {string[]} tags
 * @property {{question: string, answer: string}[]} faq
 * @property {string} [title]
 * @property {string} [slug]
 * @property {string} [lang]
 * @property {string} [excerpt]
 * @property {string} [content]
 * @property {string} [seoTitle]
 * @property {string} [seoDescription]
 * @property {string} [translationKey]
 * @property {string} [coverImage]
 * @property {string} [coverAlt]
 * @property {string} [author]
 * @property {string} [canonicalUrl]
 */

/**
 * @param {string} text A structured draft, or plain Markdown.
 * @returns {{fields: ParsedPostFields, warnings: string[]}} Parsed fields, plus
 *   anything that looked wrong but was not worth refusing the paste over.
 */
export function parseStructuredPost(text) {
  /** @type {string[]} */
  const warnings = []
  /** @type {ParsedPostFields} */
  const fields = { tags: [], faq: [] }

  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')

  // Markdown with no field headers at all is a perfectly reasonable thing to
  // paste, so treat the whole thing as the article rather than rejecting it.
  const looksStructured = lines.some((line) => /^(TITLE|ARTICLE)\s*:/i.test(line))
  if (!looksStructured) {
    return { fields: { ...fields, content: String(text ?? '').trim() }, warnings }
  }

  let i = 0
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    const match = FIELD_PATTERN.exec(line.trim())
    if (!match) continue

    const key = match[1].toUpperCase().replace(/\s+/g, ' ')
    const inline = match[2].trim()

    if (key === 'ARTICLE') {
      fields.content = lines.slice(i + 1).join('\n').trim()
      break
    }

    if (key === 'FAQ') {
      // Q:/A: pairs until the next recognised field header.
      let question = null
      for (let j = i + 1; j < lines.length; j += 1) {
        const entry = lines[j].trim()
        if (FIELD_PATTERN.test(entry)) {
          i = j - 1
          break
        }
        const q = /^Q\s*:\s*(.*)$/i.exec(entry)
        const a = /^A\s*:\s*(.*)$/i.exec(entry)
        if (q) question = q[1].trim()
        else if (a && question) {
          fields.faq.push({ question, answer: a[1].trim() })
          question = null
        }
      }
      continue
    }

    const target = FIELDS[key]
    if (!target) continue

    if (target === 'tags') {
      fields.tags = inline
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12)
    } else if (target === 'coverIdea') {
      // Deliberately not a field on the post. It is a note to the author about
      // what picture to make, not something to publish, so it becomes a warning
      // rather than silently landing in coverImage as prose.
      if (inline) warnings.push(`Cover image idea (not imported): ${inline}`)
    } else {
      fields[target] = inline
    }
  }

  if (fields.lang) {
    const normalised = fields.lang.trim().toLowerCase()
    // 'vi' is the old code and the natural thing to type; accept it.
    fields.lang = normalised === 'vi' || normalised === 'vie' ? 'vie' : 'en'
  }

  if (!fields.content) warnings.push('No ARTICLE: section found, so the body is empty.')
  if (!fields.title) warnings.push('No TITLE: found.')

  return { fields, warnings }
}

/** The inverse, used by the migration script so it emits what the editor reads. */
export function formatStructuredPost(post) {
  const lines = [
    `TITLE: ${post.title}`,
    `SLUG: ${post.slug}`,
    `LANG: ${post.lang}`,
    `EXCERPT: ${post.excerpt}`,
    `SEO TITLE: ${post.seoTitle || post.title}`,
    `SEO DESCRIPTION: ${post.seoDescription || ''}`,
    `TAGS: ${(post.tags || []).join(', ')}`,
  ]

  if (post.translationKey) lines.push(`TRANSLATION KEY: ${post.translationKey}`)
  if (post.coverImage) lines.push(`COVER IMAGE: ${post.coverImage}`)
  if (post.coverAlt) lines.push(`COVER ALT: ${post.coverAlt}`)

  if (post.faq?.length) {
    lines.push('FAQ:')
    for (const entry of post.faq) {
      lines.push(`Q: ${entry.question}`)
      lines.push(`A: ${entry.answer}`)
    }
  }

  lines.push('ARTICLE:')
  lines.push(post.content)

  return lines.join('\n')
}
