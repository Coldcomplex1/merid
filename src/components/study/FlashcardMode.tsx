import { useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord } from '../../deck/DeckSource'
import { MIN_PUZZLE_WORDS } from './PuzzleMode'
import { speak } from '../../lib/speech'
import SpeakerIcon from '../ui/SpeakerIcon'

/** Classic flip card: front = the word, back = meaning + example.
 *
 *  The card sizes to its content rather than to a fixed height - a word with a
 *  long definition used to have it cut off at the bottom edge - and every
 *  colour comes from the semantic tokens, so it themes with the rest of the
 *  site instead of carrying its own one-off gold border.
 *
 *  `lang` is set per block because the two sides are different languages: it
 *  is what lets the browser pick the right font and line-breaking rules for
 *  Vietnamese rather than treating it as English text that happens to have
 *  diacritics. */
export default function FlashcardMode({ words }: { words: DeckWord[] }) {
  const { t } = useLang()
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (!words.length) {
    return (
      <p className="rounded-xl border border-line bg-surface p-6 text-muted">
        {t.deck.empty(MIN_PUZZLE_WORDS)}
      </p>
    )
  }

  const safeIndex = Math.min(index, words.length - 1) // deck may shrink under us
  const card = words[safeIndex]
  const progress = ((safeIndex + 1) / words.length) * 100

  const go = (delta: number) => {
    setFlipped(false)
    setIndex((safeIndex + delta + words.length) % words.length)
  }

  return (
    <div>
      {/* Where you are in the deck, before the card rather than under it -
          it is context for the card, not a footnote to it. */}
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative [perspective:1200px]">
        {/* A sibling of the flip button, not a child: the card front lives
            inside a <button>, and a nested button is invalid markup - it would
            also flip the card on every play. Anchored to the wrapper so it
            holds still while the card turns. */}
        <button
          type="button"
          onClick={() => speak(card.word)}
          aria-label={t.deck.play(card.word)}
          className="absolute top-4 right-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-muted transition-all hover:border-accent hover:text-accent active:scale-95"
        >
          <SpeakerIcon size={16} />
        </button>
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={t.deck.flash.flipHint}
          className="relative block min-h-[22rem] w-full cursor-pointer transition-transform duration-500 [transform-style:preserve-3d] sm:min-h-[26rem]"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-line-strong bg-surface px-6 py-10 shadow-soft [backface-visibility:hidden] sm:px-10">
            <span lang="en" className="text-4xl font-extrabold tracking-tight text-heading sm:text-5xl">
              {card.word}
            </span>
            {card.pos && (
              <span className="text-sm font-medium tracking-wide text-muted italic">{card.pos}</span>
            )}
            <span className="absolute inset-x-0 bottom-6 text-center text-xs font-semibold tracking-wide text-faint uppercase">
              {t.deck.flash.flipHint}
            </span>
          </div>

          {/* Back. The thicker gold top edge is the only decoration - it is
              what tells you at a glance which side you are looking at. Making
              it the border rather than a bar laid over the top keeps it inside
              the rounded corners. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl border border-accent/45 border-t-4 border-t-accent/80 bg-surface-2 px-6 py-10 shadow-soft [backface-visibility:hidden] [transform:rotateY(180deg)] sm:px-10">
            {card.vietnamese && (
              <span lang="vi" className="max-w-[24ch] text-center text-2xl font-bold text-accent">
                {card.vietnamese}
              </span>
            )}
            {card.definition && (
              <span lang="en" className="max-w-[46ch] text-center text-base leading-relaxed text-body">
                {card.definition}
              </span>
            )}
            {card.example && (
              <span
                lang="en"
                className="max-w-[46ch] border-t border-line pt-4 text-center font-wiki text-sm leading-relaxed text-muted italic"
              >
                “{card.example}”
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Three equal columns so the counter stays centred and the buttons do
          not shift when the number of digits changes. */}
      <div className="mt-6 grid grid-cols-3 items-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          className="justify-self-start rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-body transition-colors hover:border-accent hover:text-accent"
        >
          ← {t.deck.flash.prev}
        </button>
        <span className="text-center text-sm font-medium text-muted tabular-nums">
          {t.deck.flash.counter(safeIndex + 1, words.length)}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          className="justify-self-end rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-body transition-colors hover:border-accent hover:text-accent"
        >
          {t.deck.flash.next} →
        </button>
      </div>
    </div>
  )
}
