import type { ReactNode } from 'react'
import SectionHeading from '../ui/SectionHeading'
import Reveal from '../ui/Reveal'

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

const FEATURES = [
  {
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.5" fill="currentColor" />
      </Icon>
    ),
    title: 'Context-aware replacement',
    body: 'Merid reads the page the way you do and only swaps words that carry real meaning in that sentence. No random noise, no broken grammar.',
  },
  {
    icon: (
      <Icon>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </Icon>
    ),
    title: 'Multiple vocab datasets',
    body: 'SAT, B2, C1, and C2 today, with themed and custom datasets on the roadmap. Pick your goal, and Merid picks the words worth learning.',
  },
  {
    icon: (
      <Icon>
        <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
        <circle cx="16" cy="8" r="2.2" />
        <circle cx="8" cy="16" r="2.2" />
      </Icon>
    ),
    title: 'Adjustable frequency',
    body: 'Casual, Focused, or Locked-in. You decide how intense each page gets, from a gentle drip of new words to full immersion.',
  },
  {
    icon: (
      <Icon>
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
      </Icon>
    ),
    title: 'Save words to deck',
    body: 'One tap on "Save to Deck" keeps any word for later. Review your personal deck whenever you have five spare minutes.',
  },
  {
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
      </Icon>
    ),
    title: '"I know this"',
    body: 'Mark a word as mastered and it stops appearing everywhere. Merid only spends your attention on words you have not learned yet.',
  },
  {
    icon: (
      <Icon>
        <path d="M7 8h10M14 5l3 3-3 3" />
        <path d="M17 16H7M10 13l-3 3 3 3" />
      </Icon>
    ),
    title: 'Vie-Eng and Eng-Eng modes',
    body: 'Start by mapping Vietnamese to English. When you are ready, switch to English-only explanations and think in English directly.',
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
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-navy-700 text-gold-300 transition-all duration-300 group-hover:scale-110 group-hover:bg-gold-400/20">
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
