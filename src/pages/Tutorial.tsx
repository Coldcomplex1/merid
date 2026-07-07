import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import ExtensionPanel from '../components/ui/ExtensionPanel'
import VocabPopupCard from '../components/ui/VocabPopupCard'
import Toggle from '../components/ui/Toggle'
import { VOCAB } from '../data/vocab'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

/* ── Step layout ─────────────────────────────────────────────── */

interface StepProps {
  number: string
  title: string
  children: ReactNode
  visual: ReactNode
  caption?: string
}

function Step({ number, title, children, visual, caption }: StepProps) {
  return (
    <Reveal>
      <div className="grid items-center gap-10 rounded-3xl bg-navy-850/60 p-8 ring-1 ring-navy-600/40 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="text-5xl font-extrabold text-gold-400/30">{number}</span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-cream-50 sm:text-3xl">
            {title}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-navy-200">{children}</div>
        </div>
        <div className="flex flex-col items-center gap-3">
          {visual}
          {caption && <p className="text-xs font-semibold text-gold-300">{caption}</p>}
        </div>
      </div>
    </Reveal>
  )
}

function Bullet({ term, children }: { term: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
      <span>
        <span className="font-bold text-cream-50">{term}</span> {children}
      </span>
    </li>
  )
}

/* ── Step visuals ────────────────────────────────────────────── */

function ToolbarDemo({ caption }: { caption: string }) {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl shadow-card ring-1 ring-navy-600/60">
      <div className="flex items-center gap-2 bg-cream-100 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#f26d5f]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f5c14e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#5ec269]" />
        <div className="ml-2 flex-1 rounded-full bg-white/85 px-3 py-1 text-[11px] text-navy-500">
          vnexpress.net
        </div>
        <span className="h-6 w-6 rounded-md bg-navy-200/60" />
        <span className="h-6 w-6 rounded-md bg-navy-200/60" />
        <span className="relative flex h-7 w-7 items-center justify-center rounded-md bg-gold-400 text-sm font-extrabold text-navy-900 ring-2 ring-gold-300 ring-offset-2 ring-offset-cream-100">
          M
        </span>
      </div>
      <div className="bg-navy-800 px-4 py-3 text-center text-xs font-semibold text-gold-300">
        {caption}
      </div>
    </div>
  )
}

function IntensityDemo() {
  const { t } = useLang()
  const [freq, setFreq] = useState(1)
  const LABELS = ['Casual', 'Focused', 'Locked-in']

  return (
    <div className="w-80 max-w-full rounded-3xl bg-navy-850 p-6 shadow-panel ring-1 ring-navy-600/50">
      <p className="text-sm text-cream-50">{t.tutorial.intensityLabel}</p>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={freq}
        aria-label={t.tutorial.intensityLabel}
        onChange={(e) => setFreq(Number(e.target.value))}
        className="slider-gold mt-3"
        style={{ '--slider-fill': `${(freq / 2) * 100}%` } as CSSProperties}
      />
      <div className="mt-1 flex justify-between">
        {LABELS.map((label, i) => (
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
      <p className="mt-4 rounded-xl bg-navy-800 px-4 py-3 text-center text-xs text-navy-200 ring-1 ring-navy-600/40">
        {t.tutorial.intensityNotes[freq]}
      </p>
    </div>
  )
}

function ModeDemo() {
  const { t } = useLang()
  const [replace, setReplace] = useState(true)
  const entry = VOCAB.significant

  return (
    <div className="w-full max-w-sm rounded-3xl bg-cream-50 p-6 text-ink shadow-card">
      <p className="font-wiki text-lg leading-loose font-semibold" lang="vi">
        Một vài từ{' '}
        <span className={replace ? 'hl-en' : 'hl-vi'}>{replace ? entry.word : entry.vi}</span> sẽ xuất
        hiện ngay trong câu bạn đang đọc.
      </p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-navy-200/60 pt-4">
        <span className="text-sm font-semibold text-navy-700">{t.demo.replaceToggle}</span>
        <Toggle on={replace} onChange={setReplace} label={t.demo.replaceToggle} surface="light" />
      </div>
    </div>
  )
}

function HoverDemo() {
  const [open, setOpen] = useState(false)
  const entry = VOCAB.elaborate

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-3xl bg-cream-50 p-6 text-ink shadow-card">
        <p className="font-wiki text-lg leading-loose font-semibold" lang="vi">
          Khi gặp một từ{' '}
          <button
            type="button"
            className="hl-en font-wiki text-inherit"
            onMouseEnter={() => setOpen(true)}
            onClick={() => setOpen(true)}
          >
            {entry.word}
          </button>
          , hãy di chuột lên từ đó.
        </p>
      </div>
      {open && (
        <div className="mt-4 animate-pop-in">
          <VocabPopupCard entry={entry} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

function ProgressDemo() {
  const { t } = useLang()
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const BARS = [3, 5, 2, 6, 4, 1, 2]
  const max = Math.max(...BARS)

  return (
    <div className="w-80 max-w-full rounded-3xl bg-navy-850 p-6 shadow-panel ring-1 ring-navy-600/50">
      <p className="text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">
        {t.tutorial.progressLabel}
      </p>
      <div className="mt-4 flex items-end justify-between border-b border-gold-400/60 pb-2">
        {DAYS.map((day, i) => (
          <div key={day} className="group flex w-8 flex-col items-center gap-1.5">
            <span className="text-[9px] font-bold text-gold-300">{BARS[i]}</span>
            <div className="flex h-16 items-end">
              <div
                className="w-2 origin-bottom animate-bar-grow rounded-full bg-gold-400 transition-colors group-hover:bg-gold-300"
                style={{ height: `${(BARS[i] / max) * 100}%`, animationDelay: `${i * 90}ms` }}
              />
            </div>
            <span className="text-[10px] font-semibold tracking-wide text-navy-200">{day}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-navy-200">
        <span className="font-bold text-gold-300">
          {BARS.reduce((a, b) => a + b, 0)} {t.tutorial.progressUnit}
        </span>{' '}
        {t.tutorial.progressTail}
      </p>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

export default function Tutorial() {
  const { t } = useLang()
  usePageTitle(t.meta.tutorialTitle)

  const steps = t.tutorial.steps
  const visuals: ReactNode[] = [
    <ToolbarDemo key="toolbar" caption={t.tutorial.toolbarCaption} />,
    <ExtensionPanel key="panel" />,
    <IntensityDemo key="intensity" />,
    <ModeDemo key="mode" />,
    <HoverDemo key="hover" />,
    <VocabPopupCard key="card" entry={VOCAB.solitude} />,
    <ProgressDemo key="progress" />,
  ]

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 50% 0%, rgb(245 197 66 / 0.08), transparent 62%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-gold-400 uppercase">
            {t.tutorial.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
            {t.tutorial.title}
          </h1>
          <p className="mt-4 text-lg text-navy-200">{t.tutorial.sub}</p>
        </div>

        <div className="mt-16 space-y-8">
          {steps.map((step, i) => (
            <Step
              key={i}
              number={String(i + 1).padStart(2, '0')}
              title={step.title}
              visual={visuals[i]}
              caption={step.caption}
            >
              <p>{step.intro}</p>
              {step.bullets.length > 0 && (
                <ul className="space-y-3">
                  {step.bullets.map((bullet) => (
                    <Bullet key={bullet.term} term={bullet.term}>
                      {bullet.text}
                    </Bullet>
                  ))}
                </ul>
              )}
              {step.outro && <p>{step.outro}</p>}
            </Step>
          ))}
        </div>

        <Reveal>
          <div className="mt-20 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              {t.tutorial.outroTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-navy-200">{t.tutorial.outroSub}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/#demo"
                className="rounded-full bg-gold-400 px-7 py-3.5 text-base font-bold text-navy-900 transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95"
              >
                {t.tutorial.ctaDemo}
              </Link>
              <Link
                to="/#waitlist"
                className="rounded-full border-2 border-navy-500 px-7 py-3 text-base font-bold text-cream-50 transition-all hover:-translate-y-0.5 hover:border-gold-400 hover:text-gold-300 active:scale-95"
              >
                {t.tutorial.ctaWaitlist}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
