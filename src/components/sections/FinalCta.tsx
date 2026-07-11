import Reveal from '../ui/Reveal'
import InstallButton from '../ui/InstallButton'
import { useLang } from '../../i18n/LanguageContext'

/** Closing call-to-action: the extension is live, so this drives installs from
 *  the Chrome Web Store (with the demo as a low-commitment secondary action). */
export default function FinalCta() {
  const { t } = useLang()

  return (
    <section id="get-merid" className="relative scroll-mt-16 overflow-hidden py-28">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(700px circle at 50% 20%, rgb(245 197 66 / 0.13), transparent 65%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-balance text-heading sm:text-5xl">
            {t.finalCta.title1}
            <span className="text-accent">{t.finalCta.titleAccent}</span>
            {t.finalCta.title2}
          </h2>
        </Reveal>

        <Reveal delay={120}>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-body">
            {t.finalCta.description}
          </p>
        </Reveal>

        <Reveal delay={200}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <InstallButton label={t.finalCta.ctaInstall} variant="primary" />
            <a
              href="#demo"
              className="rounded-full border-2 border-line-strong px-7 py-3 text-base font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
            >
              {t.finalCta.ctaDemo}
            </a>
          </div>
        </Reveal>

        <Reveal delay={280}>
          <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed text-muted">{t.finalCta.privacy}</p>
        </Reveal>
      </div>
    </section>
  )
}
