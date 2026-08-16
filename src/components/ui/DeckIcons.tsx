/** The small glyphs the deck Library uses: its title mark, the icon inside each
 *  filter control, and the chevron those controls need once `appearance-none`
 *  has removed the browser's own.
 *
 *  Inline SVG rather than an icon font or a package - the site ships exactly one
 *  other icon this way (SpeakerIcon) and these are a handful of paths. Every one
 *  draws in `currentColor`, so they inherit the themed token of whatever they
 *  sit inside instead of carrying their own colour.
 *
 *  `className` is passed through because several of them are positioned over a
 *  <select>, which needs the caller to place them. */
interface IconProps {
  size?: number
  className?: string
}

function svgProps(size: number, className?: string) {
  return {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    className,
    'aria-hidden': true as const,
    focusable: 'false' as const,
  }
}

/** Two offset cards - the deck itself, beside the page title. */
export function CardsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect
        x="7.5"
        y="3.5"
        width="13"
        height="13"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M16.5 20.5h-9a4 4 0 0 1-4-4v-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Ascending bars - difficulty. */
export function LevelIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <g fill="currentColor">
        <rect x="4" y="14" width="3.5" height="6" rx="1.2" />
        <rect x="10.25" y="9" width="3.5" height="11" rx="1.2" />
        <rect x="16.5" y="4" width="3.5" height="16" rx="1.2" />
      </g>
    </svg>
  )
}

/** A dial part-filled - progress through the deck. */
export function ProgressIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 3.75A8.25 8.25 0 0 1 20.25 12H12z" fill="currentColor" />
    </svg>
  )
}

/** Four tiles - the grid view. */
export function GridIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <g fill="currentColor">
        <rect x="4" y="4" width="7" height="7" rx="2" />
        <rect x="13" y="4" width="7" height="7" rx="2" />
        <rect x="4" y="13" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="7" height="7" rx="2" />
      </g>
    </svg>
  )
}

export function ChevronIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="m6 9.5 6 5.5 6-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SearchIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="11" cy="11" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="m15.75 15.75 3.75 3.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** The tick on a selected tile. */
export function CheckIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="m5 12.5 4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CloseIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M6.5 6.5l11 11m0-11-11 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Filled triangle - the "play this set" mark on a live collection. */
export function PlayIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  )
}
