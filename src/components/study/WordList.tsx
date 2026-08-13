import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord, WordStatus } from '../../deck/DeckSource'
import { speak } from '../../lib/speech'
import SpeakerIcon from '../ui/SpeakerIcon'
// Owned by PuzzleMode, where it is derived from the number of options a
// question offers - not restated here, so the two cannot disagree.
import { MIN_PUZZLE_WORDS } from './PuzzleMode'

interface Props {
  words: DeckWord[]
  onRemove: (word: string) => void
  onSetStatus: (word: string, status: WordStatus) => void
  /** Selection mode. When off, the list behaves exactly as it always has. */
  selecting: boolean
  selected: Set<string>
  onToggleSelecting: () => void
  onToggleSelect: (word: string) => void
  onSelectAll: (words: string[]) => void
  onClearSelection: () => void
  onMakePuzzle: () => void
}

/** Plain deck listing with per-word status toggle + remove, and an optional
 *  selection mode for building a puzzle set out of specific words. All text
 *  renders through JSX interpolation only, never raw HTML (A03). */
export default function WordList({
  words,
  onRemove,
  onSetStatus,
  selecting,
  selected,
  onToggleSelecting,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onMakePuzzle,
}: Props) {
  const { t } = useLang()

  if (!words.length) {
    return (
      <p className="rounded-xl border border-line bg-surface p-6 text-muted">
        {t.deck.empty(MIN_PUZZLE_WORDS)}
      </p>
    )
  }

  // Only words still being learned can go into a puzzle - a word marked known
  // has nothing left to test.
  const selectable = words.filter((w) => w.status === 'saved')
  const allChosen = selectable.length > 0 && selectable.every((w) => selected.has(w.word))
  const enough = selected.size >= MIN_PUZZLE_WORDS

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleSelecting}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
            selecting
              ? 'bg-gold-400 text-navy-900'
              : 'border border-line-strong text-body hover:border-accent hover:text-accent'
          }`}
        >
          {selecting ? t.deck.select.cancel : t.deck.select.start}
        </button>

        {selecting && (
          <>
            <button
              type="button"
              onClick={() => (allChosen ? onClearSelection() : onSelectAll(selectable.map((w) => w.word)))}
              className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold text-body transition-colors hover:border-accent hover:text-accent"
            >
              {allChosen ? t.deck.select.none : t.deck.select.all}
            </button>
            <span className="text-xs font-semibold text-muted">{t.deck.select.chosen(selected.size)}</span>
          </>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {words.map((w) => {
          const canSelect = selecting && w.status === 'saved'
          const isChosen = selected.has(w.word)
          return (
            <li
              key={w.word}
              className={`flex flex-col gap-2 rounded-xl border bg-surface p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                // A tint of the accent, not --band: band is a near-white cream
                // in the dark theme and would read as a grey slab there.
                isChosen ? 'border-accent/60 bg-accent/10' : 'border-line'
              }`}
            >
              <div className="flex min-w-0 items-start gap-3">
                {selecting && (
                  <input
                    type="checkbox"
                    checked={isChosen}
                    disabled={!canSelect}
                    onChange={() => onToggleSelect(w.word)}
                    aria-label={t.deck.select.toggle(w.word)}
                    className="mt-1.5 h-4 w-4 shrink-0 accent-gold-400 disabled:opacity-40"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {/* Word and speaker share a nested row so the button never
                        wraps away from the word it pronounces. */}
                    <span className="flex items-center gap-2">
                      <span lang="en" className="text-lg font-bold text-heading">
                        {w.word}
                      </span>
                      <button
                        type="button"
                        onClick={() => speak(w.word)}
                        aria-label={t.deck.play(w.word)}
                        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong text-muted transition-all hover:border-accent hover:text-accent active:scale-95"
                      >
                        <SpeakerIcon size={14} />
                      </button>
                    </span>
                    {w.pos && <span className="text-xs text-muted italic">{w.pos}</span>}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        w.status === 'known' ? 'bg-surface-2 text-muted' : 'bg-gold-400/15 text-accent'
                      }`}
                    >
                      {w.status === 'known' ? t.deck.knownLabel : t.deck.savedLabel}
                    </span>
                  </div>
                  {w.vietnamese && (
                    <p lang="vi" className="mt-0.5 text-sm text-accent">
                      {w.vietnamese}
                    </p>
                  )}
                  {w.definition && (
                    <p lang="en" className="mt-0.5 text-sm text-body">
                      {w.definition}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSetStatus(w.word, w.status === 'known' ? 'saved' : 'known')}
                  className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:border-accent hover:text-accent"
                >
                  {w.status === 'known' ? t.deck.markSaved : t.deck.markKnown}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t.deck.confirmRemove)) onRemove(w.word)
                  }}
                  className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-danger hover:text-danger"
                  aria-label={`${t.deck.remove} ${w.word}`}
                >
                  {t.deck.remove}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Sticks to the bottom of the viewport so the button stays reachable
          while you scroll a long deck picking words. */}
      {selecting && selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface/95 p-3 shadow-soft backdrop-blur-md">
          <span className="pl-2 text-sm font-semibold text-body">
            {enough ? t.deck.select.chosen(selected.size) : t.deck.select.needFour}
          </span>
          <button
            type="button"
            disabled={!enough}
            onClick={onMakePuzzle}
            className="rounded-full bg-gold-400 px-5 py-2 text-sm font-bold text-navy-900 transition-all hover:bg-gold-300 active:scale-95 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-gold-400"
          >
            {t.deck.select.makePuzzle(selected.size)}
          </button>
        </div>
      )}
    </div>
  )
}
