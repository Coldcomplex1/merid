import { useMemo, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord } from '../../deck/DeckSource'

const OPTION_COUNT = 4

interface Round {
  /** The example sentence with the target word blanked out. */
  clozed: string
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

/** Build one puzzle round from a word, validating every input (A08): the
 *  example must actually contain the word, and there must be enough distinct
 *  distractors to always end up with exactly OPTION_COUNT options. */
function buildRound(target: DeckWord, allWords: readonly DeckWord[]): Round | null {
  if (!target.word || !target.example) return null
  const re = new RegExp(target.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  if (!re.test(target.example)) return null

  const distractors = shuffle(
    allWords.map((w) => w.word).filter((w) => w && w !== target.word),
  ).slice(0, OPTION_COUNT - 1)
  if (distractors.length < OPTION_COUNT - 1) return null

  return {
    clozed: target.example.replace(re, '_____'),
    answer: target.word,
    options: shuffle([target.word, ...distractors]),
  }
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
    return <p className="rounded-xl border border-navy-700 bg-navy-850 p-6 text-navy-300">{t.deck.puzzle.needMore}</p>
  }

  const finished = index >= rounds.length
  if (finished) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-850 p-8 text-center">
        <p className="text-2xl font-bold text-white">{t.deck.puzzle.score(right, rounds.length)}</p>
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
    <div className="rounded-xl border border-navy-700 bg-navy-850 p-6 sm:p-8">
      <p className="text-xs font-semibold tracking-wide text-navy-300 uppercase">
        {index + 1} / {rounds.length} · {t.deck.puzzle.prompt}
      </p>
      <p className="mt-4 font-serif text-lg leading-relaxed text-white">{round.clozed}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {round.options.map((option) => {
          const isAnswer = option === round.answer
          const isPicked = option === picked
          let style = 'border-navy-600 text-navy-100 hover:border-gold-400 hover:text-gold-200'
          if (answered) {
            if (isAnswer) style = 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
            else if (isPicked) style = 'border-red-400 bg-red-400/10 text-red-300'
            else style = 'border-navy-700 text-navy-400'
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
          <p className={`text-sm font-semibold ${isCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
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
