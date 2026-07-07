interface ToggleProps {
  on: boolean
  onChange: (next: boolean) => void
  label: string
  /** 'dark' = sits on a navy panel, 'light' = sits on a cream card */
  surface?: 'dark' | 'light'
}

/** Extension-style pill toggle with a sliding knob. */
export default function Toggle({ on, onChange, label, surface = 'dark' }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-13 shrink-0 cursor-pointer rounded-full transition-colors duration-300 active:scale-95 ${
        on
          ? 'bg-gold-400/25 ring-1 ring-gold-400/60'
          : surface === 'dark'
            ? 'bg-navy-600 ring-1 ring-navy-500/50'
            : 'bg-navy-200 ring-1 ring-navy-300/60'
      }`}
    >
      <span
        className={`absolute top-1 left-1 h-5 w-5 rounded-full shadow transition-all duration-300 ${
          on ? 'translate-x-6 bg-gold-400' : `translate-x-0 ${surface === 'dark' ? 'bg-navy-300' : 'bg-white'}`
        }`}
      />
    </button>
  )
}
