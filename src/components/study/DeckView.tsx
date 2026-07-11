import { useCallback, useEffect, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { DeckSource, DeckWord, WordStatus } from '../../deck/DeckSource'
import WordList from './WordList'
import PuzzleMode from './PuzzleMode'
import FlashcardMode from './FlashcardMode'

type Tab = 'words' | 'puzzle' | 'flashcards'

interface Props {
  source: DeckSource
  title: string
  /** Optional notice rendered under the title (e.g. demo-mode banner). */
  banner?: string
}

/** The full deck experience (list / puzzle / flashcards) over any DeckSource.
 *  /my-deck and /demo render this exact component with different sources. */
export default function DeckView({ source, title, banner }: Props) {
  const { t } = useLang()
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

  useEffect(() => reload(), [reload])

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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {words && <span className="text-sm text-navy-300">{t.deck.wordCount(words.length)}</span>}
      </div>
      {banner && (
        <p className="mt-3 rounded-lg border border-gold-400/30 bg-gold-400/10 px-4 py-2.5 text-sm text-gold-200">
          {banner}
        </p>
      )}

      <div className="mt-6 flex gap-2 border-b border-navy-700">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === id ? 'border-gold-400 text-gold-300' : 'border-transparent text-navy-300 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {error ? (
          <p className="rounded-xl border border-red-400/40 bg-red-400/10 p-6 text-red-200">
            {t.deck.auth.errors.network}
          </p>
        ) : words === null ? (
          <p className="p-6 text-navy-300" role="status">
            {t.deck.loading}
          </p>
        ) : tab === 'words' ? (
          <WordList words={words} onRemove={handleRemove} onSetStatus={handleSetStatus} />
        ) : tab === 'puzzle' ? (
          <PuzzleMode words={learning} />
        ) : (
          <FlashcardMode words={learning} />
        )}
      </div>
    </div>
  )
}
