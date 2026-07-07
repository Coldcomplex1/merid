import BrowserMockup from '../ui/BrowserMockup'

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Warm glow behind the mockup */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 78% 32%, rgb(245 197 66 / 0.10), transparent 62%), radial-gradient(520px circle at 8% 85%, rgb(47 111 206 / 0.10), transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pt-16 pb-28 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-36">
        <div className="animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-navy-600 bg-navy-850 px-3.5 py-1.5 text-xs font-bold text-navy-200">
            <span aria-hidden="true">🇻🇳</span> Vietnamese
            <span className="text-gold-400" aria-hidden="true">→</span>
            <span aria-hidden="true">🇬🇧</span> English · Chrome extension
          </p>

          <h1 className="mt-6 text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
            Learn <span className="text-gold-400">English</span> while browsing Vietnamese websites.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
            Contextual replaces selected Vietnamese words with high-value English vocabulary, so every
            article, blog, and post becomes a natural vocab lesson.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#demo"
              className="rounded-full bg-gold-400 px-7 py-3.5 text-base font-bold text-navy-900 transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95"
            >
              Try the Demo
            </a>
            <a
              href="#waitlist"
              className="rounded-full border-2 border-navy-500 px-7 py-3 text-base font-bold text-cream-50 transition-all hover:-translate-y-0.5 hover:border-gold-400 hover:text-gold-300 active:scale-95"
            >
              Join the Waitlist
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2 text-xs font-bold">
            {['SAT', 'B2', 'C1', 'C2'].map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-navy-600 bg-navy-850 px-2.5 py-1 text-navy-200 transition-colors hover:border-gold-400/60 hover:text-gold-300"
              >
                {tag}
              </span>
            ))}
            <span className="ml-1 text-navy-300">Context-aware learning · Free during beta</span>
          </div>
        </div>

        <div className="animate-fade-up mx-auto w-full max-w-lg pb-16 lg:pb-8" style={{ animationDelay: '0.15s' }}>
          <BrowserMockup />
        </div>
      </div>
    </section>
  )
}
