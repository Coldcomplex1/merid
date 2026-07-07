import SectionHeading from '../ui/SectionHeading'
import Reveal from '../ui/Reveal'

const FEATURES = [
  {
    icon: '🎯',
    title: 'Contextual replacement',
    body: 'Contextual reads the page the way you do and only swaps words that carry real meaning in that sentence — no random noise, no broken grammar.',
  },
  {
    icon: '📚',
    title: 'Multiple vocab datasets',
    body: 'SAT, B2, C1, and C2 today — themed and custom datasets are on the roadmap. Pick your goal, and Contextual picks the words worth learning.',
  },
  {
    icon: '🎚️',
    title: 'Adjustable frequency',
    body: 'Casual, Focused, or Locked-in. You decide how intense each page gets — from a gentle drip of new words to full immersion.',
  },
  {
    icon: '🗂️',
    title: 'Save words to deck',
    body: 'One tap on “Save to Deck” keeps any word for later. Review your personal deck whenever you have five spare minutes.',
  },
  {
    icon: '✅',
    title: '“I know this”',
    body: 'Mark a word as mastered and it stops appearing everywhere. Contextual only spends your attention on words you haven’t learned yet.',
  },
  {
    icon: '🔁',
    title: 'Vie → Eng and Eng → Eng modes',
    body: 'Start by mapping Vietnamese to English. When you’re ready, switch to English-only explanations and think in English directly.',
  },
]

export default function Features() {
  return (
    <section id="features" className="scroll-mt-16 bg-navy-950/60 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Features"
            title="Small extension. Serious vocabulary engine."
            sub="Everything is built around one idea: you keep reading what you already read, and the words come to you."
          />
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 70}>
              <div className="group h-full rounded-2xl bg-navy-850 p-6 ring-1 ring-navy-600/40 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift hover:ring-gold-400/50">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-navy-700 text-xl transition-transform duration-300 group-hover:scale-110 group-hover:bg-gold-400/20">
                  {feature.icon}
                </span>
                <h3 className="mt-4 text-lg font-bold text-cream-50">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-200">{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
