import { useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord } from '../../deck/DeckSource'

/** Classic flip card: front = the word, back = meaning + example. */
export default function FlashcardMode({ words }: { words: DeckWord[] }) {
  const { t } = useLang()
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (!words.length) {
    return <p className="rounded-xl border border-line bg-surface p-6 text-muted">{t.deck.empty}</p>
  }

  const safeIndex = Math.min(index, words.length - 1) // deck may shrink under us
  const card = words[safeIndex]

  const go = (delta: number) => {
    setFlipped(false)
    setIndex((safeIndex + delta + words.length) % words.length)
  }

  return (
    <div>
      <div className="[perspective:1200px]">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={t.deck.flash.flipHint}
          className="relative block h-72 w-full cursor-pointer transition-transform duration-500 [transform-style:preserve-3d]"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface p-6 [backface-visibility:hidden]">
            <span className="text-3xl font-bold text-heading">{card.word}</span>
            {card.pos && <span className="text-sm text-muted italic">{card.pos}</span>}
            <span className="mt-4 text-xs text-faint">{t.deck.flash.flipHint}</span>
          </div>
          {/* Back */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-gold-400/40 bg-surface-2 p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {card.vietnamese && <span className="text-xl font-bold text-accent">{card.vietnamese}</span>}
            {card.definition && <span className="max-w-prose text-center text-sm text-body">{card.definition}</span>}
            {card.example && (
              <span className="max-w-prose text-center font-serif text-sm text-muted italic">“{card.example}”</span>
            )}
          </div>
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-body transition-colors hover:border-accent hover:text-accent"
        >
          ← {t.deck.flash.prev}
        </button>
        <span className="text-sm text-muted">{t.deck.flash.counter(safeIndex + 1, words.length)}</span>
        <button
          type="button"
          onClick={() => go(1)}
          className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-body transition-colors hover:border-accent hover:text-accent"
        >
          {t.deck.flash.next} →
        </button>
      </div>
    </div>
  )
}
