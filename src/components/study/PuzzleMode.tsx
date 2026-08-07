import { useMemo, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { DeckWord } from '../../deck/DeckSource'

const OPTION_COUNT = 4

/** Fewest words a puzzle can be built from: one answer plus three believable
 *  wrong options. Lives here, next to OPTION_COUNT it is derived from, so the
 *  two can never drift apart. */
export const MIN_PUZZLE_WORDS = OPTION_COUNT

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

/** Unbiased Fisher-Yates shuffle (returns a new array). */
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
 *  works for every word regardless of how it was saved.
 *
 *  `allWords` is the pool the wrong answers come from, and is deliberately
 *  separate from the set being quizzed: a retry round over three missed words
 *  still needs four plausible options, and they come from the rest of the deck. */
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

function buildRounds(words: readonly DeckWord[], pool: readonly DeckWord[]): Round[] {
  return shuffle(words)
    .map((w) => buildRound(w, pool))
    .filter((r): r is Round => r !== null)
}

interface Props {
  words: DeckWord[]
  /** Pool the wrong answers are drawn from. Defaults to `words`; a custom set
   *  passes the whole deck so a 4-word set still has believable options. */
  pool?: DeckWord[]
}

export default function PuzzleMode({ words, pool }: Props) {
  const { t } = useLang()
  const answerPool = pool && pool.length >= OPTION_COUNT ? pool : words

  // Bumping `session` reshuffles. `subset` narrows the questions without
  // touching the answer pool - that is how "retry the ones you got wrong" works.
  const [session, setSession] = useState(0)
  const [subset, setSubset] = useState<DeckWord[] | null>(null)
  const rounds = useMemo(
    () => buildRounds(subset ?? words, answerPool),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session is the reshuffle trigger
    [words, answerPool, subset, session],
  )

  // One slot per round rather than a single "current pick", so moving back and
  // forth shows what you actually answered and the score is never guessed at -
  // it is recounted from this array every render.
  const [answers, setAnswers] = useState<(string | null)[]>([])
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)

  if (!rounds.length) {
    return <p className="rounded-xl border border-line bg-surface p-6 text-muted">{t.deck.puzzle.needMore}</p>
  }

  // The deck is a live subscription, so a word can be removed - or marked
  // known from another tab - mid-game and leave `rounds` shorter than the
  // question we are sitting on. Clamp rather than index off the end.
  const safeIndex = Math.min(index, rounds.length - 1)

  const right = rounds.reduce((n, r, i) => (answers[i] === r.answer ? n + 1 : n), 0)
  const wrongWords = rounds
    .filter((r, i) => answers[i] != null && answers[i] !== r.answer)
    .map((r) => (subset ?? words).find((w) => w.word === r.answer))
    .filter((w): w is DeckWord => !!w)

  const restart = (nextSubset: DeckWord[] | null) => {
    setSubset(nextSubset)
    setSession((s) => s + 1)
    setAnswers([])
    setIndex(0)
    setFinished(false)
  }

  if (finished) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <p className="text-2xl font-bold text-heading">{t.deck.puzzle.score(right, rounds.length)}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {wrongWords.length > 0 ? (
            <button
              type="button"
              onClick={() => restart(wrongWords)}
              className="rounded-full bg-gold-400 px-6 py-2.5 text-sm font-bold text-navy-900 transition-all hover:bg-gold-300 active:scale-95"
            >
              {t.deck.puzzle.retryWrong(wrongWords.length)}
            </button>
          ) : (
            <p className="text-sm text-muted">{t.deck.puzzle.allCorrect}</p>
          )}
          <button
            type="button"
            onClick={() => restart(null)}
            className={`rounded-full px-6 py-2.5 text-sm font-bold transition-all active:scale-95 ${
              wrongWords.length > 0
                ? 'border border-line-strong text-body hover:border-accent hover:text-accent'
                : 'bg-gold-400 text-navy-900 hover:bg-gold-300'
            }`}
          >
            {t.deck.puzzle.restart}
          </button>
        </div>
      </div>
    )
  }

  const round = rounds[safeIndex]
  const picked = answers[safeIndex] ?? null
  const answered = picked !== null
  const isCorrect = picked === round.answer
  const isLast = safeIndex === rounds.length - 1
  // Answered questions are read-only on the way back: the score should reflect
  // what you knew at the time, not what you worked out afterwards.
  const furthest = answers.reduce<number>((max, a, i) => (a != null ? Math.max(max, i + 1) : max), 0)

  const answer = (option: string) => {
    if (answered) return
    setAnswers((prev) => {
      const next = [...prev]
      next[safeIndex] = option
      return next
    })
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      {/* One dot per question: grey = unanswered, gold = right, red = wrong.
          Doubles as the way to jump straight to a question you have reached. */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {rounds.map((r, i) => {
          const a = answers[i]
          const tone =
            a == null ? 'bg-line-strong' : a === r.answer ? 'bg-gold-400' : 'bg-danger/60'
          const reachable = i <= furthest
          return (
            <button
              key={i}
              type="button"
              disabled={!reachable}
              onClick={() => setIndex(i)}
              aria-label={t.deck.puzzle.jumpTo(i + 1)}
              aria-current={i === safeIndex}
              className={`h-2 rounded-full transition-all ${tone} ${
                i === safeIndex ? 'w-6 ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'w-2'
              } ${reachable ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
            />
          )
        })}
      </div>

      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        {safeIndex + 1} / {rounds.length} · {round.kind === 'cloze' ? t.deck.puzzle.prompt : t.deck.puzzle.promptMeaning}
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
              onClick={() => answer(option)}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${style}`}
            >
              {option}
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={safeIndex === 0}
          onClick={() => setIndex((i) => i - 1)}
          className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-body transition-colors hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:text-body"
        >
          ← {t.deck.puzzle.prev}
        </button>

        {answered && (
          <p className={`order-last w-full text-sm font-semibold sm:order-none sm:w-auto ${isCorrect ? 'text-success' : 'text-danger'}`}>
            {isCorrect ? t.deck.puzzle.correct : t.deck.puzzle.wrong(round.answer)}
          </p>
        )}

        <button
          type="button"
          disabled={!answered}
          onClick={() => (isLast ? setFinished(true) : setIndex((i) => i + 1))}
          className="rounded-full bg-gold-400 px-5 py-2 text-sm font-bold text-navy-900 transition-all hover:bg-gold-300 active:scale-95 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-gold-400"
        >
          {isLast ? t.deck.puzzle.score(right, rounds.length) : t.deck.puzzle.next}
        </button>
      </div>
    </div>
  )
}
