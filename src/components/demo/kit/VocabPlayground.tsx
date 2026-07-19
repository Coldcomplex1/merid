import { useRef, type ReactNode } from 'react'
import type { VocabEntry } from '../../../data/vocab'
import VocabPopupCard from '../../ui/VocabPopupCard'
import { useAnchoredCard } from './useAnchoredCard'

export interface PlaygroundContext {
  /** Render one interactive vocabulary word. `label` is the visible text
   *  (already resolved for the current display mode). */
  renderWord: (entry: VocabEntry, label: string, key: string) => ReactNode
  /** Close the hover card (e.g. before re-rendering the article). */
  closeCard: () => void
}

interface VocabPlaygroundProps {
  /** Words already saved to the demo deck (controls the card's Save button). */
  savedIds: Set<string>
  onSave: (entry: VocabEntry) => void
  /** "I know this": the owner removes the word from its rendered state. */
  onKnow?: (entry: VocabEntry) => void
  /** Fires the first time (and every time) a card opens - used by the
   *  onboarding checklist to tick "you hovered a word". */
  onOpen?: (entry: VocabEntry) => void
  /** Outer wrapper (positioning/size). */
  className?: string
  /** The scrollable viewport, when the mockup page scrolls. Defaults to a
   *  non-scrolling block. */
  scrollerClassName?: string
  children: (ctx: PlaygroundContext) => ReactNode
}

/**
 * Shared shell for every "the extension is running on this text" mockup:
 * wires gold words to the anchored learning card (hover + tap, flip above /
 * below, hide-grace) exactly like the homepage live demo and the real
 * extension. Content is supplied by the caller through a render prop.
 */
export default function VocabPlayground({
  savedIds,
  onSave,
  onKnow,
  onOpen,
  className = '',
  scrollerClassName = '',
  children,
}: VocabPlaygroundProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const { anchor, placement, cardRef, openPopup, close, cancelHide, scheduleHide } =
    useAnchoredCard(scrollerRef, contentRef)

  const renderWord = (entry: VocabEntry, label: string, key: string) => (
    <button
      key={key}
      type="button"
      data-vocab-word
      data-vocab-id={entry.id}
      className="hl-en text-inherit"
      onMouseEnter={(e) => {
        openPopup(e.currentTarget, entry)
        onOpen?.(entry)
      }}
      onMouseLeave={scheduleHide}
      onClick={(e) => {
        openPopup(e.currentTarget, entry)
        onOpen?.(entry)
      }}
    >
      {label}
    </button>
  )

  // Tapping the page background (mobile has no mouse-out) dismisses the card.
  const handlePagePointerDown = (e: React.PointerEvent) => {
    const el = e.target as HTMLElement
    if (el.closest('[data-vocab-card]') || el.closest('[data-vocab-word]')) return
    close()
  }

  return (
    <div className={className}>
      <div ref={scrollerRef} className={scrollerClassName || 'relative'}>
        <div ref={contentRef} className="relative min-h-full" onPointerDown={handlePagePointerDown}>
          {children({ renderWord, closeCard: close })}

          {anchor && (
            <div
              key={anchor.entry.id}
              ref={cardRef}
              data-vocab-card
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
              className={`absolute z-30 ${
                placement
                  ? placement.place === 'above'
                    ? 'animate-card-in-down'
                    : 'animate-card-in'
                  : 'invisible'
              }`}
              style={{
                width: anchor.cardW,
                ...(placement ? placement.pos : { left: anchor.left, top: anchor.bottom + 10 }),
              }}
            >
              <VocabPopupCard
                entry={anchor.entry}
                saved={savedIds.has(anchor.entry.id)}
                onSave={() => onSave(anchor.entry)}
                onKnow={
                  onKnow
                    ? () => {
                        onKnow(anchor.entry)
                        close()
                      }
                    : undefined
                }
                onClose={close}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
