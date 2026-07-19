import { useState, type CSSProperties } from 'react'
import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'

// Deliberately conservative estimates: browsing is skimming as much as
// reading, most encounters repeat words already met, and later weeks repeat
// earlier ones. Better to undersell than to promise inflated numbers.
const INTENSITIES = [
  { label: 'Casual', rate: 0.006 },
  { label: 'Focused', rate: 0.013 },
  { label: 'Locked-in', rate: 0.022 },
]
const WORDS_PER_MINUTE = 140 // effective reading pace while browsing
const UNIQUE_SHARE = 0.08 // share of encounters that are new headwords
const MONTH_FACTOR = 3.2 // < 4.3 weeks: later weeks re-meet earlier words

/** "Your browsing → vocabulary" calculator: drag your daily minutes and see
 *  the passive-learning claim as your own numbers. Estimates derive from the
 *  extension's replacement density, not marketing invention. */
function ExposureCalculator() {
  const { t } = useLang()
  const s = t.benefits.calc
  const [minutes, setMinutes] = useState(30)
  const [intensity, setIntensity] = useState(1)

  const perDay = Math.round((minutes * WORDS_PER_MINUTE * INTENSITIES[intensity].rate) / 5) * 5
  const perWeek = Math.round((perDay * UNIQUE_SHARE * 7) / 5) * 5
  const perMonth = Math.round((perWeek * MONTH_FACTOR) / 10) * 10

  return (
    <div className="mx-auto mt-12 max-w-2xl rounded-3xl border-2 border-navy-700 bg-cream-100 p-6 text-left sm:p-8">
      <h3 className="text-center text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">
        {s.title}
      </h3>

      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-navy-700">{s.minutesLabel}</span>
          <span className="text-lg font-extrabold text-navy-900">{s.minutesValue(minutes)}</span>
        </div>
        <input
          type="range"
          min={10}
          max={120}
          step={5}
          value={minutes}
          aria-label={s.minutesLabel}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="slider-gold mt-3"
          style={{ '--slider-fill': `${((minutes - 10) / 110) * 100}%` } as CSSProperties}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-navy-700">{s.intensityLabel}:</span>
        {INTENSITIES.map((opt, i) => (
          <button
            key={opt.label}
            type="button"
            aria-pressed={intensity === i}
            onClick={() => setIntensity(i)}
            className={`cursor-pointer rounded-full border-2 px-3.5 py-1 text-xs font-bold transition-all active:scale-95 ${
              intensity === i
                ? 'border-navy-800 bg-gold-300 text-navy-900'
                : 'border-navy-300 bg-white/60 text-navy-600 hover:border-navy-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[s.perDay(perDay), s.perWeek(perWeek), s.perMonth(perMonth)].map((line) => (
          <p
            key={line}
            className="rounded-2xl bg-white/70 px-4 py-3 text-center text-sm leading-snug font-extrabold text-navy-900"
          >
            {line}
          </p>
        ))}
      </div>

      <p className="mt-4 text-center text-xs leading-relaxed text-navy-600">{s.note}</p>
    </div>
  )
}

export default function Benefits() {
  const { t } = useLang()

  return (
    <section className="border-y border-line bg-band py-24 text-navy-900">
      <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
        <Reveal>
          <h2 className="text-3xl leading-snug font-extrabold tracking-tight text-balance sm:text-5xl">
            {t.benefits.title1}
            <br />
            {t.benefits.title2}
          </h2>
        </Reveal>

        <Reveal delay={150}>
          <p className="mx-auto mt-8 max-w-2xl text-2xl leading-snug font-bold text-balance sm:text-3xl">
            {t.benefits.lead.map((seg, i) =>
              seg.mark ? (
                <span key={i} className="rounded-md bg-gold-300 px-2 py-0.5 whitespace-nowrap">
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </p>
        </Reveal>

        <Reveal delay={280}>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-navy-600">
            {t.benefits.support.map((seg, i) =>
              seg.strong ? (
                <strong key={i} className="text-navy-900">
                  {seg.text}
                </strong>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </p>
        </Reveal>

        <Reveal delay={380}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5 text-sm font-bold">
            {['SAT 1400+', 'IELTS 7.0+', 'CEFR B2-C2', 'Academic writing'].map((tag) => (
              <span
                key={tag}
                className="rounded-full border-2 border-navy-700 bg-cream-100 px-4 py-1.5 text-navy-800 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={460}>
          <ExposureCalculator />
        </Reveal>
      </div>
    </section>
  )
}
