import { useLang } from '../../i18n/LanguageContext'
import { MIN_PUZZLE_WORDS } from './PuzzleMode'

interface Props {
  chosen: number
  onMakePuzzle: () => void
}

/** Confirm bar for building a collection out of picked words.
 *
 *  Lifted out of WordList so the grid and the list share one - the pick itself
 *  now starts from "New collection" above the grid, and both views feed the
 *  same `selected` set.
 *
 *  Sticks to the bottom of the viewport: picking runs the length of a long
 *  deck, and the button has to stay reachable while you scroll it. */
export default function SelectionBar({ chosen, onMakePuzzle }: Props) {
  const { t } = useLang()
  const enough = chosen >= MIN_PUZZLE_WORDS

  return (
    <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface/95 p-3 shadow-soft backdrop-blur-md">
      <span className="pl-2 text-sm font-semibold text-body">
        {enough ? t.deck.select.chosen(chosen) : t.deck.select.needFour}
      </span>
      <button
        type="button"
        disabled={!enough}
        onClick={onMakePuzzle}
        className="rounded-full bg-gold-400 px-5 py-2 text-sm font-bold text-navy-900 transition-all hover:bg-gold-300 active:scale-95 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-gold-400"
      >
        {t.deck.select.makePuzzle(chosen)}
      </button>
    </div>
  )
}
