import type { ReactNode } from 'react'
import { useLang } from '../../i18n/LanguageContext'

/* Where Merid has been recognised, in the order it is shown. The names are
 * proper nouns, so like the SAT/B2/C1/C2 tags in Hero they stay in the
 * component; only the label above each name comes from the translations.
 *
 * `badge` picks which label: the TDTU entry is a win, the other two are
 * listings. Kept as a key rather than the string itself so both languages
 * stay in translations.ts. */
type Badge = 'first' | 'featuredOn'

interface Award {
  id: string
  name: string
  badge: Badge
  href: string
  mark: ReactNode
}

/* The Product Hunt and Unikorn marks are the official artwork, served from
 * public/awards/. They are the first <img> tags on the marketing site - every
 * other logo here is an inline SVG - because a third party's mark should be
 * their own file rather than something we redrew. Both are under 3 KB.
 *
 * TDTU Vibe Coding has no square mark (public/awards/tdtu-vibe-coding-2026.png
 * is a wide event banner, too heavy and too busy for a 28px slot), so the win
 * carries a gold trophy drawn in the same style as the Features icons. */
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

const AWARDS: Award[] = [
  {
    id: 'tdtu',
    name: 'TDTU Vibe Coding 2026',
    badge: 'first',
    href: 'https://www.facebook.com/citt.tdtu/posts/pfbid025WpxvFyn3WpgGdPwsVTAqaXPdNRA8MGzFk3mJ7gg2epvdFSMwd7PBLKNEmHKX2mCl',
    mark: (
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
    ),
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
]

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

  return (
    <section
      aria-label={t.awards.label}
      className="animate-fade-up mx-auto max-w-6xl px-5 pt-6 sm:px-8 lg:pt-8"
    >
      {/* One swipeable row on phones: three stacked cards would push the
          headline most of the way off a small screen. From `sm` up they wrap
          normally, and from `lg` they line up with the hero's text column. */}
      <ul className="flex snap-x gap-2.5 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible lg:justify-start">
        {AWARDS.map((award) => (
          <li key={award.id} className="shrink-0 snap-start">
            <a
              href={award.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-2xl bg-surface px-4 py-2.5 ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift hover:ring-gold-400/50"
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
