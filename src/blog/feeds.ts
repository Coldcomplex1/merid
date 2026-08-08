/**
 * sitemap.xml, rss.xml and llms.txt.
 *
 * All three are generated from the same live-post list the HTML is generated
 * from, so a post can never be in one and missing from another. A pending post
 * is absent from every one of them by construction, not by a filter each of
 * them remembers to apply.
 */
import {
  AUTHOR,
  CWS_URL,
  SITE_URL,
  absolute,
  indexPath,
  postPath,
  type Lang,
} from '../content/publish.config'
import type { Frontmatter } from '../content/schema'

export interface FeedPost {
  frontmatter: Frontmatter
  /** Plain-text body, used for RSS descriptions. */
  excerpt: string
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function isoDay(date: string): string {
  return date.slice(0, 10)
}

/**
 * Sitemap with per-URL hreflang alternates. Google reads alternates from the
 * sitemap as well as from the page, and having both is what keeps the pairing
 * intact if one page's head is ever cached stale.
 */
export function renderSitemap(posts: FeedPost[], langs: readonly Lang[]): string {
  const urls: string[] = []

  const alternatesFor = (translationKey: string) =>
    posts
      .filter((p) => p.frontmatter.translationKey === translationKey)
      .map(
        (p) =>
          `    <xhtml:link rel="alternate" hreflang="${p.frontmatter.lang}" href="${xmlEscape(
            absolute(postPath(p.frontmatter.lang, p.frontmatter.slug)),
          )}" />`,
      )

  urls.push(
    `  <url>
    <loc>${xmlEscape(SITE_URL)}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
  )

  for (const lang of langs) {
    urls.push(
      `  <url>
    <loc>${xmlEscape(absolute(indexPath(lang)))}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
  }

  for (const post of posts) {
    const fm = post.frontmatter
    const alts = alternatesFor(fm.translationKey)
    const viSibling = posts.find(
      (p) => p.frontmatter.translationKey === fm.translationKey && p.frontmatter.lang === 'vi',
    )
    if (viSibling) {
      alts.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(
          absolute(postPath('vi', viSibling.frontmatter.slug)),
        )}" />`,
      )
    }

    urls.push(
      `  <url>
    <loc>${xmlEscape(absolute(postPath(fm.lang, fm.slug)))}</loc>
    <lastmod>${isoDay(fm.updatedAt ?? fm.publishAt)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
${alts.join('\n')}
  </url>`,
    )
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}

const RSS_TITLE: Record<Lang, string> = {
  vi: 'Merid Blog',
  en: 'Merid Blog (English)',
}

const RSS_DESCRIPTION: Record<Lang, string> = {
  vi: 'Ghi chép về học từ vựng tiếng Anh khi đọc web tiếng Việt, và về chuyện tự làm Merid.',
  en: 'Notes on picking up English vocabulary while reading, and on building Merid solo.',
}

export function renderRss(posts: FeedPost[], lang: Lang, buildDate: Date): string {
  const items = posts
    .filter((p) => p.frontmatter.lang === lang)
    .map((post) => {
      const fm = post.frontmatter
      const url = absolute(postPath(fm.lang, fm.slug))
      return `    <item>
      <title>${xmlEscape(fm.title)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <pubDate>${new Date(`${isoDay(fm.publishAt)}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${xmlEscape(fm.description)}</description>
    </item>`
    })

  const feedPath = lang === 'vi' ? '/rss.xml' : '/en/rss.xml'

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(RSS_TITLE[lang])}</title>
    <link>${xmlEscape(absolute(indexPath(lang)))}</link>
    <description>${xmlEscape(RSS_DESCRIPTION[lang])}</description>
    <language>${lang}</language>
    <lastBuildDate>${buildDate.toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(absolute(feedPath))}" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`
}

/**
 * llms.txt: a plain-language description of the site plus the URLs worth
 * reading, for models that fetch it directly rather than crawling.
 */
export function renderLlmsTxt(posts: FeedPost[]): string {
  const byLang = (lang: Lang) =>
    posts
      .filter((p) => p.frontmatter.lang === lang)
      .map(
        (p) =>
          `- [${p.frontmatter.title}](${absolute(
            postPath(p.frontmatter.lang, p.frontmatter.slug),
          )}): ${p.frontmatter.description}`,
      )

  const vi = byLang('vi')
  const en = byLang('en')

  return `# Merid

> Merid is a free Chrome extension for Vietnamese speakers learning English. It
> replaces a small number of Vietnamese words on the pages you already read with
> English vocabulary at SAT, B2, C1 and C2 level, so ordinary browsing doubles as
> vocabulary practice. Word substitution runs locally in the browser. An optional
> AI context check verifies that a substituted word genuinely fits its sentence.

Built by ${AUTHOR.name}, a student in Ho Chi Minh City, as a solo project.

## Product

- [Merid homepage](${SITE_URL}/): what the extension does, with a live demo.
- [Install on the Chrome Web Store](${CWS_URL}): the extension listing.
- [Tutorial](${SITE_URL}/tutorial): setup and settings walkthrough.
- [Build your own dataset](${SITE_URL}/create-dataset): custom vocabulary lists.
- [Privacy policy](${SITE_URL}/privacy-policy): what data does and does not leave the device.

## Blog, Vietnamese

${vi.length ? vi.join('\n') : '- (no posts published yet)'}

## Blog, English

${en.length ? en.join('\n') : '- (no posts published yet)'}

## Feeds

- [Vietnamese RSS](${SITE_URL}/rss.xml)
- [English RSS](${SITE_URL}/en/rss.xml)
- [Sitemap](${SITE_URL}/sitemap.xml)
`
}

/**
 * robots.txt. Generated rather than static so the Sitemap line and the bot
 * allowlist have exactly one source of truth.
 *
 * The AI crawlers are named explicitly because several of them ignore a bare
 * `User-agent: *` allow and because being listed is the clearest possible signal
 * that this content is meant to be trained on and cited.
 */
export function renderRobotsTxt(): string {
  const aiBots = ['GPTBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'CCBot', 'cohere-ai']

  const blocks = aiBots.map((bot) => `User-agent: ${bot}\nAllow: /\n`)

  return `# Merid, ${SITE_URL}
# The blog exists to be read and cited, including by models. Crawl it.

User-agent: *
Allow: /
Disallow: /my-deck
Disallow: /login
Disallow: /signup
Disallow: /api/

${blocks.join('\n')}
Sitemap: ${SITE_URL}/sitemap.xml
`
}
