/**
 * Structured data for blog pages.
 *
 * Each builder returns a plain object; the document shell serialises it into a
 * <script type="application/ld+json"> block. Keeping them as data (rather than
 * template strings) means the shell can escape once, in one place, instead of
 * every call site remembering to.
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

/** Locale codes for `inLanguage`, which wants BCP 47 rather than our two-letter key. */
const LOCALE: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US' }

/**
 * The author as a linked entity rather than a bare string. `sameAs` is the part
 * that lets a search engine connect the byline to the Chrome Web Store listing
 * and the LinkedIn profile instead of treating it as an unknown name.
 */
export function personNode() {
  return {
    '@type': 'Person',
    name: AUTHOR.name,
    url: absolute('/blog'),
    ...(AUTHOR.photo ? { image: absolute(AUTHOR.photo) } : {}),
    sameAs: [...AUTHOR.sameAs],
  }
}

function organizationNode() {
  return {
    '@type': 'Organization',
    name: 'Merid',
    url: SITE_URL,
    logo: absolute('/apple-touch-icon.png'),
  }
}

export function articleSchema(fm: Frontmatter, canonical: string, image: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: fm.title,
    description: fm.description,
    image: [image],
    datePublished: fm.publishAt,
    dateModified: fm.updatedAt ?? fm.publishAt,
    author: personNode(),
    publisher: organizationNode(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: LOCALE[fm.lang],
    keywords: fm.targetKeyword,
  }
}

/** Only emitted when the post actually declares FAQ entries. */
export function faqSchema(fm: Frontmatter) {
  if (!fm.faq?.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: fm.faq.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}

export function breadcrumbSchema(fm: Frontmatter, blogLabel: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Merid', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: blogLabel, item: absolute(indexPath(fm.lang)) },
      {
        '@type': 'ListItem',
        position: 3,
        name: fm.title,
        item: absolute(postPath(fm.lang, fm.slug)),
      },
    ],
  }
}

/**
 * The blog index points back at the product it exists to sell. Mirrors the block
 * already in index.html so the two never disagree about what Merid is.
 */
export function softwareApplicationSchema(lang: Lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Merid',
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome',
    url: SITE_URL,
    downloadUrl: CWS_URL,
    inLanguage: LOCALE[lang],
    description:
      'Merid is a Chrome extension for Vietnamese speakers that swaps a few Vietnamese words for high-value English vocabulary while you browse, so everyday reading becomes natural vocabulary practice. It runs locally on your device.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: personNode(),
  }
}

/** Ties the two language indexes together as one blog. */
export function blogSchema(lang: Lang, name: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name,
    description,
    url: absolute(indexPath(lang)),
    inLanguage: LOCALE[lang],
    author: personNode(),
    publisher: organizationNode(),
  }
}
