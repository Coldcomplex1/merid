import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { VocabEntry } from '../../../data/vocab'

const CARD_WIDTH = 312
const CARD_GAP = 10 // the extension offsets the card 10px from the word
const FLIP_BUFFER = 20 // extension's buffer when deciding to flip above
const HIDE_GRACE_MS = 120 // extension's grace period before hiding on mouse-out

/** Word geometry captured on hover; the card places itself after measuring. */
export interface Anchor {
  entry: VocabEntry
  cardW: number
  left: number // clamped card-left, relative to the page content
  top: number // word top, relative to the page content
  bottom: number // word bottom, relative to the page content
  spaceAbove: number // room above the word inside the visible scroller
  spaceBelow: number // room below the word inside the visible scroller
  contentH: number
}

export interface Placement {
  pos: CSSProperties
  place: 'below' | 'above'
}

/**
 * The extension's hover-card behaviour, shared by every interactive demo:
 * anchor a card to a word inside a (possibly scrollable) mockup page, flip it
 * above the word when there is no room below, and keep it open across the
 * word→card mouse travel with the same grace period the extension uses.
 *
 * `scrollerRef` is the visible viewport (the overflow container) and
 * `contentRef` the positioned page the card is absolutely placed in. They may
 * point at the same element when the mockup does not scroll.
 */
export function useAnchoredCard(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    },
    [],
  )

  const cancelHide = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }

  const close = () => {
    cancelHide()
    setAnchor(null)
  }

  const scheduleHide = () => {
    cancelHide()
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null
      setAnchor(null)
    }, HIDE_GRACE_MS)
  }

  const openPopup = (target: HTMLElement, entry: VocabEntry) => {
    if (!scrollerRef.current || !contentRef.current) return
    cancelHide()
    const wordRect = target.getBoundingClientRect()
    const contentRect = contentRef.current.getBoundingClientRect()
    const scrollerRect = scrollerRef.current.getBoundingClientRect()
    const cardW = Math.min(CARD_WIDTH, contentRect.width - 16)
    const rawLeft = wordRect.left - contentRect.left + wordRect.width / 2 - cardW / 2
    setAnchor({
      entry,
      cardW,
      left: Math.max(8, Math.min(rawLeft, contentRect.width - cardW - 8)),
      top: wordRect.top - contentRect.top,
      bottom: wordRect.bottom - contentRect.top,
      spaceAbove: wordRect.top - scrollerRect.top,
      spaceBelow: scrollerRect.bottom - wordRect.bottom,
      contentH: contentRect.height,
    })
  }

  // Mirror the extension: render the card, measure it, then flip it above the
  // word when the visible space below is too small (and above is enough).
  useLayoutEffect(() => {
    if (!anchor) {
      setPlacement(null)
      return
    }
    const cardH = cardRef.current?.offsetHeight ?? 400
    const flipAbove =
      anchor.spaceBelow < cardH + FLIP_BUFFER && anchor.spaceAbove > cardH + FLIP_BUFFER
    setPlacement(
      flipAbove
        ? { place: 'above', pos: { left: anchor.left, bottom: anchor.contentH - anchor.top + CARD_GAP } }
        : { place: 'below', pos: { left: anchor.left, top: anchor.bottom + CARD_GAP } },
    )
  }, [anchor])

  return { anchor, placement, cardRef, openPopup, close, cancelHide, scheduleHide, CARD_GAP }
}
