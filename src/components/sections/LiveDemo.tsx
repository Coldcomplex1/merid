import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  DATASETS,
  DEMO_PARAGRAPH,
  VOCAB,
  isVisible,
  type Dataset,
  type VocabEntry,
} from '../../data/vocab'
import VocabPopupCard from '../ui/VocabPopupCard'
import SectionHeading from '../ui/SectionHeading'
import Toggle from '../ui/Toggle'
import Reveal from '../ui/Reveal'

const FREQ_LABELS = ['Low', 'Medium', 'High'] as const
const POPUP_WIDTH = 320

interface ActivePopup {
  entry: VocabEntry
  /** absolute position within the fake-page wrapper; flips above the word near the card bottom */
  pos: CSSProperties
}

export default function LiveDemo() {
  const [dataset, setDataset] = useState<Dataset>('SAT')
  const [frequency, setFrequency] = useState(3)
  const [replaceDirectly, setReplaceDirectly] = useState(true)
  const [showPopup, setShowPopup] = useState(true)
  const [popup, setPopup] = useState<ActivePopup | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)

  // A popup anchored to a word that just moved or disappeared would float wrong.
  useEffect(() => {
    setPopup(null)
  }, [dataset, frequency, replaceDirectly, showPopup])

  const openPopup = (target: HTMLElement, entry: VocabEntry) => {
    if (!showPopup || !pageRef.current) return
    const wordRect = target.getBoundingClientRect()
    const pageRect = pageRef.current.getBoundingClientRect()
    const rawX = wordRect.left - pageRect.left + wordRect.width / 2 - POPUP_WIDTH / 2
    const left = Math.max(8, Math.min(rawX, pageRect.width - POPUP_WIDTH - 8))
    const flipAbove = wordRect.top - pageRect.top > pageRect.height * 0.5
    const pos: CSSProperties = flipAbove
      ? { left, bottom: pageRect.height - (wordRect.top - pageRect.top) + 12 }
      : { left, top: wordRect.bottom - pageRect.top + 12 }
    setPopup({ entry, pos })
  }

  const activeWords = DEMO_PARAGRAPH.filter(
    (t) => 'entryId' in t && isVisible(VOCAB[t.entryId], dataset, frequency),
  ).length

  return (
    <section id="demo" className="relative z-10 scroll-mt-16 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Interactive demo"
            title="See it work in real time"
            sub="This is the real behavior of the extension. Change the dataset, tune the frequency, and hover any highlighted word."
          />
        </Reveal>

        <Reveal delay={120} className="mt-14">
          <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
            {/* Controls */}
            <div className="h-fit rounded-3xl bg-navy-850 p-6 ring-1 ring-navy-600/50">
              <p className="text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">
                Vocabulary dataset
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
                Highlight frequency
              </p>
              <input
                type="range"
                min={1}
                max={3}
                step={1}
                value={frequency}
                aria-label="Highlight frequency"
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="slider-gold mt-4"
                style={{ '--slider-fill': `${((frequency - 1) / 2) * 100}%` } as CSSProperties}
              />
              <div className="mt-1 flex justify-between">
                {FREQ_LABELS.map((label, i) => (
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

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-cream-50">Replace words directly</span>
                  <Toggle on={replaceDirectly} onChange={setReplaceDirectly} label="Replace words directly" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-cream-50">Show popup explanation</span>
                  <Toggle on={showPopup} onChange={setShowPopup} label="Show popup explanation" />
                </div>
              </div>

              <p className="mt-6 rounded-xl bg-navy-800 px-4 py-3 text-center text-xs text-navy-200 ring-1 ring-navy-600/40">
                <span className="font-bold text-gold-300">{activeWords}</span> word
                {activeWords === 1 ? '' : 's'} from the{' '}
                <span className="font-bold text-cream-50">{dataset}</span> dataset active on this page
              </p>
            </div>

            {/* Fake page */}
            <div ref={pageRef} className="relative">
              <div className="rounded-3xl bg-cream-50 p-7 text-ink shadow-card sm:p-10">
                <div className="mb-5 flex items-center gap-2 border-b border-navy-200/60 pb-4 text-xs font-semibold text-navy-500">
                  <span className="h-2 w-2 rounded-full bg-gold-400" />
                  blog.hocdethi.vn · bài viết hôm nay
                </div>
                <p className="font-wiki text-xl leading-[2] font-semibold text-pretty sm:text-[22px]">
                  {DEMO_PARAGRAPH.map((token, i) => {
                    if ('text' in token) return <span key={i}>{token.text}</span>
                    const entry = VOCAB[token.entryId]
                    if (!isVisible(entry, dataset, frequency)) {
                      return <span key={i}>{entry.vi}</span>
                    }
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`${replaceDirectly ? 'hl-en' : 'hl-vi'} font-wiki text-inherit`}
                        onMouseEnter={(e) => openPopup(e.currentTarget, entry)}
                        onClick={(e) => openPopup(e.currentTarget, entry)}
                      >
                        {replaceDirectly ? entry.word : entry.vi}
                      </button>
                    )
                  })}
                </p>
                <p className="mt-6 text-sm text-navy-500">
                  {showPopup
                    ? 'Hover or tap a highlighted word to see the popup, exactly like on a real page.'
                    : 'Popups are off. Words stay highlighted so your reading flow is never interrupted.'}
                </p>
              </div>

              {popup && (
                <div className="absolute z-30 animate-pop-in" style={popup.pos}>
                  <VocabPopupCard entry={popup.entry} onClose={() => setPopup(null)} />
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
