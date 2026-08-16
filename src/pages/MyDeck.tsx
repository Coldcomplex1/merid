import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { signOut } from '../lib/auth'
import { createFirestoreDeck } from '../deck/firestoreDeck'
import type { DeckWord, WordStatus } from '../deck/DeckSource'
import WordList from '../components/study/WordList'
import WordGrid from '../components/study/WordGrid'
import LibraryToolbar from '../components/study/LibraryToolbar'
import type { LevelFilter, ProgressFilter, ViewMode } from '../components/study/LibraryToolbar'
import SelectionBar from '../components/study/SelectionBar'
import PuzzleMode, { MIN_PUZZLE_WORDS } from '../components/study/PuzzleMode'
import FlashcardMode from '../components/study/FlashcardMode'
import LangToggle from '../components/ui/LangToggle'
import ThemeToggle from '../components/ui/ThemeToggle'
import MeridMark from '../components/ui/MeridMark'
import { CardsIcon, PlayIcon } from '../components/ui/DeckIcons'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

type Tab = 'explore' | 'library' | 'puzzle' | 'flashcards'

/** The generated word -> SAT/C1/C2 index, loaded on demand. */
type LevelIndex = typeof import('../data/wordLevels')

/** Standalone deck workspace for the signed-in user. Rendered outside the
 *  marketing chrome (no banner/navbar/footer), so it carries its own slim
 *  header with the language/theme toggles and sign-out. Route is wrapped in
 *  <RequireAuth>, so user is always present here. */
export default function MyDeck() {
  const { t } = useLang()
  const { user } = useAuth()
  usePageTitle(`${t.deck.title} · Merid`)

  const source = useMemo(() => createFirestoreDeck(user!.uid), [user])
  const [tab, setTab] = useState<Tab>('library')
  const [words, setWords] = useState<DeckWord[] | null>(null)
  const [error, setError] = useState(false)

  // Library controls. These filter the Library tab and nothing else - see the
  // note on `visibleWords` below.
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [progress, setProgress] = useState<ProgressFilter>('all')
  const [view, setView] = useState<ViewMode>('grid')

  // Building a puzzle out of specific words: `selected` is what is ticked in
  // the list, `puzzleWords` is the set handed to the Puzzle tab once confirmed.
  // Keeping them separate means ticking more words does not disturb a game
  // already in progress.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [puzzleWords, setPuzzleWords] = useState<string[] | null>(null)

  // Levels are not stored on a deck word - they are resolved against a
  // generated index of the extension's datasets (see scripts/gen-word-levels).
  // ~30 kB that only this page needs, so it is imported on demand rather than
  // bundled into every marketing page. If it fails to load the Difficulty
  // control simply never appears, and the other filters still work.
  const [levelIndex, setLevelIndex] = useState<LevelIndex | null>(null)
  useEffect(() => {
    let live = true
    import('../data/wordLevels')
      .then((mod) => {
        if (live) setLevelIndex(mod)
      })
      .catch(() => {
        /* filter stays hidden */
      })
    return () => {
      live = false
    }
  }, [])

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

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'explore', label: t.deck.tabs.explore, badge: t.deck.library.soon },
    { id: 'library', label: t.deck.tabs.library },
    { id: 'puzzle', label: t.deck.tabs.puzzle },
    { id: 'flashcards', label: t.deck.tabs.flashcards },
  ]

  // Study modes only quiz words still being learned. Memoized because these
  // arrays are props to PuzzleMode, which reshuffles its questions whenever
  // they change identity - a fresh array on every render would reshuffle the
  // game underneath a player.
  const learning = useMemo(() => (words ?? []).filter((w) => w.status === 'saved'), [words])
  const known = useMemo(() => (words ?? []).filter((w) => w.status === 'known'), [words])

  // What you are still learning comes first; a word you have marked "I know
  // this" sinks to the bottom instead of sitting in the middle of the list you
  // are working through. Sort is stable, so inside each group the newest-saved
  // order the backend already returns is preserved. Only the Library tab reads
  // this - the study modes filter by status, where order is irrelevant.
  const orderedWords = useMemo(() => {
    const rank = (w: DeckWord) => (w.status === 'known' ? 1 : 0)
    return [...(words ?? [])].sort((a, b) => rank(a) - rank(b))
  }, [words])

  // Deliberately feeds the Library tab only. Routing this into PuzzleMode
  // instead of `learning` would hand it a new array on every keystroke, and it
  // would reshuffle a game in progress while you typed in the search box.
  const visibleWords = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orderedWords.filter((w) => {
      if (progress !== 'all' && w.status !== progress) return false
      if (level !== 'all' && levelIndex && !levelIndex.levelsFor(w.word).includes(level)) return false
      if (!q) return true
      return (
        w.word.toLowerCase().includes(q) ||
        w.vietnamese.toLowerCase().includes(q) ||
        w.definition.toLowerCase().includes(q)
      )
    })
  }, [orderedWords, query, progress, level, levelIndex])

  const filtered = query.trim() !== '' || level !== 'all' || progress !== 'all'
  const clearFilters = () => {
    setQuery('')
    setLevel('all')
    setProgress('all')
  }

  const toggleSelect = (word: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })

  const makePuzzle = () => {
    setPuzzleWords([...selected])
    setSelecting(false)
    setTab('puzzle')
  }

  // Select-all works on what the filters have left on screen, not the whole
  // deck, so narrowing the grid first is a way to build a set.
  const selectable = useMemo(
    () => visibleWords.filter((w) => w.status === 'saved').map((w) => w.word),
    [visibleWords],
  )
  const allChosen = selectable.length > 0 && selectable.every((w) => selected.has(w))

  // A word can be removed or marked known while a custom set is live, so the
  // set is resolved against the current deck rather than being frozen at the
  // moment it was made.
  const customSet = useMemo(
    () => (puzzleWords ? learning.filter((w) => puzzleWords.includes(w.word)) : null),
    [puzzleWords, learning],
  )
  const puzzleQuestions = customSet && customSet.length >= MIN_PUZZLE_WORDS ? customSet : learning

  // Values stay in heading ink; the small dot beside the label carries the
  // status identity (gold = learning, green = known).
  const stats: { value: number; label: string; dot?: string }[] = [
    { value: words?.length ?? 0, label: t.deck.statTotal },
    { value: learning.length, label: t.deck.savedLabel, dot: 'bg-gold-400' },
    { value: known.length, label: t.deck.knownLabel, dot: 'bg-success' },
  ]

  const pill = 'cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-95'
  const outlineButton =
    'cursor-pointer rounded-full border border-line-strong px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:border-accent hover:text-accent'

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-8">
          <Link to="/" title={t.deck.backHome} className="flex items-center gap-2.5">
            <MeridMark size={32} />
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
        <div className="flex items-center gap-2.5">
          <CardsIcon size={30} className="shrink-0 text-accent" />
          <h1 className="text-3xl font-extrabold text-heading sm:text-4xl">{t.deck.title}</h1>
        </div>

        {error ? (
          <p className="mt-8 rounded-xl border border-danger/40 bg-danger/10 p-6 text-danger">
            {t.deck.auth.errors.network}
          </p>
        ) : words === null ? (
          <p className="mt-8 p-6 text-muted" role="status">
            {t.deck.loading}
          </p>
        ) : words.length === 0 ? (
          <div className="mt-8 rounded-xl border border-line bg-surface p-8 text-center sm:p-12">
            <p className="text-4xl" aria-hidden="true">
              📚
            </p>
            <h2 className="mt-3 text-xl font-bold text-heading">{t.deck.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-body">
              {t.deck.empty(MIN_PUZZLE_WORDS)}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
              {stats.map(({ value, label, dot }) => (
                <div key={label} className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                  <p className="text-3xl font-semibold text-heading sm:text-4xl">{value}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted sm:text-sm">
                    {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />}
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* The mockup's switcher: a raised white pill on a sunken track,
                rather than the gold pill the language toggle uses. */}
            <div className="mt-8 inline-flex flex-wrap gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-line-strong/70">
              {tabs.map(({ id, label, badge }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={`${pill} ${
                    tab === id ? 'bg-surface text-heading shadow-soft' : 'text-muted hover:text-heading'
                  }`}
                >
                  {label}
                  {badge && (
                    <span className="ml-1.5 rounded-full bg-wiki-blue px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === 'library' && (
              <>
                <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-heading">{t.deck.library.collections}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {selecting && (
                      <>
                        <span className="text-xs font-semibold text-muted">
                          {t.deck.select.chosen(selected.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            allChosen ? setSelected(new Set()) : setSelected(new Set(selectable))
                          }
                          className={outlineButton}
                        >
                          {allChosen ? t.deck.select.none : t.deck.select.all}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelecting((s) => !s)}
                      className={
                        selecting
                          ? 'cursor-pointer rounded-full bg-gold-400 px-3.5 py-1.5 text-xs font-bold text-navy-900 transition-all active:scale-95'
                          : outlineButton
                      }
                    >
                      {selecting ? t.deck.select.cancel : t.deck.library.newCollection}
                    </button>
                  </div>
                </div>

                {customSet ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
                    <span className="text-sm font-semibold text-accent">
                      {t.deck.puzzle.customSet(customSet.length)}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTab('puzzle')}
                        className={`${outlineButton} inline-flex items-center gap-1.5`}
                      >
                        <PlayIcon size={11} />
                        {t.deck.tabs.puzzle}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPuzzleWords(null)}
                        className={outlineButton}
                      >
                        {t.deck.puzzle.playWholeDeck}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-line bg-surface/60 px-5 py-6 text-sm leading-relaxed text-muted">
                    {t.deck.library.noCollections}
                  </p>
                )}

                <div className="mt-6">
                  <LibraryToolbar
                    query={query}
                    onQuery={setQuery}
                    level={level}
                    onLevel={setLevel}
                    levels={levelIndex?.LEVELS ?? null}
                    progress={progress}
                    onProgress={setProgress}
                    counts={{ saved: learning.length, known: known.length }}
                    view={view}
                    onView={setView}
                  />
                </div>
              </>
            )}

            <div className="mt-6">
              {tab === 'explore' ? (
                <div className="rounded-xl border border-line bg-surface p-8 text-center sm:p-12">
                  <p className="text-4xl" aria-hidden="true">
                    🧭
                  </p>
                  <h2 className="mt-3 text-xl font-bold text-heading">{t.deck.tabs.explore}</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-body">
                    {t.deck.library.exploreSoon}
                  </p>
                </div>
              ) : tab === 'library' ? (
                <>
                  {visibleWords.length === 0 ? (
                    <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center">
                      <p className="text-sm text-muted">{t.deck.library.noMatches}</p>
                      {filtered && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className={`${outlineButton} mt-3`}
                        >
                          {t.deck.library.clearFilters}
                        </button>
                      )}
                    </div>
                  ) : view === 'grid' ? (
                    <WordGrid
                      words={visibleWords}
                      onRemove={handleRemove}
                      onSetStatus={handleSetStatus}
                      selecting={selecting}
                      selected={selected}
                      onToggleSelect={toggleSelect}
                    />
                  ) : (
                    <WordList
                      words={visibleWords}
                      onRemove={handleRemove}
                      onSetStatus={handleSetStatus}
                      selecting={selecting}
                      selected={selected}
                      onToggleSelect={toggleSelect}
                    />
                  )}

                  {selecting && selected.size > 0 && (
                    <SelectionBar chosen={selected.size} onMakePuzzle={makePuzzle} />
                  )}
                </>
              ) : tab === 'puzzle' ? (
                <>
                  {puzzleQuestions === customSet && customSet && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
                      <span className="text-sm font-semibold text-accent">
                        {t.deck.puzzle.customSet(customSet.length)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPuzzleWords(null)}
                        className="rounded-full border border-line-strong px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:border-accent hover:text-accent"
                      >
                        {t.deck.puzzle.playWholeDeck}
                      </button>
                    </div>
                  )}
                  {/* Wrong answers always come from the whole learning list, so
                      a four-word set still offers believable options. */}
                  <PuzzleMode words={puzzleQuestions} pool={learning} />
                </>
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
