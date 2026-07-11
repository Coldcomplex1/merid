import { useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord } from '../../deck/DeckSource'

/** Classic flip card: front = the word, back = meaning + example. */
export default function FlashcardMode({ words }: { words: DeckWord[] }) {
  const { t } = useLang()
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (!words.length) {
    return <p className="rounded-xl border border-navy-700 bg-navy-850 p-6 text-navy-300">{t.deck.empty}</p>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-navy-600 bg-navy-850 p-6 [backface-visibility:hidden]">
            <span className="text-3xl font-bold text-white">{card.word}</span>
            {card.pos && <span className="text-sm text-navy-300 italic">{card.pos}</span>}
            <span className="mt-4 text-xs text-navy-400">{t.deck.flash.flipHint}</span>
          </div>
          {/* Back */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-gold-400/40 bg-navy-800 p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {card.vietnamese && <span className="text-xl font-bold text-gold-300">{card.vietnamese}</span>}
            {card.definition && <span className="max-w-prose text-center text-sm text-navy-100">{card.definition}</span>}
            {card.example && (
              <span className="max-w-prose text-center font-serif text-sm text-navy-200 italic">“{card.example}”</span>
            )}
          </div>
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          className="rounded-full border border-navy-600 px-4 py-2 text-sm font-semibold text-navy-200 transition-colors hover:border-gold-400 hover:text-gold-300"
        >
          ← {t.deck.flash.prev}
        </button>
        <span className="text-sm text-navy-300">{t.deck.flash.counter(safeIndex + 1, words.length)}</span>
        <button
          type="button"
          onClick={() => go(1)}
          className="rounded-full border border-navy-600 px-4 py-2 text-sm font-semibold text-navy-200 transition-colors hover:border-gold-400 hover:text-gold-300"
        >
          {t.deck.flash.next} →
        </button>
      </div>
    </div>
  )
}
