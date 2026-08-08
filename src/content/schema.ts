/**
 * Frontmatter contract for blog posts, enforced at build time.
 *
 * Every rule here fails the build rather than warning, because the alternative
 * is discovering a 200-character meta description or a missing `answer` block
 * after Google has already crawled it. The only soft checks are the ones where
 * being slightly out of range is a judgement call rather than a defect: word
 * count and missing image files, which collect into warnings.
 */
import type { Lang } from './publish.config'

export interface FaqEntry {
  question: string
  answer: string
}

export interface Frontmatter {
  /** <=60 chars so it survives Google's title truncation. */
  title: string
  /** 120-155 chars. Shorter gets padded by Google, longer gets cut. */
  description: string
  /** kebab-case, must match the filename. */
  slug: string
  lang: Lang
  /** Pairs the vi and en version of one topic. Drives hreflang. */
  translationKey: string
  /** ISO date. A future date excludes the post from the build entirely. */
  publishAt: string
  targetKeyword: string
  /**
   * 40-60 words, rendered as the first block in the DOM ahead of the body.
   * This is the AI Overview / featured snippet extraction target.
   */
  answer: string
  faq?: FaqEntry[]
  /** Slugs in the same language. Unpublished targets are dropped, not an error. */
  related?: string[]
  /** Set when syndicating to Medium/Dev.to so the canonical points off-site. */
  canonicalUrl?: string
  /** Path under /blog/screenshots, used for og:image. Falls back to the site card. */
  cover?: string
  coverAlt?: string
  /** Set on a later edit so Article JSON-LD can carry dateModified. */
  updatedAt?: string
}

/** Body length targets. Outside these is a warning, not a failure. */
export const WORD_TARGET: Record<Lang, { min: number; max: number }> = {
  vi: { min: 1200, max: 1800 },
  en: { min: 900, max: 1400 },
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/

export class FrontmatterError extends Error {
  constructor(file: string, field: string, problem: string) {
    super(`${file}\n  frontmatter.${field}: ${problem}`)
    this.name = 'FrontmatterError'
  }
}

/** Word count that treats Vietnamese and English alike: whitespace-separated tokens. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function requireString(raw: Record<string, unknown>, field: string, file: string): string {
  const value = raw[field]
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrontmatterError(file, field, 'required, must be a non-empty string')
  }
  return value.trim()
}

/**
 * Validates one post's frontmatter and returns it typed. `file` is only used to
 * build error messages, so a failure names the file you have to go fix.
 */
export function parseFrontmatter(
  raw: Record<string, unknown>,
  file: string,
  expectedSlug: string,
  expectedLang: string,
): Frontmatter {
  const title = requireString(raw, 'title', file)
  if (title.length > 60) {
    throw new FrontmatterError(file, 'title', `${title.length} chars, max is 60`)
  }

  const description = requireString(raw, 'description', file)
  if (description.length < 120 || description.length > 155) {
    throw new FrontmatterError(
      file,
      'description',
      `${description.length} chars, must be 120-155`,
    )
  }

  const slug = requireString(raw, 'slug', file)
  if (!KEBAB.test(slug)) {
    throw new FrontmatterError(file, 'slug', `"${slug}" is not kebab-case`)
  }
  if (slug !== expectedSlug) {
    throw new FrontmatterError(file, 'slug', `"${slug}" does not match the filename "${expectedSlug}"`)
  }

  const lang = requireString(raw, 'lang', file)
  if (lang !== 'vi' && lang !== 'en') {
    throw new FrontmatterError(file, 'lang', `"${lang}" must be "vi" or "en"`)
  }
  if (lang !== expectedLang) {
    throw new FrontmatterError(file, 'lang', `"${lang}" does not match the filename "${expectedLang}"`)
  }

  const translationKey = requireString(raw, 'translationKey', file)

  const publishAt = requireString(raw, 'publishAt', file)
  if (!ISO_DATE.test(publishAt) || Number.isNaN(Date.parse(publishAt))) {
    throw new FrontmatterError(file, 'publishAt', `"${publishAt}" is not an ISO date`)
  }

  const targetKeyword = requireString(raw, 'targetKeyword', file)

  const answer = requireString(raw, 'answer', file)
  const answerWords = countWords(answer)
  if (answerWords < 40 || answerWords > 60) {
    throw new FrontmatterError(file, 'answer', `${answerWords} words, must be 40-60`)
  }

  let faq: FaqEntry[] | undefined
  if (raw.faq != null) {
    if (!Array.isArray(raw.faq)) {
      throw new FrontmatterError(file, 'faq', 'must be an array of {question, answer}')
    }
    faq = raw.faq.map((entry, i) => {
      const e = entry as Record<string, unknown>
      if (!e || typeof e.question !== 'string' || typeof e.answer !== 'string') {
        throw new FrontmatterError(file, `faq[${i}]`, 'needs both a question and an answer string')
      }
      return { question: e.question.trim(), answer: e.answer.trim() }
    })
  }

  let related: string[] | undefined
  if (raw.related != null) {
    if (!Array.isArray(raw.related) || raw.related.some((s) => typeof s !== 'string')) {
      throw new FrontmatterError(file, 'related', 'must be an array of slug strings')
    }
    related = raw.related as string[]
  }

  const optionalString = (field: keyof Frontmatter) => {
    const v = raw[field]
    if (v == null) return undefined
    if (typeof v !== 'string') throw new FrontmatterError(file, field, 'must be a string')
    return v.trim() || undefined
  }

  return {
    title,
    description,
    slug,
    lang,
    translationKey,
    publishAt,
    targetKeyword,
    answer,
    faq,
    related,
    canonicalUrl: optionalString('canonicalUrl'),
    cover: optionalString('cover'),
    coverAlt: optionalString('coverAlt'),
    updatedAt: optionalString('updatedAt'),
  }
}

/**
 * Checks that hold across the whole set rather than within one file: unique
 * slugs per language, and a translationKey that pairs exactly one vi with one en.
 * A half-paired key is the specific failure that makes hreflang point at a 404.
 */
export function validateCollection(posts: Frontmatter[]): void {
  const seen = new Map<string, string>()
  for (const post of posts) {
    const key = `${post.lang}/${post.slug}`
    const previous = seen.get(key)
    if (previous) {
      throw new Error(`Duplicate slug "${post.slug}" for lang "${post.lang}" (also in ${previous})`)
    }
    seen.set(key, `${post.slug}.${post.lang}.mdx`)
  }

  const byKey = new Map<string, Frontmatter[]>()
  for (const post of posts) {
    const group = byKey.get(post.translationKey) ?? []
    group.push(post)
    byKey.set(post.translationKey, group)
  }

  for (const [key, group] of byKey) {
    const langs = group.map((p) => p.lang).sort()
    if (group.length !== 2 || langs[0] !== 'en' || langs[1] !== 'vi') {
      throw new Error(
        `translationKey "${key}" must pair exactly one vi and one en post, got [${group
          .map((p) => `${p.slug}.${p.lang}`)
          .join(', ')}]`,
      )
    }
    const dates = new Set(group.map((p) => p.publishAt))
    if (dates.size !== 1) {
      throw new Error(
        `translationKey "${key}" has mismatched publishAt (${[...dates].join(
          ' vs ',
        )}). Both languages of a topic must publish together, or hreflang points at a page that does not exist yet.`,
      )
    }
  }
}
