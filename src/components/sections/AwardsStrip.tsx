import { useLang } from '../../i18n/LanguageContext'

/* The competition has no square mark of its own, so the win wears a trophy
 * drawn in the same hand as the Features icons. */
const TROPHY = (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0 text-gold-400"
  >
    <path d="M8 3h8v6a4 4 0 0 1-8 0V3z" />
    <path d="M8 5H5.5v1.5A3.5 3.5 0 0 0 8.6 10M16 5h2.5v1.5A3.5 3.5 0 0 1 15.4 10" />
    <path d="M12 13v3.5M9 21h6M9.5 21c0-2 1-2.5 2.5-2.5s2.5.5 2.5 2.5" />
  </svg>
)

/** The award / "featured on" strip that opens the homepage.
 *
 *  Two entries, and they are deliberately shaped differently: the TDTU win is
 *  ours to present, so it wears the site's own card, while the Unikorn listing
 *  is their official embed widget, served whole from unikorn.vn - their badge,
 *  their artwork, their dimensions.
 *
 *  Sits above the hero, so it animates with `animate-fade-up` rather than the
 *  scroll-triggered `Reveal`: an IntersectionObserver on content that is
 *  already in view flashes on load. `animate-fade-up` also uses `backwards`
 *  fill-mode, so it leaves no transform behind to trap the demo's pop-ups in a
 *  stacking context.
 *
 *  These are plain outbound links. src/lib/analytics.ts only counts install
 *  clicks, and its Placement list is mirrored server-side, so there is nothing
 *  to record here. */
export default function AwardsStrip() {
  const { t } = useLang()

  return (
    <section
      aria-label={t.awards.label}
      className="animate-fade-up mx-auto max-w-6xl px-5 pt-6 sm:px-8 lg:pt-8"
    >
      {/* One swipeable row until the pair fits, which it does from `sm` up:
          stacking them would push the headline off a small screen. The badge is
          taller than the card, so the row centres them against each other. */}
      <ul className="flex snap-x items-center gap-3 overflow-x-auto pb-1 sm:overflow-visible">
        <li className="shrink-0 snap-start">
          <a
            href="https://www.facebook.com/citt.tdtu/posts/pfbid025WpxvFyn3WpgGdPwsVTAqaXPdNRA8MGzFk3mJ7gg2epvdFSMwd7PBLKNEmHKX2mCl"
            target="_blank"
            rel="noopener noreferrer"
            /* `relative` is load-bearing, not decoration: `sr-only` is
               position:absolute, and with no positioned ancestor it resolves
               against the body, escaping the row's overflow-x scroller and
               stretching the whole page's scroll width on phones. */
            className="group relative flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-2.5 ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift hover:ring-gold-400/50"
          >
            {TROPHY}

            <span className="min-w-0">
              <span className="block text-[0.65rem] font-extrabold tracking-[0.18em] text-accent uppercase">
                {t.awards.first}
              </span>
              <span className="block text-sm font-bold whitespace-nowrap text-heading">
                {t.awards.tdtu}
              </span>
              {/* No aria-label: the badge and the name already read well in
                  order, and overriding them would only make the announcement
                  clumsier. This just warns that the link leaves the page. */}
              <span className="sr-only">, {t.awards.newTab}</span>
            </span>

            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="ml-1 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
            >
              <path d="M7 17L17 7M8 7h9v9" />
            </svg>
          </a>
        </li>

        {/* Unikorn's own embed widget, kept at the markup they hand out: their
            URL, their `ref=embed-merid` attribution, their 256x64 artwork. The
            dimensions are set as attributes as well as classes so the row does
            not reflow once the remote file arrives, and it loads eagerly like
            everything else above the fold. */}
        <li className="relative shrink-0 snap-start">
          <a
            href="https://unikorn.vn/p/merid?ref=embed-merid"
            target="_blank"
            rel="noopener noreferrer"
            className="block transition-transform duration-300 hover:-translate-y-0.5"
          >
            <img
              src="https://unikorn.vn/api/widgets/badge/merid?theme=light"
              alt={t.awards.unikorn}
              width={256}
              height={64}
              loading="eager"
              decoding="async"
              className="h-16 w-64"
            />
            <span className="sr-only">, {t.awards.newTab}</span>
          </a>
        </li>
      </ul>
    </section>
  )
}
