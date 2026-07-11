import ExtensionPanel from '../ui/ExtensionPanel'
import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'

export default function PanelShowcase() {
  const { t } = useLang()

  return (
    <section className="relative overflow-hidden py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(560px circle at 82% 50%, rgb(245 197 66 / 0.09), transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
        <Reveal>
          <div>
            <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">
              {t.panel.eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance text-heading sm:text-4xl">
              {t.panel.title}
            </h2>
            <p className="mt-4 text-lg text-body">{t.panel.body}</p>

            <ul className="mt-8 space-y-4">
              {t.panel.notes.map((note) => (
                <li key={note.term} className="flex gap-3.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gold-400 shadow-[0_0_12px_rgb(245_197_66/0.8)]" />
                  <p className="text-sm leading-relaxed text-body">
                    <span className="font-bold text-heading">{note.term}</span> {note.body}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-8 inline-block rounded-full border border-gold-400/40 bg-surface px-4 py-2 text-xs font-bold text-accent">
              {t.panel.mockupNote}
            </p>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <div className="flex justify-center">
            <ExtensionPanel />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
