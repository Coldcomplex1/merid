import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import PracticeArticle from '../components/demo/PracticeArticle'
import PinSimulator from '../components/demo/PinSimulator'
import { useAuth } from '../auth/AuthContext'
import { createFirestoreDeck } from '../deck/firestoreDeck'
import type { VocabEntry } from '../data/vocab'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

/** Vietnamese news sites suggested for the first mission. Plain external
 *  links - no tracking, no affiliation. */
const TRY_SITES = [
  { label: 'vnexpress.net', href: 'https://vnexpress.net' },
  { label: 'tuoitre.vn', href: 'https://tuoitre.vn' },
  { label: 'dantri.com.vn', href: 'https://dantri.com.vn' },
]

/** Practice progress survives a refresh (the extension opens this page once). */
const PROGRESS_KEY = 'merid-welcome-progress'

interface Progress {
  pinned: boolean
  hovered: boolean
  saved: boolean
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>
      return { pinned: !!p.pinned, hovered: !!p.hovered, saved: !!p.saved }
    }
  } catch {
    /* storage unavailable */
  }
  return { pinned: false, hovered: false, saved: false }
}

function CheckRow({ done, label, extra }: { done: boolean; label: string; extra?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
          done ? 'border-success bg-success/15 text-success' : 'border-line-strong text-transparent'
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span className={`text-sm leading-snug font-semibold ${done ? 'text-muted line-through decoration-success/60' : 'text-body'}`}>
        {label}
        {extra}
      </span>
    </li>
  )
}

/**
 * /welcome - opened by the extension exactly once, right after install.
 * Job: get the user to one successful replacement as fast as possible - and
 * the fastest place for that is this very page, so the practice article and
 * the pin simulator are the real thing, and the checklist ticks itself as the
 * visitor acts.
 */
export default function Welcome() {
  const { t } = useLang()
  const s = t.welcome
  const { user } = useAuth()
  usePageTitle(t.meta.welcomeTitle)

  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [deckCount, setDeckCount] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
    } catch {
      /* storage unavailable */
    }
  }, [progress])

  // Signed-in visitors: watch the real synced deck, so saving a word from the
  // extension on an actual news page ticks the checklist here live.
  useEffect(() => {
    if (!user) return
    const source = createFirestoreDeck(user.uid)
    if (!source.subscribe) return
    return source.subscribe(
      (words) => setDeckCount(words.length),
      () => {},
    )
  }, [user])

  const mark = (key: keyof Progress) =>
    setProgress((p) => (p[key] ? p : { ...p, [key]: true }))

  const handleOpen = () => mark('hovered')
  const handleSave = (entry: VocabEntry) => {
    setSavedIds((prev) => new Set(prev).add(entry.id))
    mark('saved')
  }
  const handleKnow = (entry: VocabEntry) => {
    setKnownIds((prev) => new Set(prev).add(entry.id))
  }

  const items = useMemo(
    () => [
      { done: true, label: s.checklist.installed },
      { done: progress.pinned, label: s.checklist.pinned },
      { done: progress.hovered, label: s.checklist.hovered },
      { done: progress.saved || deckCount > 0, label: s.checklist.saved },
      {
        done: !!user,
        label: user?.email ? s.checklist.signedInAs(user.email) : s.checklist.signedIn,
        extra: !user ? (
          <>
            {' '}
            <Link to="/login" className="font-bold text-accent hover:underline">
              {s.checklist.signInCta} →
            </Link>
          </>
        ) : undefined,
      },
    ],
    [progress, deckCount, user, s],
  )
  const doneCount = items.filter((i) => i.done).length
  const allDone = doneCount === items.length

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 50% 0%, rgb(245 197 66 / 0.10), transparent 62%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">{s.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance text-heading sm:text-5xl">
            {s.title}
          </h1>
          <p className="mt-4 text-lg text-body">{s.sub}</p>
        </div>

        <div className="mt-14 grid items-start gap-8 lg:grid-cols-[1fr_300px]">
          {/* ── The doing column ─────────────────────────────────── */}
          <div className="min-w-0 space-y-8">
            {/* 1 · Live practice article */}
            <Reveal>
              <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
                <div className="flex items-baseline gap-4">
                  <span className="text-4xl font-extrabold text-accent/40 sm:text-5xl">01</span>
                  <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                    {s.practice.title}
                  </h2>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-body">{s.practice.intro}</p>
                <p className="mt-2 text-sm font-bold text-accent">{s.practice.hint}</p>
                <PracticeArticle
                  className="mt-6"
                  savedIds={savedIds}
                  knownIds={knownIds}
                  onSave={handleSave}
                  onKnow={handleKnow}
                  onOpen={handleOpen}
                />
                {savedIds.size > 0 && (
                  <p className="animate-pop-in mt-4 text-sm font-bold text-success" role="status">
                    {s.practice.savedNote(savedIds.size)}
                  </p>
                )}
              </section>
            </Reveal>

            {/* 2 · Pin simulator */}
            <Reveal>
              <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
                <div className="flex items-baseline gap-4">
                  <span className="text-4xl font-extrabold text-accent/40 sm:text-5xl">02</span>
                  <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                    {s.pin.title}
                  </h2>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-body">{s.pin.intro}</p>
                <div className="mt-6 flex justify-center">
                  <PinSimulator initiallyPinned={progress.pinned} onPinned={() => mark('pinned')} />
                </div>
              </section>
            </Reveal>

            {/* 3 · First mission */}
            <Reveal>
              <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
                <div className="flex items-baseline gap-4">
                  <span className="text-4xl font-extrabold text-accent/40 sm:text-5xl">03</span>
                  <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                    {s.mission.title}
                  </h2>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-body">{s.mission.body}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="font-bold text-heading">{s.mission.sitesLabel}</span>
                  {TRY_SITES.map((site) => (
                    <a
                      key={site.label}
                      href={site.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border-2 border-line-strong px-4 py-1.5 text-sm font-bold text-heading transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
                    >
                      {site.label} ↗
                    </a>
                  ))}
                </div>
              </section>
            </Reveal>

            {/* Optional extras */}
            <Reveal>
              <section className="rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
                <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                  {s.extrasTitle}
                </h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  {s.extras.map((extra) => (
                    <div key={extra.term} className="flex flex-col rounded-2xl border border-line p-5">
                      <h3 className="font-extrabold text-heading">{extra.term}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-body">{extra.text}</p>
                      <Link
                        to={extra.to}
                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:underline"
                      >
                        {extra.cta} →
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          </div>

          {/* ── The self-checking checklist ─────────────────────── */}
          <aside className="order-first lg:order-none lg:sticky lg:top-24">
            <div className="rounded-3xl bg-surface p-6 ring-1 ring-line">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-extrabold text-heading">{s.checklist.title}</h2>
                <span className="shrink-0 text-xs font-bold text-muted">
                  {s.checklist.progress(doneCount, items.length)}
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gold-400 transition-[width] duration-500 ease-out"
                  style={{ width: `${(doneCount / items.length) * 100}%` }}
                />
              </div>
              <ul className="mt-5 space-y-3.5">
                {items.map((item, i) => (
                  <CheckRow key={i} done={item.done} label={item.label} extra={item.extra} />
                ))}
              </ul>
              {allDone && (
                <p className="animate-pop-in mt-5 rounded-xl bg-success/10 px-4 py-3 text-sm font-bold text-success" role="status">
                  {s.checklist.allDone}
                </p>
              )}
            </div>
          </aside>
        </div>

        {/* Per-site tip + CTAs */}
        <Reveal>
          <div className="mt-20 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance text-heading sm:text-4xl">
              {s.outroTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-body">{s.outroSub}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/#demo"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-base font-bold text-navy-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95"
              >
                {s.ctaDemo}
              </Link>
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
