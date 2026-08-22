import { useState } from 'react'
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

/** One dataset entry as a flashcard.
 *
 *  The front is the word and what it means - headword, part of speech, both
 *  IPAs, the Vietnamese and the definition - so a card can be read at a glance.
 *  The example, synonyms and antonyms live on the back: showing them up front
 *  made the grid unscannable, and hiding them is what lets you look at a word
 *  and test yourself before the sentence gives it away.
 *
 *  Flip mechanics are WordTile's, deliberately - same perspective, duration and
 *  arbitrary-value classes, so the two tabs turn a card the same way.
 *
 *  Two details that are load-bearing rather than stylistic:
 *
 *  - A face that is turned away is not painted but is still hit-tested, so each
 *    one drops its pointer events (and hides from screen readers) while it is
 *    at the back. Otherwise the reverse side silently swallows every click.
 *  - Neither face can *be* a button, because both carry buttons of their own
 *    (speaker and Save on the front, the speaker again on the back) and a
 *    <button> cannot contain buttons. So each face is a <div> whose first child
 *    is a full-bleed flip button at z-0, with the content layered over it as
 *    siblings at z-10. Clicking empty space still turns the card, and the
 *    controls do not double-fire. */
export default function ExploreTile({ entry, deckStatus, saving, onAdd }: Props) {
  const { t } = useLang()
  const e = t.deck.explore
  const [flipped, setFlipped] = useState(false)

  const savable = canSaveWord(entry.key)
  const phonetics = [entry.phonBr, entry.phonAm].filter(Boolean)
  // The two IPAs are identical for most words; showing one twice is noise.
  const pron = phonetics[0] === phonetics[1] ? phonetics.slice(0, 1) : phonetics
  const hasBack = Boolean(entry.example) || entry.synonyms.length > 0 || entry.antonyms.length > 0

  const badge = 'rounded-full px-2 py-0.5 text-[10px] font-bold'
  // Only the BACK is absolutely positioned. Leaving the front in normal flow is
  // what lets a card be as tall as the word it holds: definitions are p50 48
  // characters but run to 346, and pinning every tile to a height that fits the
  // long tail left most of the grid half empty. The floor keeps the shortest
  // cards from looking cramped; the back then inherits the front's box and
  // scrolls inside it, so flipping never resizes the card.
  const faceBase = 'flex flex-col rounded-xl border border-line [backface-visibility:hidden]'
  const speakerButton = 'relative z-10 cursor-pointer text-muted transition-colors hover:text-accent'

  return (
    <li className="[perspective:1000px]">
      <div
        className="relative min-h-[10rem] transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
      >
        {/* Front */}
        <div
          aria-hidden={flipped}
          className={`${faceBase} relative h-full bg-surface p-4 transition-colors hover:border-line-strong ${
            flipped ? 'pointer-events-none' : ''
          }`}
        >
          {hasBack && (
            <button
              type="button"
              tabIndex={flipped ? -1 : undefined}
              onClick={() => setFlipped(true)}
              aria-label={e.flip(entry.word)}
              className="absolute inset-0 z-0 cursor-pointer rounded-xl"
            />
          )}

          {/* Above the flip button but transparent to it, so the empty space
              around a short definition stays tappable. */}
          <div className="pointer-events-none relative z-10 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 lang="en" className="text-base font-bold break-words text-heading">
                  {entry.word}
                </h3>
                {entry.pos && <span className="text-xs text-muted italic">{entry.pos}</span>}
                <button
                  type="button"
                  tabIndex={flipped ? -1 : undefined}
                  onClick={() => speak(entry.word)}
                  aria-label={t.deck.play(entry.word)}
                  className={`pointer-events-auto ${speakerButton}`}
                >
                  <SpeakerIcon size={13} />
                </button>
              </div>

              {pron.length > 0 && <p className="mt-0.5 text-xs text-faint">{pron.join('  ')}</p>}
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
                  tabIndex={flipped ? -1 : undefined}
                  disabled={!savable || saving}
                  onClick={() => onAdd(entry)}
                  aria-label={e.add(entry.word)}
                  title={savable ? undefined : e.cannotSave}
                  className="pointer-events-auto relative z-10 inline-flex cursor-pointer items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[11px] font-bold text-body transition-colors hover:border-accent hover:text-accent active:scale-95 disabled:cursor-default disabled:opacity-45 disabled:hover:border-line-strong disabled:hover:text-body"
                >
                  {saving ? <CheckIcon size={10} /> : <PlusIcon size={10} />}
                  {saving ? e.saving : e.save}
                </button>
              )}
            </div>
          </div>

          <div className="pointer-events-none relative z-10 mt-2">
            {entry.vietnamese && (
              <p lang="vi" className="text-sm font-bold text-accent">
                {entry.vietnamese}
              </p>
            )}
            {entry.definition && (
              <p lang="en" className="mt-1 text-sm leading-relaxed text-body">
                {entry.definition}
              </p>
            )}
          </div>
        </div>

        {/* Back */}
        <div
          aria-hidden={!flipped}
          className={`${faceBase} absolute inset-0 bg-surface-2 px-4 py-3 [transform:rotateY(180deg)] ${
            flipped ? '' : 'pointer-events-none'
          }`}
        >
          <button
            type="button"
            tabIndex={flipped ? undefined : -1}
            onClick={() => setFlipped(false)}
            aria-label={e.flipBack(entry.word)}
            className="absolute inset-0 z-0 cursor-pointer rounded-xl"
          />

          <div className="pointer-events-none relative z-10 flex items-baseline gap-2">
            <h3 lang="en" className="text-sm font-bold break-words text-heading">
              {entry.word}
            </h3>
            <button
              type="button"
              tabIndex={flipped ? undefined : -1}
              onClick={() => speak(entry.word)}
              aria-label={t.deck.play(entry.word)}
              className={`pointer-events-auto ${speakerButton}`}
            >
              <SpeakerIcon size={12} />
            </button>
          </div>

          {/* Labels sit inline with their values rather than on their own line.
              The card is only as tall as its front, and stacking three
              label-over-value pairs pushed the antonyms out of view on a
              typical word - inline, the whole back fits without scrolling. */}
          <div className="pointer-events-none relative z-10 mt-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {entry.example && (
              <p
                lang="en"
                className="border-l-2 border-line-strong pl-2.5 text-xs leading-relaxed text-body italic"
              >
                {entry.example}
              </p>
            )}

            {entry.synonyms.length > 0 && (
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-semibold text-faint">{e.synonyms} </span>
                <span lang="en">{entry.synonyms.join(', ')}</span>
              </p>
            )}

            {entry.antonyms.length > 0 && (
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-semibold text-faint">{e.antonyms} </span>
                <span lang="en">{entry.antonyms.join(', ')}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
