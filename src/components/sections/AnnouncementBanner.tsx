import { useLang } from '../../i18n/LanguageContext'
import { CHROME_STORE_URL } from '../../config'

/** Slim launch banner at the very top of the page. It scrolls away with the
 *  page (the navbar below it is the sticky element), so it never obstructs
 *  navigation. Non-dismissible by design: the site has no banner-dismissal
 *  system and this stays intentionally lightweight. */
export default function AnnouncementBanner() {
  const { t } = useLang()

  return (
    <div className="border-b border-line bg-canvas-2">
      {/* Always a single line, phones included: nothing wraps, and below the
       *  sm breakpoint the type scales with the viewport (3.05vw ≈ the widest
       *  copy, English, fitting a 320px screen) until it reaches its 14px
       *  ceiling. Padding, the dot and the gaps tighten to match. */}
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-x-1.5 px-2.5 py-2 text-center text-[clamp(0.625rem,3.05vw,0.875rem)] whitespace-nowrap sm:gap-x-2.5 sm:px-4">
        <span className="inline-flex items-center gap-1.5 font-semibold text-heading sm:gap-2">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400 sm:h-2 sm:w-2" />
          {t.banner.text}
        </span>
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold text-accent underline-offset-2 transition-colors hover:text-accent-hover hover:underline"
        >
          {t.banner.action}
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  )
}
