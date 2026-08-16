import type { DeckWord, WordStatus } from '../../deck/DeckSource'
import WordTile from './WordTile'

interface Props {
  words: DeckWord[]
  onRemove: (word: string) => void
  onSetStatus: (word: string, status: WordStatus) => void
  selecting: boolean
  selected: Set<string>
  onToggleSelect: (word: string) => void
}

/** The Library's card grid: five across on a wide screen, two on a phone.
 *
 *  Still a list in the markup - the tiles are an unordered set of words, and
 *  keeping <ul>/<li> is what tells a screen reader how many there are and where
 *  it is in them. `grid` on the <ul> only changes how they are placed.
 *
 *  Deliberately not virtualized. A deck is tens to low hundreds of words, the
 *  toolbar narrows it further, and a windowing library would have to own the
 *  scroll container - which fights the per-tile 3D transform for no measurable
 *  gain at this size. */
export default function WordGrid({
  words,
  onRemove,
  onSetStatus,
  selecting,
  selected,
  onToggleSelect,
}: Props) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
      {words.map((w) => (
        <WordTile
          key={w.word}
          word={w}
          onRemove={onRemove}
          onSetStatus={onSetStatus}
          selecting={selecting}
          isChosen={selected.has(w.word)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </ul>
  )
}
