import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import InstallButton from '../components/ui/InstallButton'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey'

/* ── Local building blocks ───────────────────────────────────── */

function StepCard({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <Reveal>
      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
        <div className="flex items-baseline gap-4">
          <span className="text-4xl font-extrabold text-accent/40 sm:text-5xl">{number}</span>
          <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">{title}</h2>
        </div>
        <div className="mt-5 space-y-5 text-[15px] leading-relaxed text-body">{children}</div>
      </section>
    </Reveal>
  )
}

function Bullet({ term, children }: { term?: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
      <span>
        {term && <span className="font-bold text-heading">{term}</span>} {children}
      </span>
    </li>
  )
}

function NumberedSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 marker:font-bold marker:text-accent">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

export default function ApiKeyGuide() {
  const { t } = useLang()
  const s = t.apiKeyGuide
  usePageTitle(t.meta.apiKeyGuideTitle)

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 50% 0%, rgb(245 197 66 / 0.08), transparent 62%)',
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

        <div className="mt-16 space-y-8">
          {/* Why bother */}
          <Reveal>
            <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
              <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                {s.whatTitle}
              </h2>
              <div className="mt-5 space-y-5 text-[15px] leading-relaxed text-body">
                <p>{s.whatIntro}</p>
                <ul className="space-y-3">
                  {s.whatBullets.map((bullet) => (
                    <Bullet key={bullet.term} term={bullet.term}>
                      {bullet.text}
                    </Bullet>
                  ))}
                </ul>
              </div>
            </section>
          </Reveal>

          {/* Step 1: create the key */}
          <StepCard number="01" title={s.getTitle}>
            <p>{s.getIntro}</p>
            <NumberedSteps steps={s.getSteps} />
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={AI_STUDIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border-2 border-line-strong px-5 py-2.5 text-sm font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
              >
                {s.getCta} ↗
              </a>
            </div>
            <p className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
              🔑 {s.getNote}
            </p>
          </StepCard>

          {/* Step 2: open Merid's AI settings */}
          <StepCard number="02" title={s.openTitle}>
            <p>{s.openIntro}</p>
            <NumberedSteps steps={s.openSteps} />
          </StepCard>

          {/* Step 3: paste, save, enable */}
          <StepCard number="03" title={s.pasteTitle}>
            <p>{s.pasteIntro}</p>
            <NumberedSteps steps={s.pasteSteps} />
            <p className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
              ✓ {s.pasteNote}
            </p>
          </StepCard>

          {/* Privacy + troubleshooting */}
          <Reveal>
            <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
              <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                {s.privacyTitle}
              </h2>
              <ul className="mt-5 space-y-3 text-[15px] leading-relaxed text-body">
                {s.privacyBullets.map((bullet) => (
                  <Bullet key={bullet}>{bullet}</Bullet>
                ))}
              </ul>

              <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                {s.troubleTitle}
              </h2>
              <ul className="mt-5 space-y-3 text-[15px] leading-relaxed text-body">
                {s.troubles.map((item) => (
                  <Bullet key={item.term} term={item.term}>
                    {item.text}
                  </Bullet>
                ))}
              </ul>
            </section>
          </Reveal>
        </div>

        {/* Outro CTA */}
        <Reveal>
          <div className="mt-20 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance text-heading sm:text-4xl">
              {s.outroTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">{s.outroSub}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <InstallButton label={s.ctaInstall} variant="primary" />
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
