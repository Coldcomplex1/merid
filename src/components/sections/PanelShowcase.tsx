import ExtensionPanel from '../ui/ExtensionPanel'
import Reveal from '../ui/Reveal'

const CONTROL_NOTES = [
  ['Weekly progress', 'A tiny chart tracks the words you mastered each day — streaks feel good.'],
  ['Dataset switch', 'Jump between SAT, C1, C2, or everything at once, per browsing session.'],
  ['Frequency slider', 'Casual for chill reading days, Locked-in for exam season.'],
  ['Learning modes', 'Replace words directly, or keep Vietnamese and learn on hover.'],
]

export default function PanelShowcase() {
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
            <p className="text-xs font-extrabold tracking-[0.22em] text-gold-400 uppercase">
              The extension panel
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              Your whole learning setup, one click away.
            </h2>
            <p className="mt-4 text-lg text-navy-200">
              Open the panel from your browser toolbar and tune how Contextual behaves on every site.
              No account dashboards, no settings pages buried three levels deep.
            </p>

            <ul className="mt-8 space-y-4">
              {CONTROL_NOTES.map(([title, body]) => (
                <li key={title} className="flex gap-3.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gold-400 shadow-[0_0_12px_rgb(245_197_66/0.8)]" />
                  <p className="text-sm leading-relaxed text-navy-200">
                    <span className="font-bold text-cream-50">{title}.</span> {body}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-8 inline-block rounded-full border border-gold-400/40 bg-navy-850 px-4 py-2 text-xs font-bold text-gold-300">
              👇 This is a live mockup — click around
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
