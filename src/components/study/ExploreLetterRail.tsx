import { useLang } from '../../i18n/LanguageContext'

/** Every headword in the shipped datasets starts with a plain a-z letter -
 *  verified against the generated JSON, so the alphabet needs no "#" bucket for
 *  digits or punctuation. Entries whose spelling carries a diacritic (`façade`,
 *  `naïve`) are keyed by their normalized form, which is still ASCII. */
const ALPHABET = [...'abcdefghijklmnopqrstuvwxyz']

interface Props {
  /** The active letter, or null for the whole list. */
  letter: string | null
  onLetter: (next: string | null) => void
  /** Letter -> how many entries the current dataset and search leave under it.
   *  A letter missing from the map has none and is not clickable: C1 ships no
   *  `x` or `z`, SAT no `x`, and a search narrows things much further. */
  counts: Map<string, number>
}

/** The A-Z rail beside the Explore grid.
 *
 *  It filters rather than scrolls. The grid pages 60 tiles at a time, so the
 *  first `s` word sits about two thousand rows past anything rendered - there is
 *  nothing on the page to scroll to. Narrowing to the letter gets you there in
 *  one click and keeps the DOM small, which is what the rail is for.
 *
 *  Sticky, so it stays reachable while you scroll a long letter. */
export default function ExploreLetterRail({ letter, onLetter, counts }: Props) {
  const { t } = useLang()
  const e = t.deck.explore

  const cell =
    'flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold uppercase transition-colors'

  return (
    <nav
      aria-label={e.letters}
      className="sticky top-20 flex shrink-0 flex-col items-center gap-0.5 self-start rounded-full border border-line bg-surface py-2"
    >
      <button
        type="button"
        onClick={() => onLetter(null)}
        aria-pressed={letter === null}
        title={e.allLetters}
        aria-label={e.allLetters}
        className={`${cell} cursor-pointer ${
          letter === null ? 'bg-accent text-navy-900' : 'text-muted hover:bg-surface-2 hover:text-heading'
        }`}
      >
        ★
      </button>

      {ALPHABET.map((l) => {
        const count = counts.get(l) ?? 0
        const active = letter === l
        return (
          <button
            key={l}
            type="button"
            disabled={count === 0}
            // Clicking the active letter clears it, so the rail can undo itself
            // without reaching for the star.
            onClick={() => onLetter(active ? null : l)}
            aria-pressed={active}
            aria-label={e.jumpTo(l.toUpperCase())}
            className={`${cell} ${
              active
                ? 'bg-accent text-navy-900'
                : count === 0
                  ? 'cursor-default text-faint/45'
                  : 'cursor-pointer text-muted hover:bg-surface-2 hover:text-heading'
            }`}
          >
            {l}
          </button>
        )
      })}
    </nav>
  )
}
