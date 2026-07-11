import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

/** Minimum gap (px) the element keeps from the viewport edges. */
const MARGIN = 8

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

interface Grab {
  pointerId: number
  startX: number
  startY: number
  left: number
  top: number
  width: number
  height: number
}

export interface Draggable {
  ref: RefObject<HTMLDivElement | null>
  /** True once picked up: apply `style` and drop the docked classes. */
  detached: boolean
  /** True only while a pointer is actively dragging. */
  dragging: boolean
  /** position:fixed placement while detached; undefined when docked. */
  style: CSSProperties | undefined
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  /** Return to the docked CSS position (clears the inline transform). */
  reset: () => void
}

/** Makes an element grabbable with a mouse or finger: on pointerdown it
 *  snapshots the current viewport rect, switches to position:fixed at that
 *  rect, then follows the pointer via translate3d, clamped to the viewport.
 *  Drags never start from interactive children (buttons, links, inputs), so
 *  those keep working normally. Dropped elements stay where they were left
 *  until `reset()` re-docks them. */
export function useDraggable(): Draggable {
  const ref = useRef<HTMLDivElement | null>(null)
  const grab = useRef<Grab | null>(null)
  const [detached, setDetached] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [base, setBase] = useState({ left: 0, top: 0, width: 0 })

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as Element).closest('button, a, input, textarea, select')) return
    const el = ref.current
    if (!el) return
    e.preventDefault() // no text selection while dragging
    // Measure the first child, not the wrapper: it carries the float
    // animation's translate, so the card is pinned exactly where it sits.
    const rect = (el.firstElementChild ?? el).getBoundingClientRect()
    grab.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
    el.style.transform = '' // rebase: fixed left/top carry the position again
    setBase({ left: rect.left, top: rect.top, width: rect.width })
    setDetached(true)
    setDragging(true)
    el.setPointerCapture(e.pointerId)
  }

  useEffect(() => {
    if (!dragging) return
    const el = ref.current
    const g = grab.current
    if (!el || !g) return

    const move = (e: PointerEvent) => {
      if (e.pointerId !== g.pointerId) return
      const left = clamp(g.left + (e.clientX - g.startX), MARGIN, window.innerWidth - g.width - MARGIN)
      const top = clamp(g.top + (e.clientY - g.startY), MARGIN, window.innerHeight - g.height - MARGIN)
      // Written directly so pointer moves never wait on a React render.
      el.style.transform = `translate3d(${left - g.left}px, ${top - g.top}px, 0)`
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== g.pointerId) return
      setDragging(false) // stays detached; the transform keeps the drop spot
    }

    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    el.addEventListener('lostpointercapture', end)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
      el.removeEventListener('lostpointercapture', end)
      if (grab.current && el.hasPointerCapture(grab.current.pointerId)) {
        el.releasePointerCapture(grab.current.pointerId)
      }
    }
  }, [dragging])

  const reset = () => {
    if (ref.current) ref.current.style.transform = ''
    grab.current = null
    setDragging(false)
    setDetached(false)
  }

  const style: CSSProperties | undefined = detached
    ? { position: 'fixed', left: base.left, top: base.top, width: base.width, bottom: 'auto', zIndex: 70 }
    : undefined

  return { ref, detached, dragging, style, onPointerDown, reset }
}
