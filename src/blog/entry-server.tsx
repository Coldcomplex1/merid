/**
 * The whole blog build, as one function.
 *
 * Vite compiles this file (and the MDX it pulls in) into a Node-loadable bundle;
 * scripts/prerender.mjs imports it and does nothing but write the returned
 * strings to disk. Keeping all the rendering here means the .mjs script needs no
 * TypeScript, no JSX, and no knowledge of the content model, and it means this
 * whole pipeline can be exercised without touching the filesystem.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AUTHOR,
  LANGS,
  SITE_URL,
  absolute,
  indexPath,
  postPath,
  type Lang,
} from '../content/publish.config'
import { WORD_TARGET, countWords } from '../content/schema'
import {
  counterpart,
  liveForLang,
  loadPosts,
  relatedPosts,
  type LoadedPost,
  type PostSet,
} from '../content/loader'
import { mdxComponents } from './mdx-components'
import PostPage, { type RelatedLink, type TocEntry } from './PostPage'
import IndexPage, { type IndexEntry } from './IndexPage'
import { DEFAULT_OG_IMAGE, renderDocument, type AlternateLink } from './document'
import {
  articleSchema,
  blogSchema,
  breadcrumbSchema,
  faqSchema,
  softwareApplicationSchema,
} from './jsonld'
import { BLOG_STRINGS } from './strings'
import { renderLlmsTxt, renderRobotsTxt, renderRss, renderSitemap, type FeedPost } from './feeds'

export interface RenderedFile {
  /** Path relative to dist/, e.g. "blog/toucan-vs-merid/index.html". */
  path: string
  body: string
}

export interface ManifestEntry {
  slug: string
  lang: Lang
  translationKey: string
  title: string
  publishAt: string
  url: string
}

export interface BuildResult {
  files: RenderedFile[]
  manifest: ManifestEntry[]
  warnings: string[]
  stats: { live: number; pending: number; topics: number }
  /** Absolute URLs of everything published, for IndexNow. */
  publishedUrls: string[]
}

/**
 * Vietnamese counts here are whitespace tokens, which for Vietnamese means
 * syllables rather than words, so it reads faster per token than English does.
 */
const WPM: Record<Lang, number> = { vi: 240, en: 200 }

/** Strips tags to get at the text, for word counts and RSS excerpts. */
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Reads the H2s back out of the rendered body to build the table of contents.
 *
 * Deriving the TOC from the output rather than from the MDX source is what
 * guarantees every anchor resolves: the ids come from rehype-slug during the
 * same render, so there is no second slugifier that could disagree about how to
 * handle a Vietnamese heading with diacritics.
 */
function extractToc(html: string): TocEntry[] {
  const entries: TocEntry[] = []
  const pattern = /<h2\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    entries.push({ id: match[1], label: textOf(match[2]) })
  }
  return entries
}

function coverImage(post: LoadedPost): { url: string; alt: string } {
  const fm = post.frontmatter
  if (!fm.cover) return { url: DEFAULT_OG_IMAGE, alt: fm.title }
  const url = fm.cover.startsWith('http') ? fm.cover : absolute(fm.cover)
  return { url, alt: fm.coverAlt ?? fm.title }
}

/**
 * hreflang for a post. Emitted only when both languages are actually live: an
 * alternate pointing at a page that has not published yet is worse than no
 * alternate at all.
 */
function alternatesFor(set: PostSet, post: LoadedPost): AlternateLink[] {
  const other = counterpart(set, post)
  if (!other) return []

  const self = absolute(postPath(post.frontmatter.lang, post.frontmatter.slug))
  const otherUrl = absolute(postPath(other.frontmatter.lang, other.frontmatter.slug))
  const vi = post.frontmatter.lang === 'vi' ? self : otherUrl

  return [
    { hrefLang: post.frontmatter.lang, href: self },
    { hrefLang: other.frontmatter.lang, href: otherUrl },
    { hrefLang: 'x-default', href: vi },
  ]
}

function renderOnePost(
  set: PostSet,
  post: LoadedPost,
  cssHrefs: string[],
  warnings: string[],
): RenderedFile {
  const fm = post.frontmatter
  const { Content } = post

  const bodyHtml = renderToStaticMarkup(<Content components={mdxComponents} />)
  const words = countWords(textOf(bodyHtml))
  const target = WORD_TARGET[fm.lang]
  if (words < target.min || words > target.max) {
    warnings.push(
      `${post.file}: body is ${words} words, target for ${fm.lang} is ${target.min}-${target.max}`,
    )
  }

  const toc = extractToc(bodyHtml)
  if (toc.length < 2) {
    warnings.push(`${post.file}: only ${toc.length} H2 heading(s), so no table of contents renders`)
  }

  for (const marker of bodyHtml.matchAll(/TODO_(STAT|SCREENSHOT|IMAGE)/g)) {
    warnings.push(`${post.file}: unresolved ${marker[0]} still in the body`)
  }

  const related: RelatedLink[] = relatedPosts(set, post).map((p) => ({
    href: postPath(p.frontmatter.lang, p.frontmatter.slug),
    title: p.frontmatter.title,
    description: p.frontmatter.description,
  }))

  const other = counterpart(set, post)
  const canonical = fm.canonicalUrl ?? absolute(postPath(fm.lang, fm.slug))
  const cover = coverImage(post)

  const bodyMarkup = renderToStaticMarkup(
    <PostPage
      frontmatter={fm}
      bodyHtml={bodyHtml}
      toc={toc}
      related={related}
      alternateHref={other ? postPath(other.frontmatter.lang, other.frontmatter.slug) : null}
      readingMinutes={Math.max(1, Math.round(words / WPM[fm.lang]))}
    />,
  )

  const schemas: unknown[] = [
    articleSchema(fm, canonical, cover.url),
    breadcrumbSchema(fm, BLOG_STRINGS[fm.lang].blog),
  ]
  const faq = faqSchema(fm)
  if (faq) schemas.push(faq)

  return {
    path: `${postPath(fm.lang, fm.slug).replace(/^\//, '')}/index.html`,
    body: renderDocument({
      lang: fm.lang,
      title: fm.title,
      description: fm.description,
      canonical,
      alternates: alternatesFor(set, post),
      ogType: 'article',
      ogImage: cover.url,
      ogImageAlt: cover.alt,
      schemas,
      cssHrefs,
      bodyHtml: bodyMarkup,
      publishedTime: fm.publishAt,
      modifiedTime: fm.updatedAt ?? fm.publishAt,
      authorName: AUTHOR.name,
    }),
  }
}

function renderIndex(set: PostSet, lang: Lang, cssHrefs: string[]): RenderedFile {
  const t = BLOG_STRINGS[lang]
  const posts = liveForLang(set, lang)

  const entries: IndexEntry[] = posts.map((post) => {
    const words = countWords(textOf(renderToStaticMarkup(<post.Content components={mdxComponents} />)))
    return {
      href: postPath(lang, post.frontmatter.slug),
      title: post.frontmatter.title,
      description: post.frontmatter.description,
      publishAt: post.frontmatter.publishAt,
      readingMinutes: Math.max(1, Math.round(words / WPM[lang])),
    }
  })

  const otherLang: Lang = lang === 'vi' ? 'en' : 'vi'
  const bodyMarkup = renderToStaticMarkup(
    <IndexPage lang={lang} posts={entries} alternateHref={indexPath(otherLang)} />,
  )

  return {
    path: `${indexPath(lang).replace(/^\//, '')}/index.html`,
    body: renderDocument({
      lang,
      title: t.indexTitle,
      description: t.indexDescription,
      canonical: absolute(indexPath(lang)),
      alternates: [
        { hrefLang: 'vi', href: absolute(indexPath('vi')) },
        { hrefLang: 'en', href: absolute(indexPath('en')) },
        { hrefLang: 'x-default', href: absolute(indexPath('vi')) },
      ],
      ogType: 'website',
      ogImage: DEFAULT_OG_IMAGE,
      ogImageAlt: 'Merid',
      schemas: [
        blogSchema(lang, t.indexTitle, t.indexDescription),
        softwareApplicationSchema(lang),
      ],
      cssHrefs,
      bodyHtml: bodyMarkup,
    }),
  }
}

export function buildBlog(options: { cssHrefs: string[]; now?: Date }): BuildResult {
  const now = options.now ?? new Date()
  const set = loadPosts(now)
  const warnings: string[] = []
  const files: RenderedFile[] = []

  for (const post of set.live) {
    files.push(renderOnePost(set, post, options.cssHrefs, warnings))
  }

  for (const lang of LANGS) {
    files.push(renderIndex(set, lang, options.cssHrefs))
  }

  const feedPosts: FeedPost[] = set.live.map((post) => ({
    frontmatter: post.frontmatter,
    excerpt: post.frontmatter.description,
  }))

  files.push({ path: 'sitemap.xml', body: renderSitemap(feedPosts, LANGS) })
  files.push({ path: 'rss.xml', body: renderRss(feedPosts, 'vi', now) })
  files.push({ path: 'en/rss.xml', body: renderRss(feedPosts, 'en', now) })
  files.push({ path: 'llms.txt', body: renderLlmsTxt(feedPosts) })
  files.push({ path: 'robots.txt', body: renderRobotsTxt() })

  const manifest: ManifestEntry[] = set.all
    .map((post) => ({
      slug: post.frontmatter.slug,
      lang: post.frontmatter.lang,
      translationKey: post.frontmatter.translationKey,
      title: post.frontmatter.title,
      publishAt: post.frontmatter.publishAt,
      url: `${SITE_URL}${postPath(post.frontmatter.lang, post.frontmatter.slug)}`,
    }))
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt) || a.slug.localeCompare(b.slug))

  return {
    files,
    manifest,
    warnings,
    stats: {
      live: set.live.length,
      pending: set.pending.length,
      topics: new Set(set.all.map((p) => p.frontmatter.translationKey)).size,
    },
    publishedUrls: [
      ...LANGS.map((lang) => absolute(indexPath(lang))),
      ...set.live.map((p) => absolute(postPath(p.frontmatter.lang, p.frontmatter.slug))),
    ],
  }
}
