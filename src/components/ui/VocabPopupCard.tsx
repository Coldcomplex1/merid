import { useState } from 'react'
import type { VocabEntry } from '../../data/vocab'

interface VocabPopupCardProps {
  entry: VocabEntry
  onClose?: () => void
  className?: string
  compact?: boolean
  /** Controlled "Save to Deck" state; falls back to local state when omitted. */
  saved?: boolean
  onSave?: () => void
  /** When provided, "I know this" defers to the owner (the demo reverts the word). */
  onKnow?: () => void
}

const NAVY = '#19355d'

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Same glyph the extension injects for its pronunciation button.
function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4z" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        d="M15.2 9.4a3.6 3.6 0 0 1 0 5.2"
      />
    </svg>
  )
}

function speak(word: string) {
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = 'en-US'
    window.speechSynthesis.speak(u)
  } catch {
    /* speech not available */
  }
}

/** The floating learning card, replicated 1:1 from the extension's tooltip. */
export default function VocabPopupCard({
  entry,
  onClose,
  className = '',
  compact = false,
  saved,
  onSave,
  onKnow,
}: VocabPopupCardProps) {
  const [localSaved, setLocalSaved] = useState(false)
  const [localKnown, setLocalKnown] = useState(false)
  const isSaved = saved ?? localSaved

  const exampleParts = entry.example.split(new RegExp(`(${escapeRegExp(entry.word)})`, 'i'))
  // The extension shrinks long headwords so they stay on one line.
  const titleSize = Math.max(18, 28 - Math.max(0, entry.word.length - 9) * 1.2)
  const synonyms = entry.synonyms.slice(0, 3)
  const antonyms = entry.antonyms.slice(0, 3)

  return (
    <div
      className={`relative w-[312px] max-w-full overflow-hidden rounded-2xl border-2 border-[#19355d] bg-[#fffdf6] text-left text-[#1c2c47] shadow-[0_3px_10px_rgba(15,31,61,0.08)] ${className}`}
    >
      {onClose && (
        <button
          type="button"
          aria-label="Close popup"
          onClick={onClose}
          className="absolute top-[11px] right-[11px] z-[2] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[#19355d]/20 bg-[#fffef9] text-[15px] leading-none text-[#8a97ac] transition-colors hover:bg-white hover:text-[#19355d]"
        >
          ×
        </button>
      )}

      <div className={compact ? 'p-[13px_14px_12px]' : 'p-[15px_16px_14px]'}>
        <div className="pr-[30px]">
          <h4
            className="overflow-hidden leading-none font-extrabold tracking-[0.01em] whitespace-nowrap text-[#19355d] uppercase"
            style={{ fontSize: `${titleSize.toFixed(1)}px` }}
          >
            {entry.word}
          </h4>
          <div className="mt-[5px] flex items-center gap-[7px]">
            <span
              className="text-sm italic"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: NAVY }}
            >
              ({entry.pos})
            </span>
            <button
              type="button"
              aria-label="Play pronunciation"
              onClick={() => speak(entry.word)}
              className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full bg-[#19355d] text-white transition-all duration-150 hover:-translate-y-px hover:scale-[1.04] hover:bg-[#0f2442]"
            >
              <SpeakerIcon />
            </button>
            <span className="text-[12.5px] tracking-[0.01em] text-[#6c7c9c]">{entry.pron}</span>
          </div>
        </div>

        <p className="mt-[11px] text-sm leading-[1.32] font-semibold text-[#19355d]">
          {entry.definition}
        </p>

        {synonyms.length > 0 && (
          <div className="mt-[11px] flex gap-[5px] rounded-[11px] border-2 border-[#19355d] p-[5px]">
            {synonyms.map((s) => (
              <span
                key={s}
                className="min-w-0 flex-1 cursor-default overflow-hidden rounded-[7px] border-[1.5px] border-[#19355d] bg-[#f3c94b] px-1.5 py-[7px] text-center text-[11px] leading-none font-extrabold tracking-[-0.01em] text-ellipsis whitespace-nowrap text-[#19355d]"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {antonyms.length > 0 && (
          <div className="mt-2 flex gap-[5px] rounded-[11px] border-2 border-[#19355d] p-[5px]">
            {antonyms.map((a) => (
              <span
                key={a}
                className="min-w-0 flex-1 cursor-default overflow-hidden rounded-[7px] border-[1.5px] border-[#19355d] bg-[#e9eef8] px-1.5 py-[7px] text-center text-[11px] leading-none font-extrabold tracking-[-0.01em] text-ellipsis whitespace-nowrap text-[#19355d]"
              >
                {a}
              </span>
            ))}
          </div>
        )}

        {!compact && (
          <p className="mt-3 text-[13px] leading-[1.4] text-[#1c2c47]">
            {exampleParts.map((part, i) =>
              part.toLowerCase() === entry.word.toLowerCase() ? (
                <strong
                  key={i}
                  className="font-extrabold text-[#19355d] underline decoration-[1.5px] underline-offset-2"
                >
                  {part}
                </strong>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>
        )}

        <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-[#ece4d3] px-[13px] py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="w-[84px] shrink-0 text-[9px] font-extrabold tracking-[0.09em] text-[#6c7c9c] uppercase">
              Vietnamese
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] font-medium text-[#19355d]">
              {entry.viMeaning}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="w-[84px] shrink-0 text-[9px] font-extrabold tracking-[0.09em] text-[#6c7c9c] uppercase">
              Replaced
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] font-medium text-[#19355d]">
              {entry.vi}
            </span>
          </div>
        </div>
      </div>

      <div className="flex border-t border-[#19355d]/15">
        <button
          type="button"
          disabled={isSaved}
          onClick={() => {
            setLocalSaved(true)
            onSave?.()
          }}
          className="flex-1 cursor-pointer px-2 py-[13px] text-[13px] font-extrabold text-[#c68a00] transition-colors hover:bg-[#f3c94b]/15 disabled:cursor-default disabled:opacity-85 disabled:hover:bg-transparent"
        >
          {isSaved ? 'Saved ✓' : 'Save to Deck'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (onKnow) onKnow()
            else setLocalKnown(true)
          }}
          className="flex-1 cursor-pointer border-l border-[#19355d]/15 px-2 py-[13px] text-[13px] font-bold text-[#19355d] transition-colors hover:bg-[#19355d]/5"
        >
          {localKnown && !onKnow ? 'Marked ✓' : 'I know this'}
        </button>
      </div>
    </div>
  )
}
