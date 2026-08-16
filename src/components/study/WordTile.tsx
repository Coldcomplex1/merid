import { useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord, WordStatus } from '../../deck/DeckSource'
import { speak } from '../../lib/speech'
import SpeakerIcon from '../ui/SpeakerIcon'
import { CheckIcon, CloseIcon } from '../ui/DeckIcons'

interface Props {
  word: DeckWord
  onRemove: (word: string) => void
  onSetStatus: (word: string, status: WordStatus) => void
  /** Selection mode. While on, a tile picks instead of flipping. */
  selecting: boolean
  isChosen: boolean
  onToggleSelect: (word: string) => void
}

/** Border and pill per status. Only two statuses exist ('saved' | 'known'), so
 *  there are only two colours: gold for a word still being learned, green for
 *  one marked known - the same pairing the stat dots on this page already use.
 *  Both are themed tokens, so they re-tint rather than wash out in dark mode. */
const STATUS_STYLE: Record<WordStatus, { border: string; pill: string }> = {
  saved: { border: 'border-gold-400/70', pill: 'bg-gold-400/15 text-accent' },
  known: { border: 'border-success/45', pill: 'bg-success/15 text-success' },
}

/** One word in the Library grid: the word on the front, its meaning and the
 *  actions on the back.
 *
 *  The flip is the one from FlashcardMode, shrunk to a tile - but a tile needs
 *  three buttons on its flipped face, and a <button> cannot contain buttons.
 *  So only the *front* is a button. The back is a plain <div> whose first child
 *  is a full-bleed "flip back" button at z-0, with the text and the action
 *  buttons layered above it as siblings rather than children. Clicking anywhere
 *  in the empty space still turns the card back over, and the actions do not
 *  double-fire.
 *
 *  A face that is turned away is not painted, but it is still hit-tested, so
 *  each face also drops its pointer events (and hides from screen readers)
 *  while it is at the back - otherwise the reverse side silently swallows every
 *  click. */
export default function WordTile({
  word: w,
  onRemove,
  onSetStatus,
  selecting,
  isChosen,
  onToggleSelect,
}: Props) {
  const { t } = useLang()
  const [flipped, setFlipped] = useState(false)

  // Only words still being learned can join a puzzle set, so a known word is
  // inert while picking - the same rule the list view applies.
  const canSelect = selecting && w.status === 'saved'
  // Picking takes precedence over reading: while selection is on, every tile
  // shows its front. Turning selection off restores whatever was open before.
  const showBack = flipped && !selecting

  const style = STATUS_STYLE[w.status]
  const faceBase =
    'absolute inset-0 rounded-xl border-2 transition-shadow [backface-visibility:hidden]'
  const frontBorder = isChosen ? 'border-accent/60 bg-accent/10' : `${style.border} bg-surface`

  const action =
    'flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-muted transition-colors active:scale-95'

  return (
    <li className="[perspective:1000px]">
      <div
        className="relative min-h-28 transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: showBack ? 'rotateY(180deg)' : undefined }}
      >
        {/* Front */}
        <button
          type="button"
          disabled={selecting && !canSelect}
          aria-hidden={showBack}
          aria-pressed={selecting ? isChosen : undefined}
          aria-label={selecting ? t.deck.select.toggle(w.word) : t.deck.library.flip(w.word)}
          onClick={() => (selecting ? onToggleSelect(w.word) : setFlipped(true))}
          className={`${faceBase} ${frontBorder} flex cursor-pointer flex-col items-center justify-center gap-2 px-3 hover:shadow-soft disabled:cursor-default disabled:opacity-45 disabled:hover:shadow-none ${
            showBack ? 'pointer-events-none' : ''
          }`}
        >
          <span lang="en" className="text-center text-sm font-bold break-words text-heading">
            {w.word}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${style.pill}`}>
            {w.status === 'known' ? t.deck.knownLabel : t.deck.savedLabel}
          </span>

          {canSelect && (
            <span
              className={`absolute top-2 right-2 flex h-4.5 w-4.5 items-center justify-center rounded-full border ${
                isChosen ? 'border-accent bg-accent text-surface' : 'border-line-strong'
              }`}
              aria-hidden="true"
            >
              {isChosen && <CheckIcon size={10} />}
            </span>
          )}
        </button>

        {/* Back */}
        <div
          aria-hidden={!showBack}
          className={`${faceBase} ${style.border} flex flex-col bg-surface-2 p-2.5 [transform:rotateY(180deg)] ${
            showBack ? '' : 'pointer-events-none'
          }`}
        >
          <button
            type="button"
            tabIndex={showBack ? undefined : -1}
            onClick={() => setFlipped(false)}
            aria-label={t.deck.library.flipBack(w.word)}
            className="absolute inset-0 z-0 cursor-pointer rounded-xl"
          />

          {/* Sits above the flip-back button but must not intercept its clicks,
              so the empty space around short meanings stays tappable. */}
          <div className="pointer-events-none relative z-10 min-h-0 flex-1 overflow-y-auto text-center">
            {w.vietnamese && (
              <p lang="vi" className="text-xs leading-snug font-bold text-accent">
                {w.vietnamese}
              </p>
            )}
            {w.definition && (
              <p lang="en" className="mt-1 text-[11px] leading-snug text-body">
                {w.definition}
              </p>
            )}
            {!w.vietnamese && !w.definition && (
              <p className="text-[11px] text-muted italic">{t.deck.library.noMeaning}</p>
            )}
          </div>

          <div className="relative z-10 mt-1.5 flex shrink-0 items-center justify-center gap-1.5">
            <button
              type="button"
              tabIndex={showBack ? undefined : -1}
              onClick={() => speak(w.word)}
              aria-label={t.deck.play(w.word)}
              className={`${action} hover:border-accent hover:text-accent`}
            >
              <SpeakerIcon size={13} />
            </button>
            <button
              type="button"
              tabIndex={showBack ? undefined : -1}
              onClick={() => onSetStatus(w.word, w.status === 'known' ? 'saved' : 'known')}
              aria-label={w.status === 'known' ? t.deck.markSaved : t.deck.markKnown}
              className={`${action} ${
                w.status === 'known'
                  ? 'border-success/50 text-success'
                  : 'hover:border-success hover:text-success'
              }`}
            >
              <CheckIcon size={12} />
            </button>
            <button
              type="button"
              tabIndex={showBack ? undefined : -1}
              onClick={() => {
                if (window.confirm(t.deck.confirmRemove)) onRemove(w.word)
              }}
              aria-label={`${t.deck.remove} ${w.word}`}
              className={`${action} hover:border-danger hover:text-danger`}
            >
              <CloseIcon size={11} />
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}
