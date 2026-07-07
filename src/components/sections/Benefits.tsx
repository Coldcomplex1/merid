import Reveal from '../ui/Reveal'

export default function Benefits() {
  return (
    <section className="bg-cream-50 py-24 text-navy-900">
      <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
        <Reveal>
          <h2 className="text-3xl leading-snug font-extrabold tracking-tight text-balance sm:text-5xl">
            No flashcards first.
            <br />
            No boring word lists.
          </h2>
        </Reveal>

        <Reveal delay={150}>
          <p className="mx-auto mt-8 max-w-2xl text-2xl leading-snug font-bold text-balance sm:text-3xl">
            Your normal{' '}
            <span className="rounded-md bg-gold-300 px-2 py-0.5 whitespace-nowrap">reading</span> becomes
            the{' '}
            <span className="rounded-md bg-gold-300 px-2 py-0.5 whitespace-nowrap">lesson</span>.
          </p>
        </Reveal>

        <Reveal delay={280}>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-navy-600">
            Built for Vietnamese learners aiming for <strong className="text-navy-900">SAT</strong>,{' '}
            <strong className="text-navy-900">IELTS</strong>,{' '}
            <strong className="text-navy-900">advanced English</strong>, and{' '}
            <strong className="text-navy-900">academic vocabulary</strong>, one page at a time.
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
