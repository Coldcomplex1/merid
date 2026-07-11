import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord, WordStatus } from '../../deck/DeckSource'

interface Props {
  words: DeckWord[]
  onRemove: (word: string) => void
  onSetStatus: (word: string, status: WordStatus) => void
}

/** Plain deck listing with per-word status toggle + remove. All text renders
 *  through JSX interpolation only — never raw HTML (A03). */
export default function WordList({ words, onRemove, onSetStatus }: Props) {
  const { t } = useLang()

  if (!words.length) {
    return <p className="rounded-xl border border-navy-700 bg-navy-850 p-6 text-navy-300">{t.deck.empty}</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {words.map((w) => (
        <li
          key={w.word}
          className="flex flex-col gap-2 rounded-xl border border-navy-700 bg-navy-850 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-lg font-bold text-white">{w.word}</span>
              {w.pos && <span className="text-xs text-navy-300 italic">{w.pos}</span>}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  w.status === 'known' ? 'bg-navy-700 text-navy-200' : 'bg-gold-400/15 text-gold-300'
                }`}
              >
                {w.status === 'known' ? t.deck.knownLabel : t.deck.savedLabel}
              </span>
            </div>
            {w.vietnamese && <p className="mt-0.5 text-sm text-gold-200">{w.vietnamese}</p>}
            {w.definition && <p className="mt-0.5 text-sm text-navy-200">{w.definition}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onSetStatus(w.word, w.status === 'known' ? 'saved' : 'known')}
              className="rounded-full border border-navy-600 px-3 py-1.5 text-xs font-semibold text-navy-200 transition-colors hover:border-gold-400 hover:text-gold-300"
            >
              {w.status === 'known' ? t.deck.markSaved : t.deck.markKnown}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t.deck.confirmRemove)) onRemove(w.word)
              }}
              className="rounded-full border border-navy-600 px-3 py-1.5 text-xs font-semibold text-navy-300 transition-colors hover:border-red-400 hover:text-red-300"
              aria-label={`${t.deck.remove} ${w.word}`}
            >
              {t.deck.remove}
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
