/**
 * The blog's entire schedule and identity, in one file.
 *
 * Publishing is a pure function of PUBLISH_START, INTERVAL_DAYS and each post's
 * `publishAt` frontmatter. There is no database, no status flag and no admin
 * screen: a post is live when its date has passed and the site has been rebuilt
 * since. To move the whole schedule, change PUBLISH_START and regenerate the
 * dates (see docs/BLOG.md).
 */

/** Topic 1 publishes on this date; topic N publishes INTERVAL_DAYS × (N-1) later. */
export const PUBLISH_START = '2026-08-08'

/** Gap between consecutive topics. Both languages of one topic share a date. */
export const INTERVAL_DAYS = 3

/** Production origin. Every canonical, hreflang, sitemap and RSS URL is built from this. */
export const SITE_URL = 'https://merid.site'

/** The Chrome Web Store listing, reused by every CTA and by SoftwareApplication JSON-LD. */
export const CWS_URL =
  'https://chromewebstore.google.com/detail/merid/ggfpandbibalomfbappkblppmffncoeo'

export const LINKEDIN_URL = 'https://www.linkedin.com/in/vanquyetdoan/'

export type Lang = 'vi' | 'en'

export const LANGS: readonly Lang[] = ['vi', 'en']

/**
 * The author box, and the `Person` node in every post's JSON-LD. `sameAs` is
 * what turns the byline from a string into an entity search engines can connect
 * to the extension listing and the LinkedIn profile.
 */
export const AUTHOR = {
  name: 'Van Quyet Doan',
  url: `${SITE_URL}/blog`,
  sameAs: [CWS_URL, LINKEDIN_URL],
  /** Drop a square image here (>=200px) and the author box picks it up. */
  photo: '',
  bio: {
    vi: 'Sinh viên ở TP.HCM. Mình làm Merid vì đã bỏ dở mọi app học từ vựng từng tải về.',
    en: 'Student in Ho Chi Minh City. I built Merid because I quit every vocabulary app I ever downloaded.',
  },
} as const

/** URL path for a post, per language. Vietnamese sits at the root, English under /en. */
export function postPath(lang: Lang, slug: string): string {
  return lang === 'vi' ? `/blog/${slug}` : `/en/blog/${slug}`
}

/** URL path for a language's blog index. */
export function indexPath(lang: Lang): string {
  return lang === 'vi' ? '/blog' : '/en/blog'
}

/** Absolute URL from a site-relative path. */
export function absolute(path: string): string {
  return `${SITE_URL}${path}`
}

/** The publishAt date for topic N (1-based), as an ISO date string. */
export function dateForTopic(topic: number): string {
  const start = new Date(`${PUBLISH_START}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() + (topic - 1) * INTERVAL_DAYS)
  return start.toISOString().slice(0, 10)
}
