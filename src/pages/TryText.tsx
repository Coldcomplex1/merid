import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Reveal from '../components/ui/Reveal'
import InstallButton from '../components/ui/InstallButton'
import VocabPlayground, { type PlaygroundContext } from '../components/demo/kit/VocabPlayground'
import type { VocabEntry } from '../data/vocab'
import {
  ENGINE_DATASETS,
  buildVocabMap,
  findMatch,
  gateByFrequency,
  loadDataset,
  tokenize,
  type EngineDatasetKey,
  type EngineEntry,
  type VocabMap,
} from '../lib/vocabEngine'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

type Mode = 'replace' | 'highlight' | 'beside'

const MODES: { value: Mode; label: string }[] = [
  { value: 'replace', label: 'Replace' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'beside', label: 'Beside' },
]

const SAMPLE_TEXT =
  'Sáng nay, ban quản lý thông báo sẽ mở rộng khu phố đi bộ quanh hồ. Quyết định này có ảnh hưởng quan trọng tới hàng trăm hộ kinh doanh và được giới chuyên gia đánh giá là bước đi cần thiết để bảo tồn di sản kiến trúc của thành phố. Một số cư dân lo ngại về tiếng ồn, nhưng phần lớn ủng hộ vì tin rằng không gian mới sẽ khuyến khích người trẻ khám phá văn hóa địa phương thay vì chỉ tập trung mua sắm. Chính quyền cam kết duy trì đối thoại thường xuyên, thu thập góp ý của cộng đồng và điều chỉnh kế hoạch một cách linh hoạt, minh bạch trong suốt quá trình thực hiện.'

/** Map a real dataset row onto the demo card's entry shape. */
function toVocabEntry(e: EngineEntry, matchedText: string): VocabEntry {
  return {
    id: e.word.toLowerCase(),
    word: e.word,
    vi: matchedText,
    pos: e.type || '',
    pron: e.phon_n_am || e.phon_br || '',
    definition: e.definition || '',
    viMeaning: e.vietnamese,
    example: e.example || '',
    synonyms: e.synonyms.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3),
    antonyms: e.antonyms.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3),
    datasets: ['SAT'],
    tier: 1,
  }
}

function labelFor(entry: VocabEntry, mode: Mode): string {
  if (mode === 'replace') return entry.word
  if (mode === 'beside') return `${entry.vi} (${entry.word})`
  return entry.vi
}

/** Run the extension's exact pipeline over the pasted text. */
function processText(
  text: string,
  vocabMap: VocabMap,
  frequency: number,
  mode: Mode,
  knownIds: Set<string>,
  renderWord: PlaygroundContext['renderWord'],
): { nodes: ReactNode[]; count: number } {
  const tokens = tokenize(text)
  const nodes: ReactNode[] = []
  let count = 0

  for (let i = 0; i < tokens.length; i++) {
    const match = findMatch(tokens, i, vocabMap)
    if (!match) {
      nodes.push(tokens[i])
      continue
    }
    const item = match.items[0] // deterministic pick, like the extension
    const entry = toVocabEntry(item, match.matchedText)

    const gateKey = match.matchedText.toLowerCase() + '|' + item.word.toLowerCase()
    if (knownIds.has(entry.id) || !gateByFrequency(gateKey, frequency)) {
      nodes.push(match.matchedText)
      i += match.size - 1
      continue
    }

    nodes.push(renderWord(entry, labelFor(entry, mode), `m-${i}`))
    count++
    i += match.size - 1
  }
  return { nodes, count }
}

/**
 * /try - paste any Vietnamese text and watch the real engine work on it: the
 * extension's actual matching logic and actual CSV datasets (3,300+ words),
 * running fully client-side.
 */
export default function TryText() {
  const { t } = useLang()
  const s = t.try
  usePageTitle(t.meta.tryTitle)

  const [text, setText] = useState(SAMPLE_TEXT)
  const [datasetKey, setDatasetKey] = useState<EngineDatasetKey>('all')
  const [frequency, setFrequency] = useState(80)
  const [mode, setMode] = useState<Mode>('replace')
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())

  const [vocab, setVocab] = useState<EngineEntry[] | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  // Debounce typing so the engine reruns at most a few times per second.
  const [debouncedText, setDebouncedText] = useState(text)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedText(text), 250)
    return () => window.clearTimeout(timer)
  }, [text])

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    loadDataset(datasetKey)
      .then((list) => {
        if (cancelled) return
        setVocab(list)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [datasetKey])

  const vocabMap = useMemo(() => (vocab ? buildVocabMap(vocab) : null), [vocab])

  const handleSave = (entry: VocabEntry) => setSavedIds((prev) => new Set(prev).add(entry.id))
  const handleKnow = (entry: VocabEntry) => setKnownIds((prev) => new Set(prev).add(entry.id))

  const pill = (active: boolean) =>
    `cursor-pointer rounded-full px-4 py-2 text-sm font-bold transition-all active:scale-95 ${
      active
        ? 'bg-gold-400 text-navy-900'
        : 'bg-surface-2 text-muted ring-1 ring-line-strong/70 hover:text-heading'
    }`

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

      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">{s.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance text-heading sm:text-5xl">
            {s.title}
          </h1>
          <p className="mt-4 text-lg text-body">{s.sub}</p>
        </div>

        <Reveal className="mt-12">
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {/* ── Input + controls ─────────────────────────────── */}
            <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="try-input" className="text-sm font-bold text-heading">
                  {s.inputLabel}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setText(SAMPLE_TEXT)}
                    className="cursor-pointer rounded-full border border-line-strong px-3 py-1.5 text-xs font-bold text-body transition-colors hover:border-accent hover:text-accent"
                  >
                    {s.sampleBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => setText('')}
                    className="cursor-pointer rounded-full border border-line-strong px-3 py-1.5 text-xs font-bold text-body transition-colors hover:border-accent hover:text-accent"
                  >
                    {s.clearBtn}
                  </button>
                </div>
              </div>
              <textarea
                id="try-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={9}
                lang="vi"
                placeholder={s.placeholder}
                className="mt-3 w-full resize-y rounded-xl border-2 border-line bg-canvas p-4 text-[15px] leading-relaxed text-heading placeholder:text-body/50 focus:border-accent focus:outline-none"
              />

              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">
                    {s.datasetLabel}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ENGINE_DATASETS.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        aria-pressed={datasetKey === d.key}
                        onClick={() => setDatasetKey(d.key)}
                        className={pill(datasetKey === d.key)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">
                    {s.intensityLabel}
                  </p>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={frequency}
                    aria-label={s.intensityLabel}
                    onChange={(e) => setFrequency(Number(e.target.value))}
                    className="slider-gold mt-2.5"
                    style={{ '--slider-fill': `${((frequency - 10) / 90) * 100}%` } as CSSProperties}
                  />
                </div>

                <div>
                  <p className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">
                    {s.modeLabel}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {MODES.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        aria-pressed={mode === m.value}
                        onClick={() => setMode(m.value)}
                        className={pill(mode === m.value)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-6 text-xs leading-relaxed text-muted">{s.privacyNote}</p>
            </section>

            {/* ── Output: the fake page running the real engine ── */}
            <section className="min-w-0">
              <VocabPlayground savedIds={savedIds} onSave={handleSave} onKnow={handleKnow}>
                {({ renderWord }) => {
                  const result =
                    vocabMap && loadState === 'ready'
                      ? processText(debouncedText, vocabMap, frequency, mode, knownIds, renderWord)
                      : null
                  return (
                    <div className="rounded-2xl bg-cream-50 p-6 text-ink shadow-card sm:p-8">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-navy-200/60 pb-3">
                        <span className="text-[11px] font-extrabold tracking-[0.14em] text-navy-500 uppercase">
                          {s.outputLabel}
                        </span>
                        {result && result.count > 0 && (
                          <span className="rounded-full bg-gold-300/60 px-2.5 py-1 text-[11px] font-extrabold text-navy-800">
                            {s.matches(result.count)}
                          </span>
                        )}
                      </div>

                      {loadState === 'loading' && (
                        <p className="py-10 text-center text-sm text-navy-500" role="status">
                          {s.loading}
                        </p>
                      )}
                      {loadState === 'error' && (
                        <p className="py-10 text-center text-sm font-semibold text-[#b91c1c]" role="alert">
                          {s.loadError}
                        </p>
                      )}
                      {result && debouncedText.trim() && (
                        <>
                          <p className="font-wiki text-[15.5px] leading-relaxed whitespace-pre-wrap" lang="vi">
                            {result.nodes}
                          </p>
                          {result.count === 0 ? (
                            <p className="mt-5 rounded-xl bg-navy-200/30 px-4 py-3 text-[13px] leading-relaxed text-navy-700">
                              {s.emptyOutput}
                            </p>
                          ) : (
                            <p className="mt-5 text-xs font-semibold text-navy-500">{s.hoverHint}</p>
                          )}
                        </>
                      )}
                      {result && !debouncedText.trim() && (
                        <p className="py-10 text-center text-sm text-navy-500">{s.placeholder}</p>
                      )}
                    </div>
                  )
                }}
              </VocabPlayground>
            </section>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-16 text-center">
            <InstallButton label={t.hero.ctaInstall} variant="primary" />
          </div>
        </Reveal>
      </div>
    </div>
  )
}
