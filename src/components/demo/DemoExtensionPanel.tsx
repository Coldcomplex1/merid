import { Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'

// The extension popup's exact palette (merid-extension/popup.css :root).
// Raised controls (#1d2d50) and gold-button ink (#020c1b) appear as literals
// inside Tailwind classes below.
const BG = '#0a192f'
const CARD = '#112240'
const GOLD = '#f4be37'
const TEXT = '#e6f1ff'
const MUTED = '#8892b0'
const RING_OFF = '#3a4a6b'

export type PanelDataset = 'SAT' | 'C1' | 'C2' | 'All'
export type PanelMode = 'replace' | 'highlight' | 'beside'

export const PANEL_DATASETS: PanelDataset[] = ['SAT', 'C1', 'C2', 'All']
const MODES: { value: PanelMode; label: string }[] = [
  { value: 'replace', label: 'Replace' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'beside', label: 'Beside' },
]
const INTENSITY_LABELS = ['Casual', 'Focused', 'Locked-in']

interface DemoExtensionPanelProps {
  dataset: PanelDataset
  onDataset: (d: PanelDataset) => void
  /** 1 = Casual · 2 = Focused · 3 = Locked-in */
  intensity: number
  onIntensity: (v: number) => void
  mode: PanelMode
  onMode: (m: PanelMode) => void
  vieEng: boolean
  onVieEng: (v: boolean) => void
  engEng: boolean
  onEngEng: (v: boolean) => void
  enabled: boolean
  onToggleEnabled: () => void
  onRevert: () => void
}

function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h4
      className={`text-[13px] font-semibold tracking-[0.09em] uppercase ${className}`}
      style={{ color: GOLD }}
    >
      {children}
    </h4>
  )
}

function SettingLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[14px] ${className}`} style={{ color: TEXT }}>
      {children}
    </p>
  )
}

/** Pixel-faithful replica of the extension's popup, wired to the live demo. */
export default function DemoExtensionPanel({
  dataset,
  onDataset,
  intensity,
  onIntensity,
  mode,
  onMode,
  vieEng,
  onVieEng,
  engEng,
  onEngEng,
  enabled,
  onToggleEnabled,
  onRevert,
}: DemoExtensionPanelProps) {
  const pill = (active: boolean, size = 'py-2.5 text-[13px]') =>
    `cursor-pointer rounded-[5px] border text-center font-semibold transition-all duration-200 active:scale-95 ${size} ${
      active
        ? 'border-[#f4be37] bg-[#f4be37] text-[#020c1b]'
        : 'border-[#1d2d50] bg-[#1d2d50] text-[#8892b0] hover:border-[#f4be37] hover:text-[#f4be37]'
    }`

  return (
    <div
      className="w-full rounded-2xl p-6 shadow-panel ring-1 ring-navy-600/50"
      style={{ backgroundColor: BG }}
    >
      <h3 className="text-[26px] leading-none font-bold" style={{ color: TEXT }}>
        Merid
      </h3>

      <SectionTitle className="mt-7">Vocabulary dataset</SectionTitle>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {PANEL_DATASETS.map((d) => (
          <button key={d} type="button" onClick={() => onDataset(d)} className={pill(dataset === d)}>
            {d}
          </button>
        ))}
      </div>

      <SectionTitle className="mt-7">Main settings</SectionTitle>

      <SettingLabel className="mt-3">Highlight intensity</SettingLabel>
      <div className="mt-2.5 px-0.5">
        <input
          type="range"
          min={1}
          max={3}
          step={1}
          value={intensity}
          aria-label="Highlight intensity"
          onChange={(e) => onIntensity(Number(e.target.value))}
          className="slider-ext"
        />
        <div className="mt-2 flex justify-between">
          {INTENSITY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => onIntensity(i + 1)}
              className="cursor-pointer text-[10.5px] transition-colors"
              style={
                intensity === i + 1
                  ? ({ color: GOLD, fontWeight: 600 } as CSSProperties)
                  : ({ color: MUTED } as CSSProperties)
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SettingLabel className="mt-5">Display mode</SettingLabel>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onMode(m.value)}
            className={pill(mode === m.value, 'py-2 text-[12px]')}
          >
            {m.label}
          </button>
        ))}
      </div>

      <SettingLabel className="mt-5">Languages to scan</SettingLabel>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(
          [
            ['VIE → ENG', 'Replace Vietnamese words', vieEng, onVieEng],
            ['ENG → ENG', 'Swap for harder synonyms', engEng, onEngEng],
          ] as const
        ).map(([title, sub, active, setter]) => (
          <button
            key={title}
            type="button"
            aria-pressed={active}
            onClick={() => setter(!active)}
            className={`relative flex cursor-pointer flex-col gap-1 rounded-[10px] border p-3 pr-8 text-left transition-all duration-200 ${
              active
                ? 'border-[#f4be37] bg-[#f4be37]/12'
                : 'border-[#1d2d50] bg-[#1d2d50] hover:border-[#f4be37]'
            }`}
          >
            <span
              className="text-[13px] font-bold tracking-[0.02em]"
              style={{ color: active ? GOLD : TEXT }}
            >
              {title}
            </span>
            <span className="text-[10.5px] leading-[1.3]" style={{ color: MUTED }}>
              {sub}
            </span>
            <span
              aria-hidden="true"
              className="absolute top-2.5 right-2.5 h-[17px] w-[17px] rounded-full border-[1.5px] transition-all duration-200"
              style={
                active
                  ? { borderColor: GOLD, backgroundColor: GOLD, boxShadow: `inset 0 0 0 3px ${CARD}` }
                  : { borderColor: RING_OFF }
              }
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-[1.3]" style={{ color: MUTED }}>
        Turn on both to scan Vietnamese and English at once.
      </p>

      <button
        type="button"
        onClick={onToggleEnabled}
        className={`mt-6 w-full cursor-pointer rounded-[7px] border py-3.5 text-[15px] font-bold transition-all duration-300 active:scale-[0.98] ${
          enabled
            ? 'border-[#f4be37] bg-[#f4be37] text-[#020c1b]'
            : 'border-[#1d2d50] bg-[#1d2d50] text-[#8892b0] hover:border-[#f4be37] hover:text-[#f4be37]'
        }`}
      >
        {enabled ? 'Extension is ON' : 'Extension is OFF'}
      </button>

      <div className="mt-4 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={onRevert}
          className="cursor-pointer text-[13px] font-semibold hover:underline"
          style={{ color: GOLD }}
        >
          Revert this page
        </button>
        <Link
          to="/my-deck"
          className="text-[13px] font-semibold hover:underline"
          style={{ color: GOLD }}
        >
          My deck
        </Link>
        <button
          type="button"
          className="cursor-pointer text-[13px] font-semibold hover:underline"
          style={{ color: GOLD }}
        >
          Settings
        </button>
      </div>
    </div>
  )
}
