import SectionHeading from '../ui/SectionHeading'
import Reveal from '../ui/Reveal'

const STEPS = [
  {
    number: '01',
    title: 'Browse normally',
    body: 'Read Vietnamese websites like you always do — Wikipedia, news, blogs, and school materials. Nothing about your routine changes.',
  },
  {
    number: '02',
    title: 'Contextual highlights useful words',
    body: 'The extension picks words from your selected vocabulary dataset and highlights or replaces them right inside the page.',
  },
  {
    number: '03',
    title: 'Learn without breaking flow',
    body: 'Hover to see meanings, save words to your deck, or mark them as mastered. Then just keep reading.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-navy-950/60 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="Three steps. Zero new habits."
          />
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.number} delay={i * 120}>
              <div className="group relative h-full rounded-2xl bg-navy-850 p-7 ring-1 ring-navy-600/40 transition-all duration-300 hover:-translate-y-1.5 hover:ring-gold-400/50">
                <span className="text-5xl font-extrabold text-gold-400/25 transition-colors duration-300 group-hover:text-gold-400/60">
                  {step.number}
                </span>
                <h3 className="mt-3 text-xl font-bold text-cream-50">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-navy-200">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
