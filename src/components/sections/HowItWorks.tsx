import SectionHeading from '../ui/SectionHeading'
import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'

const STEP_NUMBERS = ['01', '02', '03']

export default function HowItWorks() {
  const { t } = useLang()

  return (
    <section id="how-it-works" className="scroll-mt-16 bg-canvas-2 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading eyebrow={t.how.eyebrow} title={t.how.title} />
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {t.how.steps.map((step, i) => (
            <Reveal key={STEP_NUMBERS[i]} delay={i * 120}>
              <div className="group relative h-full rounded-2xl bg-surface p-7 ring-1 ring-line transition-all duration-300 hover:-translate-y-1.5 hover:ring-gold-400/50">
                <span className="text-5xl font-extrabold text-accent/30 transition-colors duration-300 group-hover:text-accent/70">
                  {STEP_NUMBERS[i]}
                </span>
                <h3 className="mt-3 text-xl font-bold text-heading">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-body">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
