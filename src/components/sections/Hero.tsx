import BrowserMockup from '../ui/BrowserMockup'
import InstallButton from '../ui/InstallButton'
import { useLang } from '../../i18n/LanguageContext'

export default function Hero() {
  const { t } = useLang()

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
          <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">
            {t.hero.eyebrow}
          </p>

          <h1 className="mt-6 text-4xl leading-[1.08] font-extrabold tracking-tight text-balance text-heading sm:text-5xl lg:text-[3.4rem]">
            {t.hero.title1}
            <span className="text-accent">{t.hero.titleAccent}</span>
            {t.hero.title2}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-body">{t.hero.sub}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <InstallButton label={t.hero.ctaInstall} variant="primary" />
            <a
              href="#demo"
              className="rounded-full border-2 border-line-strong px-7 py-3 text-base font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
            >
              {t.hero.ctaDemo}
            </a>
          </div>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted">{t.hero.privacy}</p>

          <div className="mt-7 flex flex-wrap items-center gap-2 text-xs font-bold">
            {['SAT', 'B2', 'C1', 'C2'].map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-body transition-colors hover:border-accent hover:text-accent"
              >
                {tag}
              </span>
            ))}
            <span className="ml-1 text-muted">{t.hero.tagNote}</span>
          </div>
        </div>

        <div className="animate-fade-up mx-auto w-full max-w-lg pb-16 lg:pb-8" style={{ animationDelay: '0.15s' }}>
          <BrowserMockup />
        </div>
      </div>
    </section>
  )
}
