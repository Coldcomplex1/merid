import { useMemo, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord } from '../../deck/DeckSource'

const OPTION_COUNT = 4

interface Round {
  /** 'cloze' = fill the blank in the example sentence;
   *  'meaning' = pick the word matching the meaning (fallback for words
   *  saved without an example sentence). */
  kind: 'cloze' | 'meaning'
  /** Cloze: the example with the word blanked. Meaning: the Vietnamese meaning. */
  prompt: string
  /** Meaning rounds only: the English definition as a second hint. */
  hint: string
  answer: string
  options: string[]
}

/** Unbiased Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Build one puzzle round from a word, validating every input (A08). Prefers
 *  a cloze question (blank in the example sentence); falls back to a
 *  meaning-match question when the word has no usable example, so the puzzle
 *  works for every word regardless of how it was saved. */
function buildRound(target: DeckWord, allWords: readonly DeckWord[]): Round | null {
  if (!target.word) return null

  const distractors = shuffle(
    allWords.map((w) => w.word).filter((w) => w && w !== target.word),
  ).slice(0, OPTION_COUNT - 1)
  if (distractors.length < OPTION_COUNT - 1) return null
  const options = shuffle([target.word, ...distractors])

  const re = new RegExp(target.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  if (target.example && re.test(target.example)) {
    return { kind: 'cloze', prompt: target.example.replace(re, '_____'), hint: '', answer: target.word, options }
  }
  if (target.vietnamese || target.definition) {
    return {
      kind: 'meaning',
      prompt: target.vietnamese || target.definition,
      hint: target.vietnamese ? target.definition : '',
      answer: target.word,
      options,
    }
  }
  return null
}

function buildRounds(words: readonly DeckWord[]): Round[] {
  return shuffle(words)
    .map((w) => buildRound(w, words))
    .filter((r): r is Round => r !== null)
}

export default function PuzzleMode({ words }: { words: DeckWord[] }) {
  const { t } = useLang()
  const [session, setSession] = useState(0) // bump to reshuffle
  const rounds = useMemo(() => buildRounds(words), [words, session])

  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [right, setRight] = useState(0)

  if (!rounds.length) {
    return <p className="rounded-xl border border-line bg-surface p-6 text-muted">{t.deck.puzzle.needMore}</p>
  }

  const finished = index >= rounds.length
  if (finished) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <p className="text-2xl font-bold text-heading">{t.deck.puzzle.score(right, rounds.length)}</p>
        <button
          type="button"
          onClick={() => {
            setSession((s) => s + 1)
            setIndex(0)
            setPicked(null)
            setRight(0)
          }}
          className="mt-5 rounded-full bg-gold-400 px-6 py-2.5 text-sm font-bold text-navy-900 transition-all hover:bg-gold-300 active:scale-95"
        >
          {t.deck.puzzle.restart}
        </button>
      </div>
    )
  }

  const round = rounds[index]
  const answered = picked !== null
  const isCorrect = picked === round.answer

  return (
    <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        {index + 1} / {rounds.length} · {round.kind === 'cloze' ? t.deck.puzzle.prompt : t.deck.puzzle.promptMeaning}
      </p>
      <p
        lang={round.kind === 'meaning' ? 'vi' : 'en'}
        className="mt-4 font-display text-lg leading-relaxed text-heading"
      >
        {round.kind === 'meaning' ? `“${round.prompt}”` : round.prompt}
      </p>
      {round.hint && <p className="mt-1.5 text-sm text-muted italic">{round.hint}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {round.options.map((option) => {
          const isAnswer = option === round.answer
          const isPicked = option === picked
          let style = 'border-line-strong text-body hover:border-accent hover:text-accent'
          if (answered) {
            if (isAnswer) style = 'border-success/60 bg-success/10 text-success'
            else if (isPicked) style = 'border-danger/60 bg-danger/10 text-danger'
            else style = 'border-line text-faint'
          }
          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => {
                setPicked(option)
                if (isAnswer) setRight((r) => r + 1)
              }}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${style}`}
            >
              {option}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm font-semibold ${isCorrect ? 'text-success' : 'text-danger'}`}>
            {isCorrect ? t.deck.puzzle.correct : t.deck.puzzle.wrong(round.answer)}
          </p>
          <button
            type="button"
            onClick={() => {
              setIndex((i) => i + 1)
              setPicked(null)
            }}
            className="rounded-full bg-gold-400 px-5 py-2 text-sm font-bold text-navy-900 transition-all hover:bg-gold-300 active:scale-95"
          >
            {t.deck.puzzle.next}
          </button>
        </div>
      )}
    </div>
  )
}
