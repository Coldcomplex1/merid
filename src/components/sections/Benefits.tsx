import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'

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
      </div>
    </section>
  )
}
