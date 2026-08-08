/**
 * Wraps rendered markup in a complete HTML document.
 *
 * Built as a string rather than with renderToStaticMarkup on <html>, because the
 * things that matter most here are exactly the ones React makes awkward: the
 * doctype, unescaped JSON-LD, and an inline script that has to run before first
 * paint. A template gives byte-level control over all three.
 */
import { SITE_URL, absolute, type Lang } from '../content/publish.config'

/** Locale codes for og:locale, which wants the underscore form. */
const OG_LOCALE: Record<Lang, string> = { vi: 'vi_VN', en: 'en_US' }

const THEME_BG: Record<'light' | 'dark', string> = { light: '#faf8f2', dark: '#0e1628' }

export interface AlternateLink {
  hrefLang: string
  href: string
}

export interface DocumentOptions {
  lang: Lang
  title: string
  description: string
  canonical: string
  /** hreflang alternates, including x-default. Emitted only when the pair is live. */
  alternates: AlternateLink[]
  ogType: 'article' | 'website'
  ogImage: string
  ogImageAlt: string
  /** Serialised into one <script type="application/ld+json"> block each. */
  schemas: unknown[]
  /** Hashed CSS assets from the SPA build, so the blog shares one stylesheet. */
  cssHrefs: string[]
  bodyHtml: string
  publishedTime?: string
  modifiedTime?: string
  authorName?: string
}

/** Minimal HTML-attribute escaping for values we interpolate into the head. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * JSON-LD sits inside a <script>, so the only character that can break out is
 * `<`. Escaping it as < keeps the JSON valid and the document well-formed
 * even if a post title ever contains markup.
 */
function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/**
 * Copied from index.html so blog pages pick up the saved theme before first
 * paint. Keep in sync with index.html and src/theme/ThemeContext.tsx.
 */
const THEME_BOOTSTRAP = `(function(){try{var saved=localStorage.getItem('merid-theme');var theme=saved==='light'||saved==='dark'?saved:window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var root=document.documentElement;root.setAttribute('data-theme',theme);root.style.colorScheme=theme;root.style.backgroundColor=theme==='dark'?'${THEME_BG.dark}':'${THEME_BG.light}';var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',theme==='dark'?'${THEME_BG.dark}':'${THEME_BG.light}');}catch(e){}})();`

export function renderDocument(opts: DocumentOptions): string {
  const head: string[] = [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<meta name="theme-color" content="${THEME_BG.light}" />`,
    `<script>${THEME_BOOTSTRAP}</script>`,
    `<title>${attr(opts.title)}</title>`,
    `<meta name="description" content="${attr(opts.description)}" />`,
    `<link rel="canonical" href="${attr(opts.canonical)}" />`,
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    `<link rel="alternate" type="application/rss+xml" title="Merid blog" href="${attr(
      absolute(opts.lang === 'vi' ? '/rss.xml' : '/en/rss.xml'),
    )}" />`,
  ]

  for (const alt of opts.alternates) {
    head.push(
      `<link rel="alternate" hreflang="${attr(alt.hrefLang)}" href="${attr(alt.href)}" />`,
    )
  }

  head.push(
    `<meta property="og:type" content="${opts.ogType}" />`,
    '<meta property="og:site_name" content="Merid" />',
    `<meta property="og:url" content="${attr(opts.canonical)}" />`,
    `<meta property="og:title" content="${attr(opts.title)}" />`,
    `<meta property="og:description" content="${attr(opts.description)}" />`,
    `<meta property="og:image" content="${attr(opts.ogImage)}" />`,
    `<meta property="og:image:alt" content="${attr(opts.ogImageAlt)}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[opts.lang]}" />`,
    `<meta property="og:locale:alternate" content="${OG_LOCALE[opts.lang === 'vi' ? 'en' : 'vi']}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${attr(opts.title)}" />`,
    `<meta name="twitter:description" content="${attr(opts.description)}" />`,
    `<meta name="twitter:image" content="${attr(opts.ogImage)}" />`,
  )

  if (opts.ogType === 'article') {
    if (opts.publishedTime) {
      head.push(`<meta property="article:published_time" content="${attr(opts.publishedTime)}" />`)
    }
    if (opts.modifiedTime) {
      head.push(`<meta property="article:modified_time" content="${attr(opts.modifiedTime)}" />`)
    }
    if (opts.authorName) {
      head.push(`<meta property="article:author" content="${attr(opts.authorName)}" />`)
    }
  }

  for (const href of opts.cssHrefs) {
    head.push(`<link rel="stylesheet" href="${attr(href)}" />`)
  }

  for (const schema of opts.schemas) {
    head.push(`<script type="application/ld+json">${jsonLd(schema)}</script>`)
  }

  return `<!doctype html>
<html lang="${opts.lang}">
<head>
${head.map((line) => `  ${line}`).join('\n')}
</head>
<body>
${opts.bodyHtml}
</body>
</html>
`
}

/** Absolute URL for the default social card, used when a post declares no cover. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-card.jpg`
