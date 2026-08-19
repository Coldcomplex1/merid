import { useLang } from '../../i18n/LanguageContext'
import type { ExploreEntry } from '../../data/exploreDatasets'
import type { WordStatus } from '../../deck/DeckSource'
import { canSaveWord } from '../../deck/DeckSource'
import { speak } from '../../lib/speech'
import SpeakerIcon from '../ui/SpeakerIcon'
import { CheckIcon, PlusIcon } from '../ui/DeckIcons'

interface Props {
  entry: ExploreEntry
  /** The word's status in the user's deck, or null when it is not in it. */
  deckStatus: WordStatus | null
  /** True while this word's save is in flight. */
  saving: boolean
  onAdd: (entry: ExploreEntry) => void
}

/** One dataset entry, open on the page.
 *
 *  Deliberately not WordTile. That component is bound to DeckWord and its
 *  affordances - flip, select, mark known, remove - are all operations on a
 *  word you already own. An Explore entry is a reference card: everything it
 *  knows is visible at once (both IPAs, the example, synonyms and antonyms,
 *  which datasets it belongs to), and the only action is adding it.
 *
 *  Flat markup for the same reason: Explore paints hundreds of these, so there
 *  is no 3D transform and no second face to hit-test. */
export default function ExploreTile({ entry, deckStatus, saving, onAdd }: Props) {
  const { t } = useLang()
  const e = t.deck.explore

  const savable = canSaveWord(entry.key)
  const phonetics = [entry.phonBr, entry.phonAm].filter(Boolean)
  // The two IPAs are identical for most words; showing one twice is noise.
  const pron = phonetics[0] === phonetics[1] ? phonetics.slice(0, 1) : phonetics

  const badge = 'rounded-full px-2 py-0.5 text-[10px] font-bold'

  return (
    <li className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 lang="en" className="text-base font-bold break-words text-heading">
              {entry.word}
            </h3>
            {entry.pos && <span className="text-xs text-muted italic">{entry.pos}</span>}
            <button
              type="button"
              onClick={() => speak(entry.word)}
              aria-label={t.deck.play(entry.word)}
              className="cursor-pointer text-muted transition-colors hover:text-accent"
            >
              <SpeakerIcon size={13} />
            </button>
          </div>

          {pron.length > 0 && (
            <p className="mt-0.5 text-xs text-faint">{pron.join('  ')}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {entry.datasets.map((tag) => (
            <span key={tag} className={`${badge} bg-surface-2 text-muted`}>
              {tag}
            </span>
          ))}

          {deckStatus === 'known' ? (
            <span className={`${badge} bg-success/15 text-success`}>{e.known}</span>
          ) : deckStatus === 'saved' ? (
            <span className={`${badge} bg-gold-400/15 text-accent`}>{e.inDeck}</span>
          ) : (
            <button
              type="button"
              disabled={!savable || saving}
              onClick={() => onAdd(entry)}
              aria-label={e.add(entry.word)}
              title={savable ? undefined : e.cannotSave}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-bold text-body transition-colors hover:border-accent hover:text-accent active:scale-95 disabled:cursor-default disabled:opacity-45 disabled:hover:border-line-strong disabled:hover:text-body"
            >
              {saving ? <CheckIcon size={10} /> : <PlusIcon size={10} />}
              {saving ? e.saving : e.save}
            </button>
          )}
        </div>
      </div>

      {entry.vietnamese && (
        <p lang="vi" className="mt-2 text-sm font-bold text-accent">
          {entry.vietnamese}
        </p>
      )}
      {entry.definition && (
        <p lang="en" className="mt-1 text-sm leading-relaxed text-body">
          {entry.definition}
        </p>
      )}
      {entry.example && (
        <p lang="en" className="mt-1.5 border-l-2 border-line-strong pl-3 text-xs leading-relaxed text-muted italic">
          {entry.example}
        </p>
      )}

      {(entry.synonyms.length > 0 || entry.antonyms.length > 0) && (
        <dl className="mt-2.5 flex flex-col gap-1 text-xs">
          {entry.synonyms.length > 0 && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold text-faint">{e.synonyms}</dt>
              <dd lang="en" className="text-muted">{entry.synonyms.join(', ')}</dd>
            </div>
          )}
          {entry.antonyms.length > 0 && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold text-faint">{e.antonyms}</dt>
              <dd lang="en" className="text-muted">{entry.antonyms.join(', ')}</dd>
            </div>
          )}
        </dl>
      )}
    </li>
  )
}
