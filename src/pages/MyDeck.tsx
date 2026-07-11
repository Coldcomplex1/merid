import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { signOut } from '../lib/auth'
import { createFirestoreDeck } from '../deck/firestoreDeck'
import type { DeckWord, WordStatus } from '../deck/DeckSource'
import WordList from '../components/study/WordList'
import PuzzleMode from '../components/study/PuzzleMode'
import FlashcardMode from '../components/study/FlashcardMode'
import InstallButton from '../components/ui/InstallButton'
import LangToggle from '../components/ui/LangToggle'
import ThemeToggle from '../components/ui/ThemeToggle'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

type Tab = 'words' | 'puzzle' | 'flashcards'

/** Standalone deck workspace for the signed-in user. Rendered outside the
 *  marketing chrome (no banner/navbar/footer), so it carries its own slim
 *  header with the language/theme toggles and sign-out. Route is wrapped in
 *  <RequireAuth>, so user is always present here. */
export default function MyDeck() {
  const { t } = useLang()
  const { user } = useAuth()
  usePageTitle(`${t.deck.title} · Merid`)

  const source = useMemo(() => createFirestoreDeck(user!.uid), [user])
  const [tab, setTab] = useState<Tab>('words')
  const [words, setWords] = useState<DeckWord[] | null>(null)
  const [error, setError] = useState(false)

  const reload = useCallback(() => {
    let cancelled = false
    source
      .listWords()
      .then((list) => {
        if (!cancelled) setWords(list)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [source])

  useEffect(() => {
    // Prefer a live subscription (words synced from the extension show up
    // without a refresh); fall back to a one-shot load.
    if (source.subscribe) return source.subscribe(setWords, () => setError(true))
    return reload()
  }, [source, reload])

  const handleRemove = (word: string) => {
    // Optimistic update; reconcile with the backend afterwards.
    setWords((cur) => (cur ? cur.filter((w) => w.word !== word) : cur))
    source.removeWord(word).catch(() => reload())
  }

  const handleSetStatus = (word: string, status: WordStatus) => {
    setWords((cur) => (cur ? cur.map((w) => (w.word === word ? { ...w, status } : w)) : cur))
    source.setStatus(word, status).catch(() => reload())
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'words', label: t.deck.tabs.words },
    { id: 'puzzle', label: t.deck.tabs.puzzle },
    { id: 'flashcards', label: t.deck.tabs.flashcards },
  ]

  // Study modes only quiz words still being learned.
  const learning = (words ?? []).filter((w) => w.status === 'saved')
  const known = (words ?? []).filter((w) => w.status === 'known')

  // Values stay in heading ink; the small dot beside the label carries the
  // status identity (gold = learning, green = known).
  const stats: { value: number; label: string; dot?: string }[] = [
    { value: words?.length ?? 0, label: t.deck.statTotal },
    { value: learning.length, label: t.deck.savedLabel, dot: 'bg-gold-400' },
    { value: known.length, label: t.deck.knownLabel, dot: 'bg-success' },
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-8">
          <Link to="/" title={t.deck.backHome} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-400 text-lg font-extrabold text-navy-900 shadow-[0_0_20px_-4px_rgb(245_197_66/0.7)]">
              M
            </span>
            <span className="text-lg font-bold text-heading">Merid</span>
          </Link>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <LangToggle />
            <ThemeToggle />
            {user?.email && (
              <span className="hidden max-w-44 truncate rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted md:block">
                {user.email}
              </span>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-full border border-line-strong px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:border-accent hover:text-accent"
            >
              {t.deck.menu.logout}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-8">
        <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">{t.deck.title}</p>
        <h1 className="mt-2 text-3xl font-extrabold text-heading sm:text-4xl">{t.deck.greeting}</h1>
        <p className="mt-2 max-w-xl leading-relaxed text-body">{t.deck.greetingSub}</p>

        {error ? (
          <p className="mt-8 rounded-xl border border-danger/40 bg-danger/10 p-6 text-danger">
            {t.deck.auth.errors.network}
          </p>
        ) : words === null ? (
          <p className="mt-8 p-6 text-muted" role="status">
            {t.deck.loading}
          </p>
        ) : words.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface p-8 text-center sm:p-12">
            <p className="text-4xl" aria-hidden="true">
              📚
            </p>
            <h2 className="mt-3 text-xl font-bold text-heading">{t.deck.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-body">{t.deck.empty}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <InstallButton label={t.nav.cta} variant="compact" />
              <Link
                to="/tutorial"
                className="text-sm font-semibold text-accent transition-colors hover:text-accent-hover hover:underline"
              >
                {t.nav.tutorial} →
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
              {stats.map(({ value, label, dot }) => (
                <div key={label} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                  <p className="text-3xl font-semibold text-heading sm:text-4xl">{value}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted sm:text-sm">
                    {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />}
                    {label}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 inline-flex flex-wrap gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-line-strong/70">
              {tabs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-95 ${
                    tab === id ? 'bg-gold-400 text-navy-900' : 'text-muted hover:text-heading'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {tab === 'words' ? (
                <WordList words={words} onRemove={handleRemove} onSetStatus={handleSetStatus} />
              ) : tab === 'puzzle' ? (
                <PuzzleMode words={learning} />
              ) : (
                <FlashcardMode words={learning} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
