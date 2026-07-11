import { useLang } from '../../i18n/LanguageContext'
import { CHROME_STORE_URL } from '../../config'

/** Slim launch banner at the very top of the page. It scrolls away with the
 *  page (the navbar below it is the sticky element), so it never obstructs
 *  navigation. Non-dismissible by design — the site has no banner-dismissal
 *  system and this stays intentionally lightweight. */
export default function AnnouncementBanner() {
  const { t } = useLang()

  return (
    <div className="border-b border-line bg-canvas-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-4 py-2 text-center text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-heading">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-gold-400" />
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
