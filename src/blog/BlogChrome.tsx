/**
 * Header and footer for blog pages.
 *
 * This deliberately does not reuse src/components/sections/Navbar.tsx. That one
 * reads language from React context, auth state from Firebase, and route state
 * from react-router, none of which exist in a static render. More importantly,
 * its links are react-router <Link>s: on a prerendered page those would be inert,
 * and from inside the SPA a <Link to="/blog"> hands the URL to the client router,
 * which has no /blog route and would render the homepage instead. Every link
 * that crosses the SPA/blog boundary has to be a real <a href>.
 *
 * The language switch is a plain link to the paired URL rather than a toggle,
 * which is both better for crawlers and the only thing that can work without JS.
 * It carries a tiny click handler that mirrors the choice into the same
 * localStorage key the SPA uses, so returning to the app keeps the language.
 */
import type { ReactNode } from 'react'
import type { Lang } from '../content/publish.config'
import { BLOG_STRINGS } from './strings'

/** Kept in sync with src/i18n/LanguageContext.tsx. */
const LANG_STORAGE_KEY = 'merid-lang'

function MeridWordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" width={28} height={28} className="h-7 w-7" />
      <span className="text-lg font-bold text-heading">Merid</span>
    </span>
  )
}

export function BlogChrome({
  lang,
  alternateHref,
  children,
}: {
  lang: Lang
  /** The same post in the other language, when it is live. Falls back to that language's index. */
  alternateHref: string | null
  children: ReactNode
}) {
  const t = BLOG_STRINGS[lang]
  const otherLang: Lang = lang === 'vi' ? 'en' : 'vi'
  const switchHref = alternateHref ?? t.otherLanguage

  return (
    <div className="min-h-screen bg-canvas text-body">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-heading"
      >
        {t.skipToContent}
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" aria-label="Merid">
            <MeridWordmark />
          </a>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <a href={lang === 'vi' ? '/blog' : '/en/blog'} className="text-body hover:text-accent">
              {t.blog}
            </a>
            <a
              href={switchHref}
              hrefLang={otherLang}
              data-lang={otherLang}
              className="js-lang-switch rounded-full border border-line-strong px-3 py-1 text-body transition-colors hover:border-accent hover:text-accent"
            >
              {t.otherLanguageLabel}
            </a>
            <a
              href="/#demo"
              className="hidden rounded-full bg-gold-400 px-4 py-2 font-bold text-navy-900 transition-colors hover:bg-gold-300 sm:inline-block"
            >
              {t.ctaSecondary}
            </a>
          </div>
        </nav>
      </header>

      <main id="main">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:px-6">
          <p>© {new Date().getUTCFullYear()} Merid</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="/" className="hover:text-accent">
              {t.home}
            </a>
            <a href={lang === 'vi' ? '/blog' : '/en/blog'} className="hover:text-accent">
              {t.blog}
            </a>
            <a href="/tutorial" className="hover:text-accent">
              {lang === 'vi' ? 'Hướng dẫn' : 'Tutorial'}
            </a>
            <a href="/privacy-policy" className="hover:text-accent">
              {lang === 'vi' ? 'Quyền riêng tư' : 'Privacy'}
            </a>
            <a href={lang === 'vi' ? '/rss.xml' : '/en/rss.xml'} className="hover:text-accent">
              RSS
            </a>
          </nav>
        </div>
      </footer>

      {/* Mirrors the language choice into the SPA's storage key, so following a
          blog link back into the app does not snap the reader to Vietnamese. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            `document.querySelectorAll('.js-lang-switch').forEach(function(a){` +
            `a.addEventListener('click',function(){try{localStorage.setItem(` +
            `${JSON.stringify(LANG_STORAGE_KEY)},a.dataset.lang)}catch(e){}})});`,
        }}
      />
    </div>
  )
}
