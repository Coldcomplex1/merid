import { useEffect, useRef, useState } from 'react'
import { useInView } from '../../hooks/useInView'
import { useLang } from '../../i18n/LanguageContext'

/** Chrome's puzzle-piece extensions icon. */
function PuzzleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9.5 4.5a2 2 0 1 1 4 0V6H16a2 2 0 0 1 2 2v2.5h1.5a2 2 0 1 1 0 4H18V17a2 2 0 0 1-2 2h-2.5v-1.5a2 2 0 1 0-4 0V19H7a2 2 0 0 1-2-2v-2.5H3.5a2 2 0 1 1 0-4H5V8a2 2 0 0 1 2-2h2.5V4.5z" />
    </svg>
  )
}

/** Chrome's pin icon (filled when the extension is pinned). */
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M14.5 3.5l6 6-1.6 1.6a2 2 0 0 1-2 .5l-.6-.2-3.2 3.2.4 2.6a2 2 0 0 1-.6 1.8l-.8.8-4.2-4.2L4 19.5 2.9 18.4l3.9-3.9-4.2-4.2.8-.8a2 2 0 0 1 1.8-.6l2.6.4 3.2-3.2-.2-.6a2 2 0 0 1 .5-2l1.6-1.6z"
        fill={filled ? '#1a73e8' : 'none'}
        stroke={filled ? '#1a73e8' : '#5f6368'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type Phase = 'waiting' | 'demo' | 'your-turn' | 'pinned'

interface PinSimulatorProps {
  /** Fires when the visitor (not the auto-demo) completes the pin. */
  onPinned?: () => void
  /** Skip straight to the finished state (progress restored from storage). */
  initiallyPinned?: boolean
}

/**
 * A working replica of Chrome's "pin an extension" flow. When it scrolls into
 * view, a Merid guide cursor performs the two clicks once (puzzle icon →
 * pin), then resets and hands over. The visitor then does it for real:
 * clicking the puzzle opens the extensions dropdown, clicking the pin slides
 * the gold M into the toolbar.
 */
export default function PinSimulator({ onPinned, initiallyPinned = false }: PinSimulatorProps) {
  const { t } = useLang()
  const s = t.welcome.pin

  const [phase, setPhase] = useState<Phase>(initiallyPinned ? 'pinned' : 'waiting')
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinnedIcon, setPinnedIcon] = useState(initiallyPinned)
  // The demo cursor, positioned relative to the component box.
  const [cursor, setCursor] = useState<{ x: number; y: number; down: boolean; shown: boolean }>({
    x: 0,
    y: 0,
    down: false,
    shown: false,
  })

  const boxRef = useRef<HTMLDivElement | null>(null)
  const puzzleRef = useRef<HTMLButtonElement | null>(null)
  const pinBtnRef = useRef<HTMLButtonElement | null>(null)
  const demoPlayed = useRef(initiallyPinned)
  const demoTimer = useRef<number | null>(null)
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>(0.5)

  const centerIn = (el: HTMLElement | null) => {
    const box = boxRef.current
    if (!el || !box) return null
    const er = el.getBoundingClientRect()
    const br = box.getBoundingClientRect()
    return { x: er.left - br.left + er.width / 2, y: er.top - br.top + er.height / 2 }
  }

  const runDemo = () => {
    if (demoPlayed.current) return
    demoPlayed.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('your-turn')
      return
    }

    setPhase('demo')
    let cancelled = false
    const steps: { at: number; run: () => void }[] = []
    const at = (ms: number, run: () => void) => steps.push({ at: ms, run })

    at(0, () => {
      const p = centerIn(puzzleRef.current)
      if (!p) return
      setCursor({ x: p.x - 60, y: p.y + 70, down: false, shown: true })
    })
    at(150, () => {
      const p = centerIn(puzzleRef.current)
      if (p) setCursor((c) => ({ ...c, x: p.x, y: p.y }))
    })
    at(1050, () => setCursor((c) => ({ ...c, down: true })))
    at(1250, () => {
      setCursor((c) => ({ ...c, down: false }))
      setMenuOpen(true)
    })
    at(1700, () => {
      const p = centerIn(pinBtnRef.current)
      if (p) setCursor((c) => ({ ...c, x: p.x, y: p.y }))
    })
    at(2600, () => setCursor((c) => ({ ...c, down: true })))
    at(2800, () => {
      setCursor((c) => ({ ...c, down: false }))
      setMenuOpen(false)
      setPinnedIcon(true)
    })
    at(4100, () => setCursor((c) => ({ ...c, shown: false })))
    // Reset so the visitor performs the real thing themselves.
    at(4700, () => {
      setPinnedIcon(false)
      setPhase('your-turn')
    })

    const started = performance.now()
    const tick = () => {
      if (cancelled) return
      const elapsed = performance.now() - started
      while (steps.length && steps[0].at <= elapsed) steps.shift()!.run()
      if (steps.length) demoTimer.current = window.setTimeout(tick, 40)
    }
    tick()

    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    if (inView) runDemo()
    return () => {
      if (demoTimer.current !== null) window.clearTimeout(demoTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView])

  const interactive = phase === 'your-turn' || phase === 'pinned'

  const handlePuzzle = () => {
    if (!interactive) return
    setMenuOpen((v) => !v)
  }

  const handlePin = () => {
    if (!interactive) return
    setMenuOpen(false)
    if (!pinnedIcon) {
      setPinnedIcon(true)
      setPhase('pinned')
      onPinned?.()
    }
  }

  const replay = () => {
    setPinnedIcon(false)
    setMenuOpen(false)
    demoPlayed.current = false
    setPhase('waiting')
    runDemo()
  }

  const hint =
    phase === 'demo' ? s.watch : phase === 'pinned' ? s.pinnedNote : phase === 'your-turn' ? s.yourTurn : s.watch

  return (
    <div ref={inViewRef} className="w-full max-w-md">
      <div ref={boxRef} className="relative">
        <div
          className={`overflow-visible rounded-2xl shadow-card ring-1 ring-navy-600/40 ${
            phase === 'demo' ? 'pointer-events-none' : ''
          }`}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-2 rounded-t-2xl bg-cream-100 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f26d5f]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f5c14e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#5ec269]" />
            <div className="ml-2 flex-1 rounded-full bg-white/85 px-3 py-1.5 text-[11px] text-navy-500">
              vnexpress.net
            </div>
            {pinnedIcon && (
              <span className="animate-pop-in flex h-7 w-7 items-center justify-center rounded-md bg-gold-400 text-sm font-extrabold text-navy-900 shadow-[0_0_14px_-2px_rgb(245_197_66/0.8)]">
                M
              </span>
            )}
            <button
              ref={puzzleRef}
              type="button"
              aria-label={s.menuTitle}
              aria-expanded={menuOpen}
              onClick={handlePuzzle}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-navy-600 transition-colors hover:bg-navy-200/50 ${
                phase === 'your-turn' && !menuOpen ? 'animate-pulse-soft rounded-md' : ''
              } ${menuOpen ? 'bg-navy-200/60' : ''}`}
            >
              <PuzzleIcon />
            </button>
            <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-navy-400 to-navy-700" />
          </div>
          {/* A sliver of page below the toolbar, so it reads as a browser */}
          <div className="rounded-b-2xl bg-white px-4 py-4">
            <div className="h-2 w-3/4 rounded bg-navy-200/50" />
            <div className="mt-2 h-2 w-1/2 rounded bg-navy-200/40" />
          </div>

          {/* Extensions dropdown */}
          {menuOpen && (
            <div className="animate-card-in absolute top-[46px] right-2 z-20 w-64 rounded-xl bg-white p-2 shadow-pop ring-1 ring-black/10">
              <p className="px-2 pt-1 pb-2 text-[12px] font-bold text-[#202124]">{s.menuTitle}</p>
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-black/5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gold-400 text-[12px] font-extrabold text-navy-900">
                  M
                </span>
                <span className="flex-1 text-[13px] font-medium text-[#202124]">Merid</span>
                <button
                  ref={pinBtnRef}
                  type="button"
                  aria-label="Pin Merid"
                  onClick={handlePin}
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-black/10 ${
                    phase === 'your-turn' ? 'animate-pulse-soft' : ''
                  }`}
                >
                  <PinIcon filled={pinnedIcon} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* The Merid guide cursor for the auto-demo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 z-30"
          style={{
            transform: `translate3d(${cursor.x - 5}px, ${cursor.y - 3}px, 0) scale(${cursor.down ? 0.85 : 1})`,
            opacity: cursor.shown ? 1 : 0,
            transition: 'transform 800ms cubic-bezier(0.65, 0, 0.35, 1), opacity 200ms ease',
          }}
        >
          <svg width="26" height="34" viewBox="0 0 26 34" fill="none" aria-hidden="true">
            <g transform="rotate(11 5 3)">
              <path
                d="M5 3 L5 19.8 L8.9 16.2 L15 14.4 Z"
                fill="#f5c542"
                stroke="#16213c"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          </svg>
          <span className="absolute top-6 left-3.5 rounded-full bg-navy-800 px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-gold-200 shadow-pop">
            Merid
          </span>
        </div>
      </div>

      {/* Status line under the mock */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p
          className={`text-xs font-semibold ${phase === 'pinned' ? 'text-success' : 'text-accent'}`}
          role="status"
        >
          {hint}
        </p>
        {phase === 'pinned' && (
          <button
            type="button"
            onClick={replay}
            className="shrink-0 cursor-pointer text-xs font-bold text-muted underline-offset-2 hover:text-heading hover:underline"
          >
            {s.replay}
          </button>
        )}
      </div>
    </div>
  )
}
