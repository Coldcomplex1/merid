import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// The arrow's tip sits at (5, 3) inside the SVG viewBox, so we offset the
// overlay by that much to keep the pointer hotspot exactly under the mouse.
const HOTSPOT_X = 5
const HOTSPOT_Y = 3

/**
 * Wraps the fake browser so that, on pointer devices, the visitor's cursor
 * turns into a labelled "You" pointer — the collaborative-presence style you
 * see when a teammate shares a live session (and the same look Claude uses
 * when it's driving a page for you).
 *
 * It is purely cosmetic: the overlay is `pointer-events: none` and portalled to
 * <body>, so hovering vocabulary words, scrolling and clicking the demo all
 * behave exactly as before. Touch devices (no cursor) are left untouched.
 */
export default function DemoCursorZone({ children }: { children: ReactNode }) {
  const zoneRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const zone = zoneRef.current
    const cursor = cursorRef.current
    if (!zone || !cursor) return
    // A labelled cursor only makes sense where a real pointer exists.
    if (!window.matchMedia('(any-pointer: fine)').matches) return

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      cursor.style.transform = `translate3d(${e.clientX - HOTSPOT_X}px, ${e.clientY - HOTSPOT_Y}px, 0)`
      setActive(true)
    }
    const hide = () => setActive(false)
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') hide()
    }

    zone.addEventListener('pointermove', onMove)
    zone.addEventListener('pointerleave', hide)
    zone.addEventListener('pointercancel', hide)
    zone.addEventListener('pointerdown', onDown)
    return () => {
      zone.removeEventListener('pointermove', onMove)
      zone.removeEventListener('pointerleave', hide)
      zone.removeEventListener('pointercancel', hide)
      zone.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return (
    <div ref={zoneRef} className={`demo-cursor-zone${active ? ' is-active' : ''}`}>
      {children}
      {createPortal(
        <div ref={cursorRef} aria-hidden="true" className={`demo-cursor${active ? ' is-active' : ''}`}>
          <svg width="26" height="34" viewBox="0 0 26 34" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(11 5 3)">
              <path
                d="M5 3 L5 22 L10.2 17.2 L13.6 24.6 L16.6 23.2 L13.2 16 L20.4 15.8 Z"
                fill="#2E86FF"
                stroke="#ffffff"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          </svg>
          <span className="demo-cursor__label">You</span>
        </div>,
        document.body,
      )}
    </div>
  )
}
