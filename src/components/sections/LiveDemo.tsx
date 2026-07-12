import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { DATASETS, VOCAB, isVisible, type Dataset, type VocabEntry } from '../../data/vocab'
import { ALL_VOCAB_OCCURRENCES } from '../../data/wikiContent'
import WikiPage from '../demo/WikiPage'
import VocabPopupCard from '../ui/VocabPopupCard'
import SectionHeading from '../ui/SectionHeading'
import Toggle from '../ui/Toggle'
import Reveal from '../ui/Reveal'
import { useLang } from '../../i18n/LanguageContext'

const CARD_WIDTH = 312
const CARD_GAP = 10 // the extension offsets the card 10px from the word
const FLIP_BUFFER = 20 // extension's buffer when deciding to flip above
const HIDE_GRACE_MS = 120 // extension's grace period before hiding on mouse-out

/** The extension's real replacement modes (content.js applyDisplayMode). */
type Mode = 'replace' | 'beside' | 'highlight'
const MODES: Mode[] = ['replace', 'beside', 'highlight']

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
  const [dataset, setDataset] = useState<Dataset>('SAT')
  const [frequency, setFrequency] = useState(3)
  const [mode, setMode] = useState<Mode>('replace')
  const [showPopup, setShowPopup] = useState(true)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<number | null>(null)

  // A card anchored to a word that just moved or disappeared would float wrong.
  useEffect(() => {
    setAnchor(null)
  }, [dataset, frequency, mode, showPopup])

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
    if (!showPopup || !scrollerRef.current || !contentRef.current) return
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

  // Tapping the page background (mobile has no mouse-out) dismisses the card.
  const handlePagePointerDown = (e: React.PointerEvent) => {
    const el = e.target as HTMLElement
    if (el.closest('[data-vocab-card]') || el.closest('[data-vocab-word]')) return
    setAnchor(null)
  }

  const renderVocab = (id: string, key: string) => {
    const entry = VOCAB[id]
    if (!entry) return <span key={key} />
    if (knownIds.has(id) || !isVisible(entry, dataset, frequency)) {
      return <span key={key}>{entry.vi}</span>
    }
    const label =
      mode === 'replace' ? entry.word : mode === 'beside' ? `${entry.vi} (${entry.word})` : entry.vi
    return (
      <button
        key={key}
        type="button"
        data-vocab-word
        className={`${mode === 'highlight' ? 'hl-vi' : 'hl-en'} text-inherit`}
        onMouseEnter={(e) => openPopup(e.currentTarget, entry)}
        onMouseLeave={scheduleHide}
        onClick={(e) => openPopup(e.currentTarget, entry)}
      >
        {label}
      </button>
    )
  }

  const activeWords = ALL_VOCAB_OCCURRENCES.filter((id) => {
    const entry = VOCAB[id]
    return entry !== undefined && !knownIds.has(id) && isVisible(entry, dataset, frequency)
  }).length

  return (
    <section id="demo" className="relative z-10 scroll-mt-16 py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading eyebrow={t.demo.eyebrow} title={t.demo.title} sub={t.demo.sub} />
        </Reveal>

        <Reveal delay={120} className="mt-14">
          <div className="grid items-start gap-8 lg:grid-cols-[320px_1fr]">
            {/* Controls */}
            <div className="h-fit rounded-3xl bg-navy-850 p-6 ring-1 ring-navy-600/50">
              <p className="text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">
                {t.demo.dataset}
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {DATASETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDataset(d)}
                    className={`cursor-pointer rounded-lg py-2 text-sm font-bold transition-all duration-200 active:scale-95 ${
                      dataset === d
                        ? 'bg-gold-400 text-navy-900 shadow-[0_0_18px_-4px_rgb(245_197_66/0.8)]'
                        : 'bg-navy-700 text-navy-200 hover:bg-navy-600 hover:text-cream-50'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <p className="mt-6 text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">
                {t.demo.frequency}
              </p>
              <input
                type="range"
                min={1}
                max={3}
                step={1}
                value={frequency}
                aria-label={t.demo.frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="slider-gold mt-4"
                style={{ '--slider-fill': `${((frequency - 1) / 2) * 100}%` } as CSSProperties}
              />
              <div className="mt-1 flex justify-between">
                {t.demo.freqLabels.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setFrequency(i + 1)}
                    className={`cursor-pointer text-xs transition-colors ${
                      frequency === i + 1 ? 'font-bold text-gold-400' : 'text-navy-300 hover:text-cream-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="mt-6 text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">
                {t.demo.modeLabel}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-navy-700 p-1">
                {MODES.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`cursor-pointer rounded-lg py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 ${
                      mode === m
                        ? 'bg-gold-400 text-navy-900 shadow-[0_0_14px_-4px_rgb(245_197_66/0.8)]'
                        : 'text-navy-200 hover:text-cream-50'
                    }`}
                  >
                    {t.demo.modes[i]}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <span className="text-sm text-cream-50">{t.demo.popupToggle}</span>
                <Toggle on={showPopup} onChange={setShowPopup} label={t.demo.popupToggle} />
              </div>

              <p className="mt-6 rounded-xl bg-navy-800 px-4 py-3 text-center text-xs text-navy-200 ring-1 ring-navy-600/40">
                <span className="font-bold text-gold-300">{activeWords}</span>{' '}
                {activeWords === 1 ? t.demo.counterWord : t.demo.counterWords} {t.demo.counterLink}{' '}
                <span className="font-bold text-cream-50">{dataset}</span> {t.demo.counterTail}
              </p>
            </div>

            {/* Fake browser running the extension on Wikipedia */}
            <div className="min-w-0">
              <div className="overflow-hidden rounded-2xl bg-[#dee1e6] shadow-card ring-1 ring-navy-600/60">
                {/* Tab strip */}
                <div className="flex items-end gap-2 px-3 pt-2">
                  <div className="mr-1 flex items-center gap-2 self-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f26d5f]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f5c14e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#5ec269]" />
                  </div>
                  <div className="flex min-w-0 max-w-[240px] items-center gap-2 rounded-t-lg bg-white px-3 py-1.5 text-[11px] text-[#3c4043]">
                    <span className="font-wiki shrink-0 text-[13px] leading-none font-bold">W</span>
                    <span className="truncate">Trang Chính – Wikipedia tiếng Việt</span>
                    <span className="shrink-0 text-[#5f6368]">×</span>
                  </div>
                  <span className="pb-1.5 text-base leading-none text-[#5f6368]">+</span>
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
                    <span className="truncate">vi.wikipedia.org/wiki/Trang_Chính</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#5f6368" strokeWidth="1.6" aria-hidden="true" className="ml-auto shrink-0">
                      <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z" />
                    </svg>
                  </div>
                  <span
                    className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold-400 text-[11px] font-extrabold text-navy-900"
                    title="Merid"
                  >
                    M
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#34a853] ring-2 ring-white" />
                  </span>
                  <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-navy-400 to-navy-700" />
                </div>

                {/* Scrollable Wikipedia page */}
                <div
                  ref={scrollerRef}
                  className="wiki-scroll relative h-[480px] overflow-y-auto overscroll-contain bg-white sm:h-[560px]"
                >
                  <div ref={contentRef} className="relative" onPointerDown={handlePagePointerDown}>
                    <WikiPage renderVocab={renderVocab} />

                    {showPopup && anchor && (
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
              </div>

              <p className="mt-4 text-sm text-muted">{showPopup ? t.demo.hintOn : t.demo.hintOff}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
