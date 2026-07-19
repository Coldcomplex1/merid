import { useEffect, useState, type ReactNode } from 'react'
import SectionHeading from '../ui/SectionHeading'
import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'

/** Loop through values on a timer, pausing under prefers-reduced-motion. */
function useCycle(length: number, ms: number) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % length), ms)
    return () => window.clearInterval(timer)
  }, [length, ms])
  return index
}

/** "Context-aware replacement" card: the same sentence cycling through the
 *  three display modes, so the feature demonstrates itself. */
function ModesMicroDemo() {
  const MODES = ['Replace', 'Highlight', 'Beside'] as const
  const mode = useCycle(MODES.length, 2400)

  return (
    <div className="mt-5 rounded-xl bg-cream-50 p-4 ring-1 ring-navy-200/50" aria-hidden="true">
      <p className="font-wiki text-[14px] leading-relaxed text-ink" lang="vi">
        …nhằm{' '}
        {mode === 0 && <span className="hl-en animate-word-swap inline-block font-semibold">preserve</span>}
        {mode === 1 && <span className="hl-vi animate-word-swap inline-block">bảo tồn</span>}
        {mode === 2 && (
          <span className="hl-en animate-word-swap inline-block font-semibold">bảo tồn (preserve)</span>
        )}{' '}
        khu phố cổ…
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1">
        {MODES.map((m, i) => (
          <span
            key={m}
            className={`rounded-[4px] border py-1 text-center text-[10px] font-bold transition-colors duration-300 ${
              mode === i
                ? 'border-[#f4be37] bg-[#f4be37] text-[#020c1b]'
                : 'border-navy-200/70 bg-white/70 text-navy-500'
            }`}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  )
}

/** "Save to deck" card: a tiny flashcard flipping on loop. */
function FlashMicroDemo() {
  const side = useCycle(2, 2600)

  return (
    <div className="mt-5 flex justify-center rounded-xl bg-cream-50 p-4 ring-1 ring-navy-200/50" aria-hidden="true">
      <div className="w-40 [perspective:700px]">
        <div
          className="relative h-20 w-full transition-transform duration-500 [transform-style:preserve-3d]"
          style={{ transform: side === 1 ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-[#112240] ring-1 ring-navy-600/60 [backface-visibility:hidden]">
            <span className="text-sm font-extrabold text-cream-50">solitude</span>
            <span className="mt-0.5 text-[9px] text-navy-300 italic">noun</span>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-[#112240] px-3 ring-1 ring-gold-400/50 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="text-[12px] font-extrabold text-gold-300">sự cô đơn</span>
            <span className="mt-0.5 text-center text-[8.5px] leading-snug text-navy-200">
              the state of being alone
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

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
                {/* Two cards demo themselves: display modes + the deck flashcard. */}
                {i === 0 && <ModesMicroDemo />}
                {i === 3 && <FlashMicroDemo />}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
