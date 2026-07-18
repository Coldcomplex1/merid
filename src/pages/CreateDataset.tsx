import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import CopyButton from '../components/ui/CopyButton'
import InstallButton from '../components/ui/InstallButton'
import { useLang, usePageTitle } from '../i18n/LanguageContext'
import {
  buildDatasetPrompt,
  sanitizeTopic,
  CSV_HEADER,
  EXAMPLE_ROW,
  TEMPLATE_CSV,
  TOPIC_PRESETS,
  LEVELS,
  WORD_COUNTS,
  DEFAULT_LEVEL,
  DEFAULT_WORD_COUNT,
  type Level,
  type TopicPresetId,
  type WordCount,
} from '../lib/datasetPrompt'

/* ── Local building blocks ───────────────────────────────────── */

function StepCard({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <Reveal>
      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
        <div className="flex items-baseline gap-4">
          <span className="text-4xl font-extrabold text-accent/40 sm:text-5xl">{number}</span>
          <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">{title}</h2>
        </div>
        <div className="mt-5 space-y-5 text-[15px] leading-relaxed text-body">{children}</div>
      </section>
    </Reveal>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-2 text-sm font-bold transition-all active:scale-95 ${
        active
          ? 'bg-gold-400 text-navy-900'
          : 'bg-surface-2 text-muted ring-1 ring-line-strong/70 hover:text-heading'
      }`}
    >
      {children}
    </button>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-sm font-bold text-heading">{children}</p>
}

/* ── Page ────────────────────────────────────────────────────── */

export default function CreateDataset() {
  const { t } = useLang()
  const s = t.createDataset
  usePageTitle(t.meta.createDatasetTitle)

  const [level, setLevel] = useState<Level>(DEFAULT_LEVEL)
  const [presetId, setPresetId] = useState<TopicPresetId>('everyday')
  const [customTopic, setCustomTopic] = useState('')
  const [count, setCount] = useState<WordCount>(DEFAULT_WORD_COUNT)
  const topicInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (presetId === 'custom') topicInputRef.current?.focus()
  }, [presetId])

  const prompt = useMemo(() => {
    const preset = TOPIC_PRESETS.find((p) => p.id === presetId)
    const topic = presetId === 'custom' ? sanitizeTopic(customTopic) : (preset?.prompt ?? '')
    return buildDatasetPrompt({ level, topic, count })
  }, [level, presetId, customTopic, count])

  const downloadTemplate = () => {
    // The BOM keeps Excel happy; the extension importer strips it.
    const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'merid-dataset-template.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

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
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">{s.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance text-heading sm:text-5xl">
            {s.title}
          </h1>
          <p className="mt-4 text-lg text-body">{s.sub}</p>
        </div>

        <div className="mt-16 space-y-8">
          {/* Step 1: choose level / topic / size */}
          <StepCard number="01" title={s.chooseTitle}>
            <div className="space-y-2.5">
              <FieldLabel>{s.levelLabel}</FieldLabel>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label={s.levelLabel}>
                {LEVELS.map((l) => (
                  <Pill key={l} active={level === l} onClick={() => setLevel(l)}>
                    {l}
                  </Pill>
                ))}
              </div>
              <p className="text-xs text-muted">{s.levelHint}</p>
            </div>

            <div className="space-y-2.5">
              <FieldLabel>{s.topicLabel}</FieldLabel>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label={s.topicLabel}>
                {TOPIC_PRESETS.map((p) => (
                  <Pill key={p.id} active={presetId === p.id} onClick={() => setPresetId(p.id)}>
                    {s.presetLabels[p.id]}
                  </Pill>
                ))}
              </div>
              {presetId === 'custom' && (
                <input
                  ref={topicInputRef}
                  type="text"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  maxLength={120}
                  placeholder={s.topicPlaceholder}
                  aria-label={s.topicLabel}
                  className="w-full max-w-md rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-heading placeholder-muted focus:border-accent focus:outline-none"
                />
              )}
            </div>

            <div className="space-y-2.5">
              <FieldLabel>{s.countLabel}</FieldLabel>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label={s.countLabel}>
                {WORD_COUNTS.map((c) => (
                  <Pill key={c} active={count === c} onClick={() => setCount(c)}>
                    {c}
                  </Pill>
                ))}
              </div>
              <p className="text-xs text-muted">{s.countHint}</p>
            </div>
          </StepCard>

          {/* Step 2: copy the generated prompt */}
          <StepCard number="02" title={s.copyTitle}>
            <p>{s.copyIntro}</p>
            <div className="overflow-hidden rounded-2xl bg-canvas-2 ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                <span className="text-xs font-bold tracking-wide text-muted uppercase">{s.promptLabel}</span>
                <CopyButton text={prompt} label={s.copy} copiedLabel={s.copied} />
              </div>
              <pre className="max-h-80 overflow-auto px-4 py-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-body">
                {prompt}
              </pre>
            </div>
          </StepCard>

          {/* Step 3: paste into an AI */}
          <StepCard number="03" title={s.pasteTitle}>
            <p>{s.pasteIntro}</p>
            <p className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
              {s.accuracyNote}
            </p>
          </StepCard>

          {/* Step 4: save as .csv */}
          <StepCard number="04" title={s.saveTitle}>
            <p>{s.saveIntro}</p>
            <ul className="space-y-3">
              {s.saveOptions.map((opt) => (
                <li key={opt.term} className="flex gap-3">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                  <span>
                    <span className="font-bold text-heading">{opt.term}</span> {opt.text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={downloadTemplate}
                className="rounded-full border-2 border-line-strong px-5 py-2.5 text-sm font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
              >
                {s.templateButton}
              </button>
              <p className="text-xs text-muted">{s.templateHint}</p>
            </div>
          </StepCard>

          {/* Step 5: upload into the extension */}
          <StepCard number="05" title={s.uploadTitle}>
            <p>{s.uploadIntro}</p>
            <ol className="list-decimal space-y-2 pl-5 marker:font-bold marker:text-accent">
              {s.uploadSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-sm">
              <Link to="/tutorial" className="font-semibold text-accent hover:text-accent-hover">
                {s.ctaTutorial} →
              </Link>
            </p>
          </StepCard>

          {/* CSV format reference */}
          <Reveal>
            <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
              <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                {s.schemaTitle}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-body">{s.schemaIntro}</p>

              <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-line">
                <table className="w-full min-w-130 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-heading">
                      <th className="px-4 py-2.5 font-bold">{s.schemaColHeaders[0]}</th>
                      <th className="px-4 py-2.5 font-bold">{s.schemaColHeaders[1]}</th>
                      <th className="px-4 py-2.5 font-bold">{s.schemaColHeaders[2]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.columns.map((col) => (
                      <tr key={col.name} className="border-t border-line text-body">
                        <td className="px-4 py-2.5 font-mono text-[13px] text-heading">{col.name}</td>
                        <td className="px-4 py-2.5">
                          {col.required ? (
                            <span className="rounded-full bg-gold-400/15 px-2.5 py-0.5 text-xs font-bold text-accent">
                              {s.schemaRequired}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">{s.schemaOptional}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">{col.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-6 text-sm font-bold text-heading">{s.exampleTitle}</p>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-canvas-2 px-4 py-3 font-mono text-xs leading-relaxed text-body ring-1 ring-line">
                {CSV_HEADER + '\n' + EXAMPLE_ROW}
              </pre>

              <p className="mt-6 text-sm font-bold text-heading">{s.errorsTitle}</p>
              <ul className="mt-2 space-y-2 text-sm text-body">
                {s.errors.map((err) => (
                  <li key={err} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                    <span>{err}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-xs text-muted">{s.limitsNote}</p>
              <p className="mt-2 text-xs font-semibold text-muted">🔒 {s.privacyNote}</p>
            </section>
          </Reveal>
        </div>

        {/* Outro CTA */}
        <Reveal>
          <div className="mt-20 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance text-heading sm:text-4xl">
              {s.outroTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">{s.outroSub}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <InstallButton label={s.ctaInstall} variant="primary" />
              <Link
                to="/tutorial"
                className="rounded-full border-2 border-line-strong px-7 py-3 text-base font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
              >
                {s.ctaTutorial}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
