import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Match DemoCursor's hotspot so the arrow tip lands exactly on the target.
const HOTSPOT_X = 5
const HOTSPOT_Y = 3
const BASE_MOVE_MS = 850

export interface GuideCursorHandle {
  /** Jump to a viewport point with no glide (used to set the start position). */
  place: (x: number, y: number) => void
  /** Glide the arrow tip to a viewport point over `ms` milliseconds. */
  moveTo: (x: number, y: number, ms?: number) => void
  show: () => void
  hide: () => void
}

/**
 * An automated "Merid" pointer that plays a short guided tour of the live demo:
 * it hovers a highlighted word or two, then travels up to the Facebook tab so
 * visitors notice the demo has more than one page.
 *
 * Purely cosmetic, like DemoCursor: it is portalled to <body> with
 * `pointer-events: none`, so it never intercepts input. LiveDemo owns the
 * timing and drives it imperatively through this handle. The visitor's own
 * gold "You" pointer stays separate; Merid's is a gold arrow with a navy label.
 */
const DemoGuideCursor = forwardRef<GuideCursorHandle>(function DemoGuideCursor(_props, ref) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)

  useImperativeHandle(ref, () => ({
    place(x, y) {
      const el = elRef.current
      if (!el) return
      el.style.transition = 'none'
      el.style.transform = `translate3d(${x - HOTSPOT_X}px, ${y - HOTSPOT_Y}px, 0)`
      // Force a reflow so the next transform change animates from here, not (0,0).
      void el.offsetWidth
      el.style.transition = ''
    },
    moveTo(x, y, ms = BASE_MOVE_MS) {
      const el = elRef.current
      if (!el) return
      el.style.transition = `transform ${ms}ms cubic-bezier(0.65, 0, 0.35, 1), opacity 200ms ease`
      el.style.transform = `translate3d(${x - HOTSPOT_X}px, ${y - HOTSPOT_Y}px, 0)`
    },
    show() {
      setActive(true)
    },
    hide() {
      setActive(false)
    },
  }), [])

  return createPortal(
    <div ref={elRef} aria-hidden="true" className={`demo-cursor demo-cursor--guide${active ? ' is-active' : ''}`}>
      <svg width="26" height="34" viewBox="0 0 26 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(11 5 3)">
          {/* Gold arrowhead with a navy rim, the inverse of the "You" pointer. */}
          <path
            d="M5 3 L5 19.8 L8.9 16.2 L15 14.4 Z"
            fill="#f5c542"
            stroke="#16213c"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
      </svg>
      <span className="demo-cursor__label">Merid</span>
    </div>,
    document.body,
  )
})

export default DemoGuideCursor
