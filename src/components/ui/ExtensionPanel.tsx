import { useState, type CSSProperties } from 'react'
import Toggle from './Toggle'
import { useInView } from '../../hooks/useInView'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const MASTERED: number[] = [2, 4, 1, 3, 2, 0, 1]
const FREQ_LABELS = ['Casual', 'Focused', 'Locked-in'] as const
const PANEL_DATASETS = ['SAT', 'C1', 'C2', 'All'] as const

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">{children}</p>
  )
}

/** Interactive recreation of the extension's settings sidebar. */
export default function ExtensionPanel({ className = '' }: { className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3)
  const [dataset, setDataset] = useState<(typeof PANEL_DATASETS)[number]>('SAT')
  const [freq, setFreq] = useState(2)
  const [replaceDirectly, setReplaceDirectly] = useState(true)
  const [vieEng, setVieEng] = useState(true)
  const [engEng, setEngEng] = useState(false)
  const [enabled, setEnabled] = useState(true)

  const masteredTotal = MASTERED.reduce((a, b) => a + b, 0)
  const maxBar = Math.max(...MASTERED, 1)

  return (
    <div
      ref={ref}
      className={`w-80 max-w-full rounded-3xl bg-navy-850 p-6 shadow-panel ring-1 ring-navy-600/50 transition-transform duration-300 hover:-translate-y-1 ${className}`}
    >
      <h3 className="text-[22px] font-bold text-gold-400">Merid</h3>

      <div className="mt-5">
        <SectionLabel>Words mastered this week</SectionLabel>
        <div className="mt-3 flex items-end justify-between border-b border-gold-400/60 pb-2">
          {DAYS.map((day, i) => (
            <div key={day} className="group flex w-8 flex-col items-center gap-1.5">
              <span
                className={`text-[9px] font-bold ${MASTERED[i] > 0 ? 'text-gold-300' : 'text-navy-500'}`}
              >
                {MASTERED[i] > 0 ? MASTERED[i] : ''}
              </span>
              <div className="flex h-12 items-end">
                <div
                  className={`w-2 origin-bottom rounded-full transition-colors ${
                    MASTERED[i] > 0 ? 'bg-gold-400 group-hover:bg-gold-300' : 'bg-navy-600'
                  } ${inView ? 'animate-bar-grow' : 'scale-y-0'}`}
                  style={{
                    height: `${Math.max((MASTERED[i] / maxBar) * 100, 8)}%`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
              </div>
              <span
                className={`text-[10px] font-semibold tracking-wide ${
                  day === 'tue' ? 'rounded border border-gold-400 px-1 text-gold-300' : 'text-navy-200'
                }`}
              >
                {day}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <SectionLabel>Vocabulary dataset</SectionLabel>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {PANEL_DATASETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDataset(d)}
              className={`cursor-pointer rounded-lg py-2 text-sm font-bold transition-all duration-200 active:scale-95 ${
                dataset === d
                  ? 'bg-gold-400 text-navy-900 shadow-[0_0_18px_-4px_rgb(245_197_66/0.8)]'
                  : 'bg-navy-700 text-navy-200 hover:bg-navy-600 hover:text-cream-50'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <SectionLabel>Main settings</SectionLabel>
        <p className="mt-3 text-sm text-cream-50">highlight frequency</p>
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={freq}
          aria-label="Highlight frequency"
          onChange={(e) => setFreq(Number(e.target.value))}
          className="slider-gold mt-3"
          style={{ '--slider-fill': `${(freq / 2) * 100}%` } as CSSProperties}
        />
        <div className="mt-1 flex justify-between">
          {FREQ_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setFreq(i)}
              className={`cursor-pointer text-[11px] transition-colors ${
                freq === i ? 'font-bold text-gold-400' : 'text-navy-300 hover:text-cream-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {(
          [
            ['Replace words directly', replaceDirectly, setReplaceDirectly],
            ['Vie - Eng mode', vieEng, setVieEng],
            ['Eng - Eng mode', engEng, setEngEng],
          ] as const
        ).map(([label, value, setter]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-sm text-cream-50">{label}</span>
            <Toggle on={value} onChange={setter} label={label} />
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-navy-200">
        You have mastered {masteredTotal} new vocabs this week.
      </p>

      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className={`mt-3 w-full cursor-pointer rounded-xl py-3 text-base font-bold transition-all duration-200 active:scale-[0.98] ${
          enabled
            ? 'bg-gold-400 text-navy-900 hover:bg-gold-300'
            : 'bg-navy-700 text-navy-200 ring-1 ring-navy-500 hover:bg-navy-600'
        }`}
      >
        {enabled ? 'Extension is ON' : 'Extension is OFF'}
      </button>
    </div>
  )
}
