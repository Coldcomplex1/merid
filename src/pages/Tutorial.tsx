import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import InstallButton from '../components/ui/InstallButton'
import PracticeArticle from '../components/demo/PracticeArticle'
import DemoGuideCursor, { type GuideCursorHandle } from '../components/demo/DemoGuideCursor'
import { PANEL_DATASETS, type PanelDataset, type PanelMode } from '../components/demo/DemoExtensionPanel'
import type { VocabEntry } from '../data/vocab'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

const INTENSITY_LABELS = ['Casual', 'Focused', 'Locked-in']
const MODES: { value: PanelMode; label: string }[] = [
  { value: 'replace', label: 'Replace' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'beside', label: 'Beside' },
]

/* ── Scroll-driven active step ───────────────────────────────── */

/** Which step block currently sits closest to the reader's focus line. */
function useActiveStep(count: number) {
  const refs = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const focusLine = window.innerHeight * 0.42
      let best = 0
      let bestDist = Infinity
      refs.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const center = r.top + r.height / 2
        const dist = Math.abs(center - focusLine)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      })
      setActive(best)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [count])

  const setRef = (i: number) => (el: HTMLElement | null) => {
    refs.current[i] = el
  }
  return { active, setRef }
}

/* ── Step narration card ─────────────────────────────────────── */

function Bullet({ term, children }: { term: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
      <span>
        <span className="font-bold text-heading">{term}</span> {children}
      </span>
    </li>
  )
}

/* ── Mini deck (finale inside the browser) ───────────────────── */

function MiniDeck({ saved }: { saved: VocabEntry[] }) {
  const { t } = useLang()
  const s = t.tutorial.scrolly
  const [flipped, setFlipped] = useState(false)
  const card = saved[0]

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#0a192f] px-5 py-8 text-center">
      <p className="text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">My Deck</p>
      <h3 className="mt-2 text-xl font-extrabold text-cream-50">
        {saved.length > 0 ? s.finaleTitleSaved(saved.length) : s.finaleTitleNone}
      </h3>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-navy-200">
        {saved.length > 0 ? s.finaleBodySaved : s.finaleBodyNone}
      </p>

      {card && (
        <div className="mt-6 w-full max-w-[270px] [perspective:1000px]">
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={t.deck.flash.flipHint}
            className="relative block h-44 w-full cursor-pointer transition-transform duration-500 [transform-style:preserve-3d]"
            style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-[#112240] ring-1 ring-navy-600/60 [backface-visibility:hidden]">
              <span className="text-2xl font-extrabold text-cream-50">{card.word}</span>
              <span className="text-xs text-navy-300 italic">{card.pos}</span>
              <span className="mt-3 text-[10px] text-navy-300/70">{t.deck.flash.flipHint}</span>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#112240] px-4 ring-1 ring-gold-400/50 [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <span className="text-lg font-extrabold text-gold-300">{card.viMeaning}</span>
              <span className="text-[12px] leading-snug text-navy-200">{card.definition}</span>
            </div>
          </button>
        </div>
      )}

      {saved.length > 1 && (
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {saved.slice(1, 6).map((w) => (
            <span key={w.id} className="rounded-full bg-[#112240] px-3 py-1 text-[11px] font-bold text-cream-50 ring-1 ring-navy-600/60">
              {w.word}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Weekly progress chart (kept from the old page, step 7's visual) ── */

function ProgressChart() {
  const { t } = useLang()
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const BARS = [3, 5, 2, 6, 4, 1, 2]
  const max = Math.max(...BARS)

  return (
    <div className="mt-5 w-full max-w-xs rounded-2xl bg-navy-850 p-5 shadow-panel ring-1 ring-navy-600/50">
      <p className="text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">
        {t.tutorial.progressLabel}
      </p>
      <div className="mt-4 flex items-end justify-between border-b border-gold-400/60 pb-2">
        {DAYS.map((day, i) => (
          <div key={day} className="group flex w-8 flex-col items-center gap-1.5">
            <span className="text-[9px] font-bold text-gold-300">{BARS[i]}</span>
            <div className="flex h-14 items-end">
              <div
                className="w-2 origin-bottom animate-bar-grow rounded-full bg-gold-400 transition-colors group-hover:bg-gold-300"
                style={{ height: `${(BARS[i] / max) * 100}%`, animationDelay: `${i * 90}ms` }}
              />
            </div>
            <span className="text-[10px] font-semibold tracking-wide text-navy-200">{day}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-navy-200">
        <span className="font-bold text-gold-300">
          {BARS.reduce((a, b) => a + b, 0)} {t.tutorial.progressUnit}
        </span>{' '}
        {t.tutorial.progressTail}
      </p>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

/**
 * The tutorial as a scrollytelling playground: one persistent mini-browser
 * (sticky beside the steps) that every step manipulates. The dataset buttons,
 * intensity slider and display-mode switch in the narration are the real
 * controls of the article on the right; the hover step plays a short guided
 * tour; words the reader saves accumulate into the finale's mini deck.
 */
export default function Tutorial() {
  const { t } = useLang()
  usePageTitle(t.meta.tutorialTitle)
  const steps = t.tutorial.steps
  const s = t.tutorial.scrolly

  // Shared extension state, exactly like the homepage demo.
  const [dataset, setDataset] = useState<PanelDataset>('All')
  const [intensity, setIntensity] = useState(2) // 1 = Casual · 2 = Focused · 3 = Locked-in
  const [mode, setMode] = useState<PanelMode>('replace')
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [savedEntries, setSavedEntries] = useState<VocabEntry[]>([])
  const [yourTurn, setYourTurn] = useState(false)

  const { active, setRef } = useActiveStep(steps.length)

  const browserBoxRef = useRef<HTMLDivElement | null>(null)
  const guideRef = useRef<GuideCursorHandle | null>(null)
  const tourPlayed = useRef(false)

  const handleSave = (entry: VocabEntry) => {
    setSavedIds((prev) => new Set(prev).add(entry.id))
    setSavedEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]))
  }
  const handleKnow = (entry: VocabEntry) => {
    setKnownIds((prev) => new Set(prev).add(entry.id))
  }

  // The hover step (index 4): the Merid cursor glides onto a gold word and
  // opens its card once, then invites the reader to take over.
  useEffect(() => {
    if (active !== 4 || tourPlayed.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const box = browserBoxRef.current
    const guide = guideRef.current
    if (!box || !guide) return

    tourPlayed.current = true
    let cancelled = false
    let rafId = 0
    let timer: number | null = null
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms)
      })

    const run = async () => {
      await sleep(350)
      if (cancelled) return
      const word = box.querySelector<HTMLElement>('[data-vocab-word]')
      if (!word) return

      const center = () => {
        const r = word.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }
      let cur = { x: center().x, y: center().y - 46 }
      guide.snapTo(cur.x, cur.y)
      guide.show()

      const follow = () => {
        if (cancelled) return
        const c = center()
        cur = { x: cur.x + (c.x - cur.x) * 0.16, y: cur.y + (c.y - cur.y) * 0.16 }
        guide.snapTo(cur.x, cur.y)
        rafId = requestAnimationFrame(follow)
      }
      rafId = requestAnimationFrame(follow)

      await sleep(850)
      if (cancelled) return
      word.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await sleep(1900)
      if (cancelled) return
      guide.hide()
      await sleep(300)
      if (cancelled) return
      setYourTurn(true)
      window.setTimeout(() => setYourTurn(false), 8000)
    }
    void run()

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      if (rafId) cancelAnimationFrame(rafId)
      guide.hide()
    }
  }, [active])

  /* Small, reusable control styles (mirroring the extension panel) */
  const pill = (isActive: boolean) =>
    `cursor-pointer rounded-[6px] border py-2 text-center text-[13px] font-semibold transition-all duration-200 active:scale-95 ${
      isActive
        ? 'border-gold-400 bg-gold-400 text-navy-900'
        : 'border-line-strong bg-surface text-body hover:border-gold-400 hover:text-heading'
    }`

  /** Interactive controls embedded in specific narration steps. */
  const stepControls: (ReactNode | null)[] = [
    null,
    // Step 2 · dataset
    <div key="dataset" className="mt-5 grid max-w-sm grid-cols-4 gap-1.5">
      {PANEL_DATASETS.map((d) => (
        <button key={d} type="button" aria-pressed={dataset === d} onClick={() => setDataset(d)} className={pill(dataset === d)}>
          {d}
        </button>
      ))}
    </div>,
    // Step 3 · intensity
    <div key="intensity" className="mt-5 max-w-sm">
      <input
        type="range"
        min={1}
        max={3}
        step={1}
        value={intensity}
        aria-label={t.tutorial.intensityLabel}
        onChange={(e) => setIntensity(Number(e.target.value))}
        className="slider-gold"
        style={{ '--slider-fill': `${((intensity - 1) / 2) * 100}%` } as CSSProperties}
      />
      <div className="mt-1.5 flex justify-between">
        {INTENSITY_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setIntensity(i + 1)}
            className={`cursor-pointer text-[11px] font-semibold transition-colors ${
              intensity === i + 1 ? 'font-bold text-accent' : 'text-muted hover:text-heading'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-surface-2 px-4 py-2.5 text-xs leading-relaxed text-body">
        {t.tutorial.intensityNotes[intensity - 1]}
      </p>
    </div>,
    // Step 4 · display mode
    <div key="mode" className="mt-5 max-w-sm">
      <p className="text-[11px] font-extrabold tracking-[0.14em] text-muted uppercase">{s.modeLabel}</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {MODES.map((m) => (
          <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => setMode(m.value)} className={pill(mode === m.value)}>
            {m.label}
          </button>
        ))}
      </div>
    </div>,
    null,
    null,
    // Step 7 · progress
    <ProgressChart key="progress" />,
  ]

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
      <DemoGuideCursor ref={guideRef} />

      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">
            {t.tutorial.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance text-heading sm:text-5xl">
            {t.tutorial.title}
          </h1>
          <p className="mt-4 text-lg text-body">{t.tutorial.sub}</p>
        </div>

        <div className="mt-14 grid items-start gap-8 lg:grid-cols-[1fr_minmax(360px,44%)]">
          {/* ── Narration column ─────────────────────────────── */}
          <div className="order-last min-w-0 space-y-6 lg:order-none">
            {steps.map((step, i) => (
              <section
                key={i}
                ref={setRef(i)}
                className={`rounded-3xl bg-surface p-7 ring-1 transition-all duration-300 sm:p-9 ${
                  active === i ? 'ring-gold-400/60 shadow-lift' : 'ring-line'
                }`}
              >
                <span className="text-4xl font-extrabold text-accent/40">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2 className="mt-2 text-xl font-extrabold tracking-tight text-heading sm:text-2xl">
                  {step.title}
                </h2>
                <div className="mt-3.5 space-y-3.5 text-[15px] leading-relaxed text-body">
                  <p>{step.intro}</p>
                  {step.bullets.length > 0 && (
                    <ul className="space-y-2.5">
                      {step.bullets.map((bullet) => (
                        <Bullet key={bullet.term} term={bullet.term}>
                          {bullet.text}
                        </Bullet>
                      ))}
                    </ul>
                  )}
                  {step.outro && <p>{step.outro}</p>}
                </div>
                {stepControls[i]}
                {step.caption && <p className="mt-4 text-xs font-semibold text-accent">{step.caption}</p>}
              </section>
            ))}
          </div>

          {/* ── The persistent mini-browser ──────────────────── */}
          <div className="sticky top-16 z-30 min-w-0 lg:top-24">
            <div ref={browserBoxRef} className="relative overflow-hidden rounded-2xl bg-[#dee1e6] shadow-card ring-1 ring-navy-600/60">
              {/* Tab strip */}
              <div className="flex items-end gap-1.5 px-3 pt-2">
                <div className="mr-1.5 flex items-center gap-2 self-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f26d5f]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f5c14e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#5ec269]" />
                </div>
                <div className="flex min-w-0 items-center gap-2 rounded-t-lg bg-white px-3 py-1.5 text-[11px] text-[#3c4043]">
                  <span className="font-wiki shrink-0 text-[13px] leading-none font-bold">B</span>
                  <span className="truncate">{s.browserTitle}</span>
                  <span className="ml-2 shrink-0 text-[#5f6368]">×</span>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-2 border-b border-[#dadce0] bg-white px-3 py-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-[#f1f3f4] px-3 py-1.5 text-[12px] text-[#202124]">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#5f6368" aria-hidden="true" className="shrink-0">
                    <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6z" />
                  </svg>
                  <span className="truncate">baomau.vn/du-lich/hoi-an</span>
                </div>
                {savedIds.size > 0 && (
                  <span className="animate-pop-in shrink-0 rounded-full bg-gold-400/20 px-2.5 py-1 text-[10px] font-extrabold text-[#9a7412]">
                    {s.deckChip(savedIds.size)}
                  </span>
                )}
                <span
                  className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold-400 text-[11px] font-extrabold text-navy-900 ${
                    active === 0 ? 'animate-pulse-soft' : ''
                  }`}
                  title="Merid"
                >
                  M
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#34a853] ring-2 ring-white" />
                </span>
              </div>

              {/* Page area */}
              <div className="relative bg-white">
                {active === steps.length - 1 ? (
                  <div className="h-[320px] sm:h-[380px] lg:h-[460px]">
                    <MiniDeck saved={savedEntries} />
                  </div>
                ) : (
                  <PracticeArticle
                    mode={mode}
                    intensity={intensity}
                    dataset={dataset}
                    savedIds={savedIds}
                    knownIds={knownIds}
                    onSave={handleSave}
                    onKnow={handleKnow}
                    scrollerClassName="wiki-scroll h-[320px] overflow-y-auto overscroll-contain sm:h-[380px] lg:h-[460px]"
                  />
                )}

                {/* Mini dataset panel while the dataset step is active */}
                {active === 1 && (
                  <div className="animate-card-in pointer-events-none absolute top-2 right-2 z-20 w-44 rounded-xl bg-[#0a192f] p-3 shadow-pop ring-1 ring-navy-600/70">
                    <p className="text-[10px] font-extrabold tracking-[0.12em] text-gold-400 uppercase">
                      {s.panelHint}
                    </p>
                    <div className="pointer-events-auto mt-2 grid grid-cols-2 gap-1.5">
                      {PANEL_DATASETS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDataset(d)}
                          className={`cursor-pointer rounded-[5px] border py-1.5 text-center text-[11px] font-semibold transition-all ${
                            dataset === d
                              ? 'border-[#f4be37] bg-[#f4be37] text-[#020c1b]'
                              : 'border-[#3a4a6b] text-[#8892b0] hover:border-[#f4be37] hover:text-[#e6f1ff]'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* "Your turn" nudge after the guided hover */}
                {yourTurn && (
                  <div className="pointer-events-none absolute inset-x-0 top-6 z-30 flex justify-center">
                    <span className="animate-pop-in rounded-full bg-gold-400 px-4 py-2 text-xs font-extrabold text-navy-900 shadow-pop ring-1 ring-gold-600/40">
                      {s.yourTurn}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-2.5 text-center text-xs font-semibold text-muted">{s.articleNote}</p>
          </div>
        </div>

        <Reveal>
          <div className="mt-20 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance text-heading sm:text-4xl">
              {t.tutorial.outroTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">{t.tutorial.outroSub}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <InstallButton label={t.tutorial.ctaInstall} variant="primary" />
              <Link
                to="/#demo"
                className="rounded-full border-2 border-line-strong px-7 py-3 text-base font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
              >
                {t.tutorial.ctaDemo}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
