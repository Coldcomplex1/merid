import SectionHeading from '../ui/SectionHeading'
import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'

const STEP_NUMBERS = ['01', '02', '03']

/* ── Micro-demos: each card shows its step happening, on loop ── */

/** Step 1: a toolbar where the gold M gets "clicked" and the panel pops. */
function ToolbarMicroDemo() {
  return (
    <div className="relative mt-5 h-24 overflow-hidden rounded-xl bg-cream-100 ring-1 ring-navy-200/50" aria-hidden="true">
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <span className="h-2 w-2 rounded-full bg-[#f26d5f]" />
        <span className="h-2 w-2 rounded-full bg-[#f5c14e]" />
        <span className="h-2 w-2 rounded-full bg-[#5ec269]" />
        <div className="ml-1.5 h-5 flex-1 rounded-full bg-white/85 px-2.5 text-[9px] leading-5 text-navy-500">
          vnexpress.net
        </div>
        <span className="animate-micro-click flex h-6 w-6 items-center justify-center rounded-md bg-gold-400 text-[11px] font-extrabold text-navy-900">
          M
        </span>
      </div>
      {/* Panel stub that pops right after the "click" */}
      <div className="animate-micro-pop absolute top-10 right-3 w-32 rounded-lg bg-[#0a192f] p-2 shadow-pop ring-1 ring-navy-600/70">
        <div className="h-1.5 w-14 rounded bg-gold-400/90" />
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          {['SAT', 'C1', 'C2', 'All'].map((d, i) => (
            <span
              key={d}
              className={`rounded-[3px] py-0.5 text-center text-[7px] font-bold ${
                i === 0 ? 'bg-gold-400 text-navy-900' : 'bg-navy-700 text-navy-200'
              }`}
            >
              {d}
            </span>
          ))}
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-navy-700">
          <div className="h-full w-2/3 rounded-full bg-gold-400" />
        </div>
      </div>
    </div>
  )
}

/** Step 2: a Vietnamese word morphing into its English replacement. */
function MorphMicroDemo() {
  return (
    <div className="mt-5 flex h-24 items-center justify-center rounded-xl bg-cream-50 px-4 ring-1 ring-navy-200/50" aria-hidden="true">
      <p className="font-wiki text-[15px] leading-relaxed text-ink" lang="vi">
        …được công nhận là{' '}
        {/* Both states share one grid cell, so the slot is as wide as the
            longer word and the surrounding text never shifts or overlaps. */}
        <span className="inline-grid align-baseline font-semibold whitespace-nowrap">
          <span className="animate-micro-swap-a hl-vi col-start-1 row-start-1 justify-self-center">
            di sản
          </span>
          <span className="animate-micro-swap-b hl-en col-start-1 row-start-1 justify-self-center">
            heritage
          </span>
        </span>{' '}
        thế giới…
      </p>
    </div>
  )
}

/** Step 3: the learning card popping over a highlighted word. */
function CardMicroDemo() {
  return (
    <div className="relative mt-5 h-24 overflow-hidden rounded-xl bg-cream-50 px-4 ring-1 ring-navy-200/50" aria-hidden="true">
      <p className="mt-14 font-wiki text-[15px] text-ink" lang="vi">
        …chính quyền sẽ <span className="hl-en font-semibold">preserve</span> khu phố cổ…
      </p>
      {/* Mini learning-card skeleton */}
      <div className="animate-micro-pop absolute top-2 left-1/2 w-40 -translate-x-1/2 rounded-lg border-2 border-[#19355d] bg-[#fffdf6] p-2 shadow-pop">
        <div className="text-[9px] font-extrabold tracking-wide text-[#19355d]">PRESERVE</div>
        <div className="mt-1 h-1 w-24 rounded bg-[#19355d]/25" />
        <div className="mt-1 h-1 w-28 rounded bg-[#19355d]/15" />
        <div className="mt-1.5 flex gap-1">
          <span className="h-2.5 flex-1 rounded-sm bg-[#f3c94b]" />
          <span className="h-2.5 flex-1 rounded-sm bg-[#e9eef8]" />
        </div>
      </div>
    </div>
  )
}

const MICRO_DEMOS = [ToolbarMicroDemo, MorphMicroDemo, CardMicroDemo]

export default function HowItWorks() {
  const { t } = useLang()

  return (
    <section id="how-it-works" className="scroll-mt-16 bg-canvas-2 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading eyebrow={t.how.eyebrow} title={t.how.title} />
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {t.how.steps.map((step, i) => {
            const MicroDemo = MICRO_DEMOS[i]
            return (
              <Reveal key={STEP_NUMBERS[i]} delay={i * 120}>
                <div className="group relative h-full rounded-2xl bg-surface p-7 ring-1 ring-line transition-all duration-300 hover:-translate-y-1.5 hover:ring-gold-400/50">
                  <span className="text-5xl font-extrabold text-accent/30 transition-colors duration-300 group-hover:text-accent/70">
                    {STEP_NUMBERS[i]}
                  </span>
                  <h3 className="mt-3 text-xl font-bold text-heading">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-body">{step.body}</p>
                  {MicroDemo && <MicroDemo />}
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
