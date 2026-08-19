import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import {
  ALL_ID,
  loadDataset,
  loadManifest,
  type DatasetMeta,
  type ExploreEntry,
} from '../../data/exploreDatasets'
import type { WordStatus } from '../../deck/DeckSource'
import { SearchIcon } from '../ui/DeckIcons'
import ExploreTile from './ExploreTile'
import ExploreLetterRail from './ExploreLetterRail'

interface Props {
  /** Normalized word -> its status in the deck. Built once by MyDeck from the
   *  live Firestore list, so a tile knows whether it is already owned. */
  deckStatus: Map<string, WordStatus>
  /** Resolves when the word is in the deck; rejects to leave it addable. */
  onAdd: (entry: ExploreEntry) => Promise<void>
  /** Persisted by MyDeck so switching tabs does not reset the browse position,
   *  the same reason the Library's own controls live up there. */
  view: string
  onView: (next: string) => void
  query: string
  onQuery: (next: string) => void
  /** Active letter from the A-Z rail, or null for the whole list. */
  letter: string | null
  onLetter: (next: string | null) => void
}

/** How many tiles are rendered before "Show more".
 *
 *  A dataset is 989-1379 entries and the All view is 2,806 - two orders of
 *  magnitude past what WordGrid is built for (see its comment: "a deck is tens
 *  to low hundreds of words"). Paging keeps the DOM in the hundreds without a
 *  windowing library having to own the scroll container, which also keeps
 *  find-in-page and scroll restoration working. */
const PAGE_SIZE = 60

export default function ExploreBrowser({
  deckStatus,
  onAdd,
  view,
  onView,
  query,
  onQuery,
  letter,
  onLetter,
}: Props) {
  const { t } = useLang()
  const e = t.deck.explore

  const [manifest, setManifest] = useState<DatasetMeta[] | null>(null)
  const [entries, setEntries] = useState<ExploreEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [saveError, setSaveError] = useState<string | null>(null)
  // Bumped by Retry. A rejected load is dropped from the module cache, so
  // re-running the effect genuinely refetches rather than replaying the failure.
  const [attempt, setAttempt] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    loadManifest()
      .then((list) => {
        if (live) setManifest(list)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [attempt])

  // `live` guards against a fast SAT -> C1 -> SAT switch landing a stale
  // response over a newer one; the same pattern MyDeck uses for wordLevels.
  useEffect(() => {
    let live = true
    setEntries(null)
    setFailed(false)
    loadDataset(view)
      .then((list) => {
        if (live) setEntries(list)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [view, attempt])

  // Filtering ~2,800 entries is well under a frame, but deferring it keeps the
  // input itself responsive on a slow phone without a hand-rolled debounce.
  const deferredQuery = useDeferredValue(query)

  // Search narrows first, the letter second. Order matters: the rail's counts
  // are taken from this list, so a letter is only offered when it would leave
  // something on screen, and picking one can never resurrect a word the search
  // excluded.
  const searched = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q || !entries) return entries ?? []
    // Same three fields the Library searches, so the two tabs behave alike.
    return entries.filter(
      (entry) =>
        entry.word.toLowerCase().includes(q) ||
        entry.vietnamese.toLowerCase().includes(q) ||
        entry.definition.toLowerCase().includes(q),
    )
  }, [entries, deferredQuery])

  const letterCounts = useMemo(() => {
    const counts = new Map<string, number>()
    // `key` is the normalized headword, so its first character is always a
    // plain a-z letter - no bucket is needed for anything else.
    for (const entry of searched) {
      const first = entry.key[0]
      counts.set(first, (counts.get(first) ?? 0) + 1)
    }
    return counts
  }, [searched])

  const matches = useMemo(
    () => (letter ? searched.filter((entry) => entry.key[0] === letter) : searched),
    [searched, letter],
  )

  useEffect(() => {
    setShown(PAGE_SIZE)
  }, [view, deferredQuery, letter])

  // A letter that is no longer on offer - the dataset changed, or the search
  // narrowed past it - would otherwise leave an empty grid and no way back.
  useEffect(() => {
    if (letter && entries && !letterCounts.has(letter)) onLetter(null)
  }, [letter, entries, letterCounts, onLetter])

  const handleLetter = (next: string | null) => {
    onLetter(next)
    // The grid is long; without this a pick from halfway down the rail leaves
    // you looking at the middle of the new, much shorter list.
    resultsRef.current?.scrollIntoView({ block: 'nearest' })
  }

  const handleAdd = async (entry: ExploreEntry) => {
    setSaveError(null)
    setSaving((cur) => new Set(cur).add(entry.key))
    try {
      await onAdd(entry)
    } catch (err) {
      setSaveError(err instanceof Error && err.name === 'DailyLimitError' ? 'limit' : 'failed')
    } finally {
      setSaving((cur) => {
        const next = new Set(cur)
        next.delete(entry.key)
        return next
      })
    }
  }

  const pill = 'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95'
  const outlineButton =
    'cursor-pointer rounded-full border border-line-strong px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:border-accent hover:text-accent'

  // "All" is not a manifest entry - like DATASET_REGISTRY.all it owns no file.
  const views: { id: string; label: string; count: number | null }[] = [
    ...(manifest ?? []).map((d) => ({ id: d.id, label: d.label, count: d.count })),
    { id: ALL_ID, label: e.allDatasets, count: null },
  ]

  return (
    <div>
      <p className="text-sm leading-relaxed text-body">{e.subtitle}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-line-strong/70">
          {views.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => onView(id)}
              aria-pressed={view === id}
              className={`${pill} ${
                view === id ? 'bg-surface text-heading shadow-soft' : 'text-muted hover:text-heading'
              }`}
            >
              {count === null ? label : e.datasetCount(label, count)}
            </button>
          ))}
        </div>

        <span className="relative inline-flex flex-1 items-center sm:flex-initial">
          <SearchIcon className="pointer-events-none absolute left-3 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(ev) => onQuery(ev.target.value)}
            placeholder={e.search}
            aria-label={e.search}
            className="w-full rounded-full border border-line-strong bg-surface py-2 pr-4 pl-9 text-sm text-body transition-colors placeholder:text-faint hover:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-60"
          />
        </span>
      </div>

      {saveError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {saveError === 'limit' ? e.limitReached(200) : e.saveFailed}
        </p>
      )}

      <div className="mt-5" ref={resultsRef}>
        {failed ? (
          <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center">
            <p className="text-sm text-muted">{e.loadError}</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${outlineButton} mt-3`}>
              {e.retry}
            </button>
          </div>
        ) : entries === null ? (
          <p className="px-5 py-8 text-sm text-muted" role="status">
            {e.loading}
          </p>
        ) : (
          /* The rail sits outside the no-matches branch on purpose: a search
             that leaves nothing still needs a way back to a letter that has
             something. */
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {matches.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center">
                  <p className="text-sm text-muted">{e.noMatches}</p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-muted">
                    {e.showing(Math.min(shown, matches.length), matches.length)}
                  </p>

                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {matches.slice(0, shown).map((entry) => (
                      <ExploreTile
                        key={entry.id}
                        entry={entry}
                        deckStatus={deckStatus.get(entry.key) ?? null}
                        saving={saving.has(entry.key)}
                        onAdd={handleAdd}
                      />
                    ))}
                  </ul>

                  {shown < matches.length && (
                    <div className="mt-5 text-center">
                      {/* A button rather than a scroll sentinel: useInView
                          disconnects after the first intersection, so it cannot
                          drive a repeating load, and an explicit control stays
                          keyboard-reachable. */}
                      <button
                        type="button"
                        onClick={() => setShown((n) => n + PAGE_SIZE)}
                        className={outlineButton}
                      >
                        {e.showMore}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <ExploreLetterRail letter={letter} onLetter={handleLetter} counts={letterCounts} />
          </div>
        )}
      </div>
    </div>
  )
}
