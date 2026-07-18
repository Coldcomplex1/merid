import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { VOCAB, type VocabEntry } from '../../data/vocab'
import WikiPage from '../demo/WikiPage'
import FacebookPage from '../demo/FacebookPage'
import DemoExtensionPanel, { type PanelDataset, type PanelMode } from '../demo/DemoExtensionPanel'
import DemoCursorZone from '../demo/DemoCursor'
import DemoGuideCursor, { type GuideCursorHandle } from '../demo/DemoGuideCursor'
import VocabPopupCard from '../ui/VocabPopupCard'
import FacebookLogo from '../ui/FacebookLogo'
import SectionHeading from '../ui/SectionHeading'
import Reveal from '../ui/Reveal'
import { useInView } from '../../hooks/useInView'
import { useLang } from '../../i18n/LanguageContext'

const CARD_WIDTH = 312
const CARD_GAP = 10 // the extension offsets the card 10px from the word
const FLIP_BUFFER = 20 // extension's buffer when deciding to flip above
const HIDE_GRACE_MS = 120 // extension's grace period before hiding on mouse-out

const MIN_BROWSER_W = 320 // narrowest the browser can be dragged (phone-ish)
const HANDLE_ALLOWANCE = 16 // room the resize handle + gap take inside the row
const RESIZE_KEY_STEP = 24

type TabId = 'wiki' | 'fb'

/** The fake browser's tabs. Each one is a full page the extension scans. */
const TABS: { id: TabId; title: string; url: string }[] = [
  { id: 'wiki', title: 'Trang Chính - Wikipedia tiếng Việt', url: 'vi.wikipedia.org/wiki/Trang_Chính' },
  { id: 'fb', title: 'Facebook', url: 'www.facebook.com' },
]

/** Word geometry captured on hover; the card places itself after measuring. */
interface Anchor {
  entry: VocabEntry
  cardW: number
  left: number // clamped card-left, relative to the page content
  top: number // word top, relative to the page content
  bottom: number // word bottom, relative to the page content
  spaceAbove: number // room above the word inside the visible scroller
  spaceBelow: number // room below the word inside the visible scroller
  contentH: number
}

interface Placement {
  pos: CSSProperties
  place: 'below' | 'above'
}

export default function LiveDemo() {
  const { t } = useLang()
  // Defaults mirror a fresh install: SAT · Focused · Highlight · VIE → ENG.
  const [dataset, setDataset] = useState<PanelDataset>('SAT')
  const [intensity, setIntensity] = useState(2)
  const [mode, setMode] = useState<PanelMode>('highlight')
  const [vieEng, setVieEng] = useState(true)
  const [engEng, setEngEng] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [reverted, setReverted] = useState(false)
  const [tab, setTab] = useState<TabId>('wiki')
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  // null = fill the column; a number = width in px chosen by dragging the handle
  const [browserW, setBrowserW] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)
  // True while the Merid guide is pointing at the Facebook tab, so it pulses.
  const [guideFbPulse, setGuideFbPulse] = useState(false)
  // True for the whole guided tour, so the demo hides the native cursor and
  // locks scrolling.
  const [guiding, setGuiding] = useState(false)
  // True just after the tour ends, to invite the visitor to try it themselves.
  const [showTry, setShowTry] = useState(false)

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<number | null>(null)
  const browserBoxRef = useRef<HTMLDivElement | null>(null)
  const resizeDrag = useRef<{ startX: number; startW: number; max: number } | null>(null)
  const guideRef = useRef<GuideCursorHandle | null>(null)
  const guidePlayed = useRef(false)
  // Fires once when the fake browser scrolls into view; drives the guided tour.
  const { ref: browserColRef, inView: browserInView } = useInView<HTMLDivElement>(0.3)

  // A card anchored to a word that just moved or disappeared would float wrong.
  useEffect(() => {
    setAnchor(null)
  }, [dataset, intensity, mode, vieEng, engEng, enabled, reverted])

  // Like the real extension, a reverted page stays reverted only until the
  // next settings change or on/off toggle triggers a rescan.
  useEffect(() => {
    setReverted(false)
  }, [dataset, intensity, mode, vieEng, engEng, enabled])

  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    },
    [],
  )

  const cancelHide = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }

  const scheduleHide = () => {
    cancelHide()
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null
      setAnchor(null)
    }, HIDE_GRACE_MS)
  }

  const openPopup = (target: HTMLElement, entry: VocabEntry) => {
    if (!scrollerRef.current || !contentRef.current) return
    cancelHide()
    const wordRect = target.getBoundingClientRect()
    const contentRect = contentRef.current.getBoundingClientRect()
    const scrollerRect = scrollerRef.current.getBoundingClientRect()
    const cardW = Math.min(CARD_WIDTH, contentRect.width - 16)
    const rawLeft = wordRect.left - contentRect.left + wordRect.width / 2 - cardW / 2
    setAnchor({
      entry,
      cardW,
      left: Math.max(8, Math.min(rawLeft, contentRect.width - cardW - 8)),
      top: wordRect.top - contentRect.top,
      bottom: wordRect.bottom - contentRect.top,
      spaceAbove: wordRect.top - scrollerRect.top,
      spaceBelow: scrollerRect.bottom - wordRect.bottom,
      contentH: contentRect.height,
    })
  }

  // Mirror the extension: render the card, measure it, then flip it above the
  // word when the visible space below is too small (and above is enough).
  useLayoutEffect(() => {
    if (!anchor) {
      setPlacement(null)
      return
    }
    const cardH = cardRef.current?.offsetHeight ?? 400
    const flipAbove =
      anchor.spaceBelow < cardH + FLIP_BUFFER && anchor.spaceAbove > cardH + FLIP_BUFFER
    setPlacement(
      flipAbove
        ? { place: 'above', pos: { left: anchor.left, bottom: anchor.contentH - anchor.top + CARD_GAP } }
        : { place: 'below', pos: { left: anchor.left, top: anchor.bottom + CARD_GAP } },
    )
  }, [anchor])

  const handleKnow = (id: string) => {
    setKnownIds((prev) => new Set(prev).add(id))
    setAnchor(null)
  }

  const switchTab = (next: TabId) => {
    if (next === tab) return
    setTab(next)
    setAnchor(null)
    scrollerRef.current?.scrollTo({ top: 0 })
  }

  // Once the fake browser scrolls into view, the "Merid" guide cursor plays a
  // short tour: it hovers a highlighted word or two (popping their cards), then
  // glides up to the Facebook tab and pulses it, so visitors notice the demo
  // has a second page. It runs once per visit, on desktop and mobile alike, and
  // only skips under reduced motion. It is deliberately independent of the
  // visitor's own pointer: moving the real cursor into the page does not stop
  // it (the visitor's "You" cursor simply appears alongside Merid's). It ends
  // on its own, or when the visitor switches tabs.
  useEffect(() => {
    if (!browserInView || tab !== 'wiki' || guidePlayed.current) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const scroller = scrollerRef.current
    const box = browserBoxRef.current
    const guide = guideRef.current
    if (!scroller || !box || !guide) return

    guidePlayed.current = true
    let cancelled = false
    let timer: number | null = null
    let rafId = 0
    const ac = new AbortController()

    const cleanup = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      if (rafId) cancelAnimationFrame(rafId)
      rafId = 0
      guide.hide()
      setGuiding(false)
      setGuideFbPulse(false)
      setAnchor(null)
      ac.abort()
    }
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms)
      })

    // The site header (banner + navbar) is sticky, so treat the top strip of the
    // viewport as occluded: the guide must never point at something hidden
    // behind it.
    const TOP_INSET = 120
    const vw = () => window.innerWidth || document.documentElement.clientWidth
    const vh = () => window.innerHeight || document.documentElement.clientHeight
    const centerOf = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const onScreen = (el: Element) => {
      const c = centerOf(el)
      return c.x > 0 && c.x < vw() && c.y > TOP_INSET && c.y < vh()
    }
    // Height of the scroller's un-occluded slice of the viewport; the guide only
    // hovers words when there is room here for a hover card to show.
    const bandHeight = () => {
      const sr = scroller.getBoundingClientRect()
      return Math.min(sr.bottom, vh()) - Math.max(sr.top, TOP_INSET)
    }
    // Every highlighted word in reading order (only highlighted words render
    // with data-vocab-word, so this is exactly what the visitor could hover).
    const allWords = () => Array.from(scroller.querySelectorAll<HTMLElement>('[data-vocab-word]'))

    // Resolve once the page has stopped scrolling (or after maxMs), so the
    // guide measures targets at their final resting positions, not mid-scroll.
    const waitScrollIdle = (maxMs: number) =>
      new Promise<void>((resolve) => {
        let last = performance.now()
        const started = last
        const onScroll = () => {
          last = performance.now()
        }
        window.addEventListener('scroll', onScroll, { passive: true, signal: ac.signal })
        const tick = () => {
          const now = performance.now()
          if (cancelled || now - last > 260 || now - started > maxMs) {
            window.removeEventListener('scroll', onScroll)
            resolve()
            return
          }
          timer = window.setTimeout(tick, 80)
        }
        tick()
      })
    // Resolve once the inner page has settled after a programmatic scroll.
    const waitScrollerIdle = async (maxMs: number) => {
      const started = performance.now()
      let last = scroller.scrollTop
      let lastChange = started
      while (!cancelled && performance.now() - started < maxMs) {
        await sleep(80)
        if (scroller.scrollTop !== last) {
          last = scroller.scrollTop
          lastChange = performance.now()
        } else if (performance.now() - lastChange > 200) {
          break
        }
      }
    }
    // Gently scroll the wiki page so `word` rests near the top of the visible
    // band, leaving room beneath it for the hover card.
    const revealWord = async (word: HTMLElement) => {
      const sr = scroller.getBoundingClientRect()
      const targetY = Math.max(sr.top, TOP_INSET) + 44
      const delta = word.getBoundingClientRect().top - targetY
      if (Math.abs(delta) > 10) {
        scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' })
        await waitScrollerIdle(1200)
      }
    }

    const run = async () => {
      await sleep(150)
      await waitScrollIdle(2600)
      if (cancelled) return

      const fbTab = box.querySelector<HTMLElement>('[data-tab="fb"]')
      // Only hover words when the page shows enough of itself for a hover card;
      // otherwise the tour just points at the Facebook tab.
      const words = bandHeight() >= 380 ? allWords().slice(0, 2) : []
      if (!words.length && (!fbTab || !onScreen(fbTab))) return

      // Freeze only the demo content and hide the native cursor for the tour.
      setGuiding(true)

      // The cursor eases toward the live centre of its current target every
      // frame, so it stays glued to the word / Facebook tab through both the
      // guide's inner reveal-scroll and the visitor scrolling the whole page.
      let getTarget: (() => { x: number; y: number }) | null = null
      let curX = 0
      let curY = 0
      let primed = false
      const loop = () => {
        if (cancelled) return
        if (getTarget) {
          const t = getTarget()
          if (!primed) {
            curX = t.x
            curY = t.y - 40 // start a touch above, then glide down onto it
            primed = true
          }
          curX += (t.x - curX) * 0.16
          curY += (t.y - curY) * 0.16
          guide.snapTo(curX, curY)
        }
        rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)

      let shown = false
      const ensureShown = () => {
        if (shown) return
        if (getTarget) {
          const t = getTarget()
          curX = t.x
          curY = t.y - 40
          primed = true
          guide.snapTo(curX, curY) // place before fade-in so it never flashes at (0,0)
        }
        guide.show()
        shown = true
      }

      for (const word of words) {
        await revealWord(word)
        if (cancelled) return
        getTarget = () => centerOf(word)
        ensureShown()
        await sleep(820) // ease onto the word
        if (cancelled) return
        const id = word.getAttribute('data-vocab-id')
        const entry = id ? VOCAB[id] : undefined
        if (entry) openPopup(word, entry)
        await sleep(1300) // dwell, following the word if the page scrolls
        if (cancelled) return
        setAnchor(null)
        await sleep(220)
        if (cancelled) return
      }

      if (fbTab && onScreen(fbTab)) {
        getTarget = () => centerOf(fbTab)
        ensureShown()
        await sleep(820) // ease onto the Facebook tab
        if (cancelled) return
        setGuideFbPulse(true)
        await sleep(1900)
        if (cancelled) return
      }

      getTarget = null
      guide.hide()
      await sleep(450)
      if (cancelled) return
      setGuideFbPulse(false)
      cleanup()
      // The demo is unlocked again; invite the visitor to take over.
      if (shown) setShowTry(true)
    }

    void run()

    return () => {
      cancelled = true
      cleanup()
    }
    // Intentionally keyed only to browserInView/tab: openPopup and setAnchor are
    // stable closures over refs, and depending on them would restart the tour on
    // every card render.
  }, [browserInView, tab])

  // Only the demo itself is frozen during the tour: the inner scroller is
  // overflow:hidden while `guiding` (below), so a wheel over it just scrolls the
  // page. The page stays fully scrollable, and the guide cursor follows its
  // target (via the rAF loop in the tour), so it never detaches on page scroll.

  // The "try it yourself" nudge clears itself only when the visitor deliberately
  // engages the demo (a click/tap), or after a while. Scrolling the page does
  // NOT dismiss it, so it stays visible while they read and scroll around.
  useEffect(() => {
    if (!showTry) return
    const box = browserBoxRef.current
    const hide = () => setShowTry(false)
    const timer = window.setTimeout(hide, 9000)
    box?.addEventListener('pointerdown', hide)
    box?.addEventListener('touchstart', hide, { passive: true })
    return () => {
      window.clearTimeout(timer)
      box?.removeEventListener('pointerdown', hide)
      box?.removeEventListener('touchstart', hide)
    }
  }, [showTry])

  const maxBrowserW = () => {
    const row = browserBoxRef.current?.parentElement
    return row ? row.getBoundingClientRect().width - HANDLE_ALLOWANCE : Infinity
  }

  const clampBrowserW = (w: number, max: number) =>
    Math.round(Math.min(max, Math.max(MIN_BROWSER_W, w)))

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = browserBoxRef.current
    if (!box) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeDrag.current = {
      startX: e.clientX,
      startW: box.getBoundingClientRect().width,
      max: maxBrowserW(),
    }
    setAnchor(null)
    setResizing(true)
  }

  const moveResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDrag.current
    if (!drag) return
    setBrowserW(clampBrowserW(drag.startW + (e.clientX - drag.startX), drag.max))
  }

  const endResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDrag.current) return
    resizeDrag.current = null
    setResizing(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleResizeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const box = browserBoxRef.current
    if (!box) return
    const current = browserW ?? box.getBoundingClientRect().width
    const delta = e.key === 'ArrowRight' ? RESIZE_KEY_STEP : -RESIZE_KEY_STEP
    setAnchor(null)
    setBrowserW(clampBrowserW(current + delta, maxBrowserW()))
  }

  // Tapping the page background (mobile has no mouse-out) dismisses the card.
  const handlePagePointerDown = (e: React.PointerEvent) => {
    const el = e.target as HTMLElement
    if (el.closest('[data-vocab-card]') || el.closest('[data-vocab-word]')) return
    setAnchor(null)
  }

  // The demo page is Vietnamese, so words light up only while VIE → ENG is
  // scanning (ENG → ENG has no English prose here to act on) and the
  // extension is on and un-reverted.
  const isWordVisible = (entry: VocabEntry) =>
    enabled &&
    !reverted &&
    vieEng &&
    (dataset === 'All' || entry.datasets.includes(dataset)) &&
    entry.tier <= intensity

  const renderVocab = (id: string, key: string) => {
    const entry = VOCAB[id]
    if (!entry) return <span key={key} />
    if (knownIds.has(id) || !isWordVisible(entry)) {
      return <span key={key}>{entry.vi}</span>
    }
    const label =
      mode === 'replace' ? entry.word : mode === 'beside' ? `${entry.vi} (${entry.word})` : entry.vi
    return (
      <button
        key={key}
        type="button"
        data-vocab-word
        data-vocab-id={entry.id}
        className="hl-en text-inherit"
        onMouseEnter={(e) => openPopup(e.currentTarget, entry)}
        onMouseLeave={scheduleHide}
        onClick={(e) => openPopup(e.currentTarget, entry)}
      >
        {label}
      </button>
    )
  }

  return (
    <section id="demo" className="relative z-10 scroll-mt-16 py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 xl:max-w-[90rem] 2xl:max-w-[105rem]">
        <Reveal>
          <SectionHeading eyebrow={t.demo.eyebrow} title={t.demo.title} sub={t.demo.sub} />
        </Reveal>

        <Reveal delay={120} className="mt-14">
          <div className="grid items-start gap-8 lg:grid-cols-[340px_1fr]">
            {/* The extension popup, exactly as it looks in Chrome */}
            <div className="mx-auto w-full max-w-[360px] lg:mx-0">
              <DemoExtensionPanel
                dataset={dataset}
                onDataset={setDataset}
                intensity={intensity}
                onIntensity={setIntensity}
                mode={mode}
                onMode={setMode}
                vieEng={vieEng}
                onVieEng={setVieEng}
                engEng={engEng}
                onEngEng={setEngEng}
                enabled={enabled}
                onToggleEnabled={() => setEnabled((v) => !v)}
                onRevert={() => setReverted(true)}
              />
            </div>

            {/* Fake browser running the extension on Wikipedia */}
            <div ref={browserColRef} className="min-w-0">
              <DemoGuideCursor ref={guideRef} />
              <div className={`flex items-stretch gap-2 ${resizing ? 'select-none' : ''}`}>
                <div
                  ref={browserBoxRef}
                  style={{ '--demo-w': browserW === null ? '100%' : `${browserW}px` } as CSSProperties}
                  className="w-full min-w-0 lg:w-[var(--demo-w)]"
                >
              <DemoCursorZone guiding={guiding}>
              <div className="relative overflow-hidden rounded-2xl bg-[#dee1e6] shadow-card ring-1 ring-navy-600/60">
                {/* Tab strip: both tabs are live pages, click to switch */}
                <div className="flex items-end gap-1.5 px-3 pt-2">
                  <div className="mr-1.5 flex items-center gap-2 self-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f26d5f]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f5c14e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#5ec269]" />
                  </div>
                  {TABS.map((t) => {
                    const isActive = tab === t.id
                    // While the Merid guide points here, the Facebook tab pulses.
                    const isPulse = guideFbPulse && t.id === 'fb'
                    return (
                    <button
                      key={t.id}
                      type="button"
                      data-tab={t.id}
                      aria-pressed={isActive}
                      onClick={() => switchTab(t.id)}
                      className={`flex min-w-0 max-w-[240px] flex-1 cursor-pointer items-center gap-2 rounded-t-lg px-3 py-1.5 text-left text-[11px] transition-colors sm:flex-none sm:basis-[200px] ${
                        isActive
                          ? 'bg-white text-[#3c4043]'
                          : isPulse
                            ? 'animate-tab-attn bg-gold-200 text-navy-900 ring-2 ring-inset ring-gold-400'
                            : 'text-[#5f6368] hover:bg-white/50'
                      }`}
                    >
                      {t.id === 'wiki' ? (
                        <span className="font-wiki shrink-0 text-[13px] leading-none font-bold">W</span>
                      ) : (
                        <FacebookLogo size={14} className="shrink-0" />
                      )}
                      <span className="truncate">{t.title}</span>
                      <span className="ml-auto shrink-0 text-[#5f6368]">×</span>
                    </button>
                    )
                  })}
                  <span className="pb-1.5 pl-1 text-base leading-none text-[#5f6368]">+</span>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2 border-b border-[#dadce0] bg-white px-3 py-1.5">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#5f6368" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#bdc1c6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="#5f6368" aria-hidden="true">
                    <path d="M17.65 6.35A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.76-4.24L13 11h7V4l-2.35 2.35z" />
                  </svg>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-[#f1f3f4] px-3 py-1.5 text-[12px] text-[#202124]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#5f6368" aria-hidden="true" className="shrink-0">
                      <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6z" />
                    </svg>
                    <span className="truncate">{TABS.find((t) => t.id === tab)?.url}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#5f6368" strokeWidth="1.6" aria-hidden="true" className="ml-auto shrink-0">
                      <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z" />
                    </svg>
                  </div>
                  <span
                    className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold-400 text-[11px] font-extrabold text-navy-900"
                    title="Merid"
                  >
                    M
                    {enabled && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#34a853] ring-2 ring-white" />
                    )}
                  </span>
                  <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-navy-400 to-navy-700" />
                </div>

                {/* Scrollable page for the active tab */}
                <div
                  ref={scrollerRef}
                  className={`wiki-scroll relative h-[480px] overscroll-contain sm:h-[560px] xl:h-[min(70vh,800px)] ${
                    guiding ? 'overflow-hidden' : 'overflow-y-auto'
                  } ${tab === 'fb' ? 'bg-[#f0f2f5]' : 'bg-white'}`}
                >
                  <div ref={contentRef} className="relative min-h-full" onPointerDown={handlePagePointerDown}>
                    {tab === 'wiki' ? (
                      <WikiPage renderVocab={renderVocab} />
                    ) : (
                      <FacebookPage renderVocab={renderVocab} />
                    )}

                    {anchor && (
                      <div
                        key={anchor.entry.id}
                        ref={cardRef}
                        data-vocab-card
                        onMouseEnter={cancelHide}
                        onMouseLeave={scheduleHide}
                        className={`absolute z-30 ${
                          placement
                            ? placement.place === 'above'
                              ? 'animate-card-in-down'
                              : 'animate-card-in'
                            : 'invisible'
                        }`}
                        style={{
                          width: anchor.cardW,
                          ...(placement ? placement.pos : { left: anchor.left, top: anchor.bottom + CARD_GAP }),
                        }}
                      >
                        <VocabPopupCard
                          entry={anchor.entry}
                          saved={savedIds.has(anchor.entry.id)}
                          onSave={() => setSavedIds((prev) => new Set(prev).add(anchor.entry.id))}
                          onKnow={() => handleKnow(anchor.entry.id)}
                          onClose={() => setAnchor(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* While the tour plays: a glowing gold ring plus a status pill
                    so the visitor knows Merid is driving (and not to touch). The
                    ring is inset so the box's overflow-hidden does not clip it;
                    the pill sits over the toolbar, clear of the cursor's path. */}
                {guiding && (
                  <>
                    <div className="animate-glow pointer-events-none absolute inset-0 z-30 rounded-2xl ring-2 ring-inset ring-gold-400" />
                    <div className="pointer-events-none absolute inset-x-0 top-[46px] z-40 flex justify-center">
                      <span className="animate-pop-in flex items-center gap-2 rounded-full bg-navy-900/95 px-3.5 py-1.5 text-[11px] font-bold text-cream-50 shadow-pop ring-1 ring-navy-600/70">
                        <span className="animate-glow h-2 w-2 rounded-full bg-gold-400" />
                        {t.demo.guiding}
                      </span>
                    </div>
                  </>
                )}

                {/* Invitation shown the moment the guided tour finishes. Sits
                    in the upper third so it stays visible even when the browser
                    mockup runs past the bottom of the viewport. */}
                {showTry && (
                  <div className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center">
                    <span className="animate-pop-in flex items-center gap-2 rounded-full bg-gold-400 px-5 py-2.5 text-sm font-extrabold text-navy-900 shadow-pop ring-1 ring-gold-600/40">
                      <svg width="15" height="18" viewBox="0 0 26 34" fill="none" aria-hidden="true" className="-ml-0.5">
                        <g transform="rotate(11 5 3)">
                          <path
                            d="M5 3 L5 19.8 L8.9 16.2 L15 14.4 Z"
                            fill="#16213c"
                            stroke="#fdf9ef"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        </g>
                      </svg>
                      {t.demo.tryIt}
                    </span>
                  </div>
                )}
              </div>
              </DemoCursorZone>
                </div>

                {/* Drag to preview the extension on a narrower or wider page */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t.demo.resizeHandle}
                  title={t.demo.resizeHandle}
                  tabIndex={0}
                  onPointerDown={startResize}
                  onPointerMove={moveResize}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                  onDoubleClick={() => setBrowserW(null)}
                  onKeyDown={handleResizeKey}
                  className="group hidden shrink-0 cursor-ew-resize touch-none items-center rounded-full px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-gold-400 lg:flex"
                >
                  <span
                    className={`h-16 w-1.5 rounded-full transition-colors ${
                      resizing ? 'bg-gold-400' : 'bg-line-strong group-hover:bg-gold-400'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
