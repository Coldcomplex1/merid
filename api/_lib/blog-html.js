// The HTML for every public blog page.
//
// Built as strings rather than with a component library because the things that
// matter most here are exactly the ones a framework makes awkward: the doctype,
// unescaped JSON-LD, and an inline script that has to run before first paint.
//
// Everything this emits must be complete without JavaScript. GPTBot, ClaudeBot
// and PerplexityBot do not execute it, and they are the readers this content is
// written for. The only <script> tags on a blog page are the theme bootstrap and
// the JSON-LD block; neither renders anything.
import {
  AUTHOR,
  CWS_URL,
  DEFAULT_OG_IMAGE,
  LOCALE,
  OG_LOCALE,
  SITE_URL,
  STRINGS,
  absolute,
  formatDate,
  indexPath,
  postPath,
} from './blog-config.js'
import { extractToc, readingMinutes, stripTags, toHtml } from './markdown.js'
import { sanitizeArticleHtml } from './sanitize.js'

const THEME_BG = { light: '#faf8f2', dark: '#0e1628' }

/**
 * The site stylesheet, at a stable path written by scripts/copy-blog-css.mjs.
 *
 * Deliberately not the hashed asset name: dist/ is not on the serverless
 * function's filesystem, so looking the hash up at request time never worked and
 * left every blog page unstyled. Vercel purges its CDN on deploy, so a stable
 * name does not go stale.
 */
const STYLESHEET = '/blog.css'

/** Copied from index.html so blog pages pick up the saved theme before paint.
 *  Keep in sync with index.html and src/theme/ThemeContext.tsx. */
const THEME_BOOTSTRAP = `(function(){try{var saved=localStorage.getItem('merid-theme');var theme=saved==='light'||saved==='dark'?saved:window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var root=document.documentElement;root.setAttribute('data-theme',theme);root.style.colorScheme=theme;root.style.backgroundColor=theme==='dark'?'${THEME_BG.dark}':'${THEME_BG.light}';var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',theme==='dark'?'${THEME_BG.dark}':'${THEME_BG.light}');}catch(e){}})();`

/** Mirrors the language choice into the SPA's storage key, so following a link
 *  back into the app does not snap the reader to the other language. */
const LANG_SYNC = `document.querySelectorAll('.js-lang-switch').forEach(function(a){a.addEventListener('click',function(){try{localStorage.setItem('merid-lang',a.dataset.lang)}catch(e){}})});`

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** JSON-LD sits inside a <script>, so `<` is the only character that can break
 *  out. Escaping it keeps the JSON valid and the document well-formed. */
function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/** The author as a linked entity rather than a bare string, so a search engine
 *  can connect the byline to the extension listing and the LinkedIn profile. */
function personNode() {
  return {
    '@type': 'Person',
    name: AUTHOR.name,
    url: absolute('/blog'),
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

function softwareApplicationSchema(lang) {
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

// ---------------------------------------------------------------------------
// Document shell
// ---------------------------------------------------------------------------

export function renderDocument(opts) {
  const head = [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<meta name="theme-color" content="${THEME_BG.light}" />`,
    `<script>${THEME_BOOTSTRAP}</script>`,
    `<title>${esc(opts.title)}</title>`,
    `<meta name="description" content="${esc(opts.description)}" />`,
    `<link rel="canonical" href="${esc(opts.canonical)}" />`,
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  ]

  if (opts.noindex) {
    head.push('<meta name="robots" content="noindex, follow" />')
  }

  for (const alt of opts.alternates ?? []) {
    head.push(`<link rel="alternate" hreflang="${esc(alt.hrefLang)}" href="${esc(alt.href)}" />`)
  }

  head.push(
    `<meta property="og:type" content="${opts.ogType}" />`,
    '<meta property="og:site_name" content="Merid" />',
    `<meta property="og:url" content="${esc(opts.canonical)}" />`,
    `<meta property="og:title" content="${esc(opts.title)}" />`,
    `<meta property="og:description" content="${esc(opts.description)}" />`,
    `<meta property="og:image" content="${esc(opts.ogImage)}" />`,
    `<meta property="og:image:alt" content="${esc(opts.ogImageAlt)}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[opts.lang]}" />`,
    `<meta property="og:locale:alternate" content="${OG_LOCALE[opts.lang === 'vie' ? 'en' : 'vie']}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(opts.title)}" />`,
    `<meta name="twitter:description" content="${esc(opts.description)}" />`,
    `<meta name="twitter:image" content="${esc(opts.ogImage)}" />`,
  )

  if (opts.ogType === 'article') {
    if (opts.publishedTime) head.push(`<meta property="article:published_time" content="${esc(opts.publishedTime)}" />`)
    if (opts.modifiedTime) head.push(`<meta property="article:modified_time" content="${esc(opts.modifiedTime)}" />`)
    head.push(`<meta property="article:author" content="${esc(AUTHOR.name)}" />`)
  }

  head.push(`<link rel="stylesheet" href="${STYLESHEET}" />`)
  for (const schema of opts.schemas ?? []) {
    head.push(`<script type="application/ld+json">${jsonLd(schema)}</script>`)
  }

  return `<!doctype html>
<html lang="${opts.lang === 'vie' ? 'vi' : 'en'}">
<head>
${head.map((line) => `  ${line}`).join('\n')}
</head>
<body>
${opts.body}
<script>${LANG_SYNC}</script>
</body>
</html>
`
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function chrome(lang, inner, alternateHref) {
  const t = STRINGS[lang]
  const otherLang = lang === 'vie' ? 'en' : 'vie'
  const switchHref = alternateHref ?? indexPath(otherLang)

  return `<div class="blog-shell">
  <a class="skip-link" href="#main">${esc(t.skipToContent)}</a>
  <header class="blog-header">
    <nav class="blog-nav">
      <a class="blog-brand" href="/" aria-label="Merid">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Merid</span>
      </a>
      <div class="blog-nav-links">
        <a href="${esc(indexPath(lang))}">${esc(t.blog)}</a>
        <a class="js-lang-switch blog-lang" href="${esc(switchHref)}" hreflang="${otherLang === 'vie' ? 'vi' : 'en'}" data-lang="${otherLang === 'vie' ? 'vi' : 'en'}">${esc(t.otherLanguageLabel)}</a>
        <a class="blog-cta-small" href="/#demo">${esc(t.ctaSecondary)}</a>
      </div>
    </nav>
  </header>
  <main id="main">${inner}</main>
  <footer class="blog-footer">
    <p>&copy; ${new Date().getUTCFullYear()} Merid</p>
    <nav>
      <a href="/">${esc(t.home)}</a>
      <a href="${esc(indexPath(lang))}">${esc(t.blog)}</a>
      <a href="/tutorial">${lang === 'vie' ? 'Hướng dẫn' : 'Tutorial'}</a>
      <a href="/privacy-policy">${lang === 'vie' ? 'Quyền riêng tư' : 'Privacy'}</a>
    </nav>
  </footer>
</div>`
}

function ctaBlock(lang) {
  const t = STRINGS[lang]
  return `<section class="blog-cta">
  <h2>${esc(t.ctaHeading)}</h2>
  <p>${esc(t.ctaBody)}</p>
  <p class="blog-cta-actions">
    <a class="btn-gold" href="${esc(CWS_URL)}" target="_blank" rel="noopener noreferrer">${esc(t.ctaButton)}</a>
    <a class="btn-outline" href="/#demo">${esc(t.ctaSecondary)}</a>
  </p>
</section>`
}

function authorBox(lang) {
  const t = STRINGS[lang]
  return `<section class="blog-author">
  <h2>${esc(t.aboutAuthor)}</h2>
  <p class="blog-author-name">${esc(AUTHOR.name)}</p>
  <p>${esc(AUTHOR.bio[lang])}</p>
  <p class="blog-author-links">
    <a href="${esc(CWS_URL)}" target="_blank" rel="noopener noreferrer">Merid on the Chrome Web Store</a>
    <a href="${esc(AUTHOR.sameAs[1])}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
  </p>
</section>`
}

// ---------------------------------------------------------------------------
// Post page
// ---------------------------------------------------------------------------

/**
 * A single post.
 *
 * DOM order is deliberate and is the point of this function:
 *   H1 -> byline -> excerpt -> table of contents -> body -> FAQ -> author -> CTA
 * The excerpt sits above everything so a model reading the raw HTML top-down
 * meets a summary before any preamble.
 */
export function renderPostPage(post, counterpart) {
  const lang = post.lang
  const t = STRINGS[lang]

  const bodyHtml = sanitizeArticleHtml(toHtml(post.content))
  const toc = extractToc(bodyHtml)
  const minutes = readingMinutes(stripTags(bodyHtml), lang)

  const canonical = post.canonicalUrl || absolute(postPath(lang, post.slug))
  const cover = post.coverImage
    ? post.coverImage.startsWith('http')
      ? post.coverImage
      : absolute(post.coverImage)
    : DEFAULT_OG_IMAGE

  const alternates = counterpart
    ? [
        { hrefLang: lang === 'vie' ? 'vi' : 'en', href: absolute(postPath(lang, post.slug)) },
        {
          hrefLang: counterpart.lang === 'vie' ? 'vi' : 'en',
          href: absolute(postPath(counterpart.lang, counterpart.slug)),
        },
        {
          hrefLang: 'x-default',
          href: absolute(
            lang === 'vie'
              ? postPath(lang, post.slug)
              : postPath(counterpart.lang, counterpart.slug),
          ),
        },
      ]
    : []

  const tocHtml = toc.length > 1
    ? `<nav class="blog-toc" aria-label="${esc(t.toc)}">
  <h2>${esc(t.toc)}</h2>
  <ol>${toc.map((e) => `<li><a href="#${esc(e.id)}">${esc(e.label)}</a></li>`).join('')}</ol>
</nav>`
    : ''

  const faqHtml = Array.isArray(post.faq) && post.faq.length
    ? `<section class="blog-faq">
  <h2>${esc(t.faq)}</h2>
  <dl>${post.faq
    .map((f) => `<dt>${esc(f.question)}</dt><dd>${esc(f.answer)}</dd>`)
    .join('')}</dl>
</section>`
    : ''

  const tagsHtml = Array.isArray(post.tags) && post.tags.length
    ? `<ul class="blog-tags">${post.tags.map((tag) => `<li>${esc(tag)}</li>`).join('')}</ul>`
    : ''

  const coverHtml = post.coverImage
    ? `<figure class="blog-cover"><img src="${esc(post.coverImage)}" alt="${esc(post.coverAlt || post.title)}" /></figure>`
    : ''

  const article = `<article class="blog-article">
  <nav class="blog-crumbs"><a href="/">${esc(t.home)}</a> <span>/</span> <a href="${esc(indexPath(lang))}">${esc(t.blog)}</a></nav>
  <h1>${esc(post.title)}</h1>
  <p class="blog-meta">
    <span>${esc(post.author || AUTHOR.name)}</span>
    <span aria-hidden="true">&middot;</span>
    <time datetime="${esc(post.publishedAt)}">${esc(t.publishedOn)} ${esc(formatDate(post.publishedAt, lang))}</time>
    <span aria-hidden="true">&middot;</span>
    <span>${esc(t.readingTime(minutes))}</span>
  </p>
  ${tagsHtml}
  ${coverHtml}
  ${post.excerpt ? `<div class="blog-lede"><p>${esc(post.excerpt)}</p></div>` : ''}
  ${tocHtml}
  <div class="prose-merid">${bodyHtml}</div>
  ${faqHtml}
  ${authorBox(lang)}
  ${ctaBlock(lang)}
</article>`

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.seoDescription || post.excerpt,
      image: [cover],
      datePublished: post.publishedAt,
      dateModified: post.updatedAt || post.publishedAt,
      author: personNode(),
      publisher: organizationNode(),
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      inLanguage: LOCALE[lang],
      ...(Array.isArray(post.tags) && post.tags.length ? { keywords: post.tags.join(', ') } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Merid', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: t.blog, item: absolute(indexPath(lang)) },
        { '@type': 'ListItem', position: 3, name: post.title, item: absolute(postPath(lang, post.slug)) },
      ],
    },
  ]

  if (Array.isArray(post.faq) && post.faq.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: post.faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    })
  }

  return renderDocument({
    lang,
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt || '',
    canonical,
    alternates,
    ogType: 'article',
    ogImage: cover,
    ogImageAlt: post.coverAlt || post.title,
    schemas,
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt || post.publishedAt,
    body: chrome(lang, article, counterpart ? postPath(counterpart.lang, counterpart.slug) : null),
  })
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

export function renderIndexPage(lang, posts) {
  const t = STRINGS[lang]

  const list = posts.length
    ? `<ul class="blog-list">${posts
        .map((post) => {
          const minutes = readingMinutes(stripTags(sanitizeArticleHtml(toHtml(post.content))), lang)
          const cover = post.coverImage
            ? `<img class="blog-card-cover" src="${esc(post.coverImage)}" alt="${esc(post.coverAlt || '')}" loading="lazy" decoding="async" />`
            : ''
          const tags = Array.isArray(post.tags) && post.tags.length
            ? `<ul class="blog-tags">${post.tags.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
            : ''
          return `<li class="blog-card">
  <a href="${esc(postPath(lang, post.slug))}">
    ${cover}
    <h2>${esc(post.title)}</h2>
    <p class="blog-card-excerpt">${esc(post.excerpt || '')}</p>
    ${tags}
    <p class="blog-meta">
      <time datetime="${esc(post.publishedAt)}">${esc(formatDate(post.publishedAt, lang))}</time>
      <span aria-hidden="true">&middot;</span>
      <span>${esc(t.readingTime(minutes))}</span>
    </p>
  </a>
</li>`
        })
        .join('')}</ul>`
    : `<p class="blog-empty">${esc(t.empty)}</p>`

  const inner = `<div class="blog-index">
  <h1>${esc(t.indexHeading)}</h1>
  <p class="blog-index-sub">${esc(t.indexSubheading)}</p>
  ${list}
  ${ctaBlock(lang)}
</div>`

  return renderDocument({
    lang,
    title: t.indexTitle,
    description: t.indexDescription,
    canonical: absolute(indexPath(lang)),
    alternates: [
      { hrefLang: 'vi', href: absolute(indexPath('vie')) },
      { hrefLang: 'en', href: absolute(indexPath('en')) },
      { hrefLang: 'x-default', href: absolute(indexPath('vie')) },
    ],
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Merid',
    schemas: [
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: t.indexTitle,
        description: t.indexDescription,
        url: absolute(indexPath(lang)),
        inLanguage: LOCALE[lang],
        author: personNode(),
        publisher: organizationNode(),
      },
      softwareApplicationSchema(lang),
    ],
    body: chrome(lang, inner, indexPath(lang === 'vie' ? 'en' : 'vie')),
  })
}

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------

export function renderNotFound(lang) {
  const t = STRINGS[lang] ?? STRINGS.vie
  const safeLang = STRINGS[lang] ? lang : 'vie'

  const inner = `<div class="blog-index blog-notfound">
  <h1>${esc(t.notFoundTitle)}</h1>
  <p class="blog-index-sub">${esc(t.notFoundBody)}</p>
  <p><a class="btn-outline" href="${esc(indexPath(safeLang))}">${esc(t.blog)}</a></p>
</div>`

  return renderDocument({
    lang: safeLang,
    title: `${t.notFoundTitle} — Merid`,
    description: t.notFoundBody,
    canonical: absolute(indexPath(safeLang)),
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Merid',
    // A 404 is already excluded from indexing by its status code; the tag makes
    // it explicit for anything that renders the body regardless.
    noindex: true,
    body: chrome(safeLang, inner, null),
  })
}
