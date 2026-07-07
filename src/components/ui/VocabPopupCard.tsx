import { useState } from 'react'
import type { VocabEntry } from '../../data/vocab'

interface VocabPopupCardProps {
  entry: VocabEntry
  onClose?: () => void
  className?: string
  compact?: boolean
}

function SpeakerIcon() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-cream-50 transition-transform hover:scale-110">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
    </span>
  )
}

/** The floating vocabulary explanation card, faithful to the extension popup. */
export default function VocabPopupCard({ entry, onClose, className = '', compact = false }: VocabPopupCardProps) {
  const [saved, setSaved] = useState(false)
  const [known, setKnown] = useState(false)

  const exampleParts = entry.example.split(new RegExp(`(${entry.word})`, 'i'))

  return (
    <div
      className={`w-80 max-w-full rounded-2xl border-[2.5px] border-navy-700 bg-cream-50 text-left shadow-pop ${className}`}
    >
      <div className={`relative ${compact ? 'p-4' : 'p-5'} pb-3`}>
        {onClose && (
          <button
            type="button"
            aria-label="Close popup"
            onClick={onClose}
            className="absolute top-3 right-3 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-navy-300 text-xs text-navy-500 transition hover:bg-navy-800 hover:text-cream-50"
          >
            ✕
          </button>
        )}

        <h4 className="text-[26px] leading-none font-extrabold tracking-wide text-navy-800 uppercase">
          {entry.word}
        </h4>

        <div className="mt-1.5 flex items-center gap-2 text-sm text-navy-600">
          <span className="italic">({entry.pos})</span>
          <SpeakerIcon />
          <span className="text-xs text-navy-500">{entry.pron}</span>
        </div>

        <p className="mt-2.5 text-sm font-semibold text-navy-800">{entry.definition}</p>

        <div className="mt-3 flex gap-1.5 rounded-xl border-2 border-navy-700 p-1.5">
          {entry.synonyms.map((s) => (
            <span
              key={s}
              className="flex-1 cursor-default rounded-lg border-2 border-navy-700 bg-gold-400 px-1 py-1 text-center text-xs font-bold text-navy-800 transition-transform duration-150 hover:-translate-y-0.5"
            >
              {s}
            </span>
          ))}
        </div>

        <div className="mt-2 flex gap-1.5 rounded-xl border-2 border-navy-700 p-1.5">
          {entry.antonyms.map((a) => (
            <span
              key={a}
              className="flex-1 cursor-default rounded-lg border border-navy-500 bg-chip-100 px-1 py-1 text-center text-xs font-semibold text-navy-700 transition-transform duration-150 hover:-translate-y-0.5"
            >
              {a}
            </span>
          ))}
        </div>

        {!compact && (
          <p className="mt-3 text-[13px] leading-relaxed text-navy-700">
            {exampleParts.map((part, i) =>
              part.toLowerCase() === entry.word.toLowerCase() ? (
                <strong key={i} className="font-bold underline decoration-2 underline-offset-2">
                  {part}
                </strong>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>
        )}

        <div className="mt-3 space-y-1.5 rounded-xl bg-beige-100 p-3">
          <div className="flex items-baseline gap-2">
            <span className="w-21 shrink-0 text-[10px] font-extrabold tracking-[0.14em] text-navy-500 uppercase">
              Vietnamese
            </span>
            <span className="text-[13px] text-navy-800">{entry.viMeaning}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="w-21 shrink-0 text-[10px] font-extrabold tracking-[0.14em] text-navy-500 uppercase">
              Replaced
            </span>
            <span className="text-[13px] text-navy-800">{entry.vi}</span>
          </div>
        </div>
      </div>

      <div className="flex border-t border-navy-200/70">
        <button
          type="button"
          onClick={() => setSaved(true)}
          className="flex-1 cursor-pointer rounded-bl-2xl py-3 text-sm font-bold text-gold-600 transition hover:bg-gold-400/15 active:scale-95"
        >
          {saved ? 'Saved ✓' : 'Save to Deck'}
        </button>
        <div className="w-px bg-navy-200/70" />
        <button
          type="button"
          onClick={() => setKnown(true)}
          className="flex-1 cursor-pointer rounded-br-2xl py-3 text-sm font-semibold text-navy-800 transition hover:bg-navy-800/5 active:scale-95"
        >
          {known ? 'Marked ✓' : 'I know this'}
        </button>
      </div>
    </div>
  )
}
