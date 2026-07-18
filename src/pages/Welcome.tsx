import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

/** Vietnamese news sites suggested for the very first try. Plain external
 *  links - no tracking, no affiliation. */
const TRY_SITES = [
  { label: 'vnexpress.net', href: 'https://vnexpress.net' },
  { label: 'tuoitre.vn', href: 'https://tuoitre.vn' },
  { label: 'dantri.com.vn', href: 'https://dantri.com.vn' },
]

/**
 * /welcome - opened by the extension exactly once, right after install
 * (chrome.runtime.onInstalled -> webWelcomeUrl). Job: get the user to one
 * successful replacement as fast as possible - pin, configure, read.
 */
export default function Welcome() {
  const { t } = useLang()
  const s = t.welcome
  usePageTitle(t.meta.welcomeTitle)

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 50% 0%, rgb(245 197 66 / 0.10), transparent 62%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-5 py-20 sm:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">{s.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance text-heading sm:text-5xl">
            {s.title}
          </h1>
          <p className="mt-4 text-lg text-body">{s.sub}</p>
        </div>

        {/* The three steps */}
        <div className="mt-16 space-y-8">
          {s.steps.map((step, i) => (
            <Reveal key={step.title}>
              <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
                <div className="flex items-baseline gap-4">
                  <span className="text-4xl font-extrabold text-accent/40 sm:text-5xl">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                    {step.title}
                  </h2>
                </div>
                <div className="mt-5 space-y-5 text-[15px] leading-relaxed text-body">
                  <p>{step.body}</p>
                  {i === s.steps.length - 1 && (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-bold text-heading">{s.trySitesLabel}</span>
                      {TRY_SITES.map((site) => (
                        <a
                          key={site.label}
                          href={site.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border-2 border-line-strong px-4 py-1.5 text-sm font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
                        >
                          {site.label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </Reveal>
          ))}

          {/* Optional extras */}
          <Reveal>
            <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
              <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                {s.extrasTitle}
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {s.extras.map((extra) => (
                  <div
                    key={extra.term}
                    className="flex flex-col rounded-2xl border border-line p-5"
                  >
                    <h3 className="font-extrabold text-heading">{extra.term}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-body">{extra.text}</p>
                    <Link
                      to={extra.to}
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:underline"
                    >
                      {extra.cta} →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        </div>

        {/* Per-site tip + CTAs */}
        <Reveal>
          <div className="mt-20 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance text-heading sm:text-4xl">
              {s.outroTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">{s.outroSub}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/#demo"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-base font-bold text-navy-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95"
              >
                {s.ctaDemo}
              </Link>
              <Link
                to="/tutorial"
                className="rounded-full border-2 border-line-strong px-7 py-3 text-base font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
              >
                {s.ctaTutorial}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
