import type { ReactNode } from 'react'
import SectionHeading from '../ui/SectionHeading'
import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/* One icon per feature card, same order as the translated card list. */
const ICONS = [
  <Icon key="target">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.5" fill="currentColor" />
  </Icon>,
  <Icon key="book">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Icon>,
  <Icon key="sliders">
    <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
    <circle cx="16" cy="8" r="2.2" />
    <circle cx="8" cy="16" r="2.2" />
  </Icon>,
  <Icon key="bookmark">
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
  </Icon>,
  <Icon key="check">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Icon>,
  <Icon key="swap">
    <path d="M7 8h10M14 5l3 3-3 3" />
    <path d="M17 16H7M10 13l-3 3 3 3" />
  </Icon>,
]

export default function Features() {
  const { t } = useLang()

  return (
    <section id="features" className="scroll-mt-16 bg-canvas-2 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading eyebrow={t.features.eyebrow} title={t.features.title} sub={t.features.sub} />
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.cards.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 70}>
              <div className="group h-full rounded-2xl bg-surface p-6 ring-1 ring-line transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift hover:ring-gold-400/50">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-accent transition-all duration-300 group-hover:scale-110 group-hover:bg-gold-400/20">
                  {ICONS[i]}
                </span>
                <h3 className="mt-4 text-lg font-bold text-heading">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-body">{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
