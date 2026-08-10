import type { ReactNode } from 'react'
import { useLang } from '../../i18n/LanguageContext'

/* Where Merid has been recognised, in the order it is shown. The platform
 * names are proper nouns, so like the SAT/B2/C1/C2 tags in Hero they stay in
 * the component. The competition is the exception - it has a Vietnamese name
 * and an English one - so it reads its name from the translations.
 *
 * `badge` picks the label above the name: the TDTU entry is a win, the rest
 * are listings. Kept as a key rather than the string itself so both languages
 * stay in translations.ts. */
type Badge = 'first' | 'featuredOn'

interface Award {
  id: string
  name: string
  badge: Badge
  href: string
  mark: ReactNode
}

/* The platform marks are the official artwork, served from public/awards/.
 * They are the first <img> tags on the marketing site - every other logo here
 * is an inline SVG - because a third party's mark should be their own file
 * rather than something we redrew. */
function LogoImage({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      /* Above the fold: never lazy, and the dimensions are explicit so the
         card does not resize once the file arrives. */
      loading="eager"
      decoding="async"
      /* The Unikorn mark is near-black on its own tile; without the ring it
         melts into the navy surface in dark mode. */
      className="h-7 w-7 shrink-0 rounded-md ring-1 ring-line"
    />
  )
}

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

  const awards: Award[] = [
    {
      id: 'tdtu',
      name: t.awards.tdtu,
      badge: 'first',
      href: 'https://www.facebook.com/citt.tdtu/posts/pfbid025WpxvFyn3WpgGdPwsVTAqaXPdNRA8MGzFk3mJ7gg2epvdFSMwd7PBLKNEmHKX2mCl',
      mark: TROPHY,
    },
    {
      id: 'producthunt',
      name: 'Product Hunt',
      badge: 'featuredOn',
      href: 'https://www.producthunt.com/products/merid-learn-english-as-you-browse',
      mark: <LogoImage src="/awards/product-hunt.webp" />,
    },
    {
      id: 'unikorn',
      name: 'Unikorn',
      badge: 'featuredOn',
      href: 'https://unikorn.vn/p/merid',
      mark: <LogoImage src="/awards/unikorn.png" />,
    },
    {
      id: 'saashub',
      name: 'SaaSHub',
      badge: 'featuredOn',
      href: 'https://www.saashub.com/merid',
      mark: <LogoImage src="/awards/saashub.png" />,
    },
  ]

  return (
    <section
      aria-label={t.awards.label}
      className="animate-fade-up mx-auto max-w-6xl px-5 pt-6 sm:px-8 lg:pt-8"
    >
      {/* One swipeable row until the whole set fits, which is `lg`: stacking
          them would push the headline off a small screen, and letting them
          wrap in between leaves a lone fourth card orphaned on its own line.
          The gap and padding are trimmed so all four still fit at exactly
          1024px, where the longer English name is widest. */}
      <ul className="flex snap-x gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:justify-start lg:overflow-visible">
        {awards.map((award) => (
          <li key={award.id} className="shrink-0 snap-start">
            <a
              href={award.href}
              target="_blank"
              rel="noopener noreferrer"
              /* `relative` is load-bearing, not decoration: `sr-only` is
                 position:absolute, and with no positioned ancestor it resolves
                 against the body, escaping the row's overflow-x scroller and
                 stretching the whole page's scroll width on phones. */
              className="group relative flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-2.5 ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift hover:ring-gold-400/50"
            >
              {award.mark}

              <span className="min-w-0">
                <span className="block text-[0.65rem] font-extrabold tracking-[0.18em] text-accent uppercase">
                  {t.awards[award.badge]}
                </span>
                <span className="block text-sm font-bold whitespace-nowrap text-heading">
                  {award.name}
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
        ))}
      </ul>
    </section>
  )
}
