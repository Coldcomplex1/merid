import { sanitizeVocabText, LIMITS } from '../lib/sanitize'
import type { Dataset } from '../data/vocab'

export type WordStatus = 'saved' | 'known'

/** One word in a user's deck, the UI-side mirror of users/{uid}/words/{id}. */
export interface DeckWord {
  word: string
  vietnamese: string
  definition: string
  example: string
  pos: string
  status: WordStatus
  /** Epoch ms; 0 when the backend didn't provide it. */
  createdAt: number
}

/** What Explore hands to addWord. Everything a DeckWord has except the fields
 *  the backend owns: `status` always starts at 'saved', and `createdAt` is the
 *  server's clock. `datasets` records which shipped word list the entry came
 *  from - firestore.rules has always allowed the field, and Explore is the
 *  first writer that actually knows the answer. */
export interface NewDeckWord {
  word: string
  vietnamese: string
  definition: string
  example: string
  pos: string
  datasets: Dataset[]
}

/** Doc ids are the word itself, and firestore.rules constrains them to
 *  lowercase letters plus internal space, hyphen or apostrophe. Four of the
 *  2,806 shipped headwords cannot pass it - `e.g.`, `façade`, `naïve`,
 *  `précis` - so Explore checks here and disables Add rather than letting the
 *  write fail at the server. Keep the pattern identical to validWord() in
 *  firestore.rules. */
export function canSaveWord(word: string): boolean {
  return word.length >= 1 && word.length <= LIMITS.word && /^[a-z](?:[a-z '-]*[a-z])?$/.test(word)
}

/** Thrown by addWord when the account has used its 200 creates for the UTC day.
 *  A distinct type because the UI says something specific about it - every
 *  other failure is just "could not save". */
export class DailyLimitError extends Error {
  constructor(readonly limit: number) {
    super(`daily limit of ${limit} words reached`)
    this.name = 'DailyLimitError'
  }
}

/**
 * Swappable deck backend. `/my-deck` drives the whole deck UI through this
 * interface, keeping the Firestore implementation decoupled from components.
 */
export interface DeckSource {
  listWords(): Promise<DeckWord[]>
  /** Create a word in the deck at status 'saved'. Rejects with DailyLimitError
   *  once the account's per-day create cap is spent. */
  addWord(entry: NewDeckWord): Promise<void>
  removeWord(word: string): Promise<void>
  setStatus(word: string, status: WordStatus): Promise<void>
  /** Optional live feed: when provided, the UI subscribes instead of doing a
   *  one-shot list, so words synced from the extension appear without a
   *  refresh. Returns an unsubscribe function. */
  subscribe?(onWords: (words: DeckWord[]) => void, onError: () => void): () => void
}

/** Runtime shape-check + sanitization for records arriving from outside the
 *  bundle (A03/A08). Returns null for anything malformed so callers drop it. */
export function toDeckWord(raw: unknown): DeckWord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const word = sanitizeVocabText(r.word, LIMITS.word)
  if (!word) return null
  const status: WordStatus = r.status === 'known' ? 'known' : 'saved'
  const createdAt =
    typeof r.createdAt === 'number'
      ? r.createdAt
      : r.createdAt instanceof Object && typeof (r.createdAt as { toMillis?: () => number }).toMillis === 'function'
        ? (r.createdAt as { toMillis: () => number }).toMillis()
        : 0
  return {
    word,
    vietnamese: sanitizeVocabText(r.vietnamese, LIMITS.vietnamese),
    definition: sanitizeVocabText(r.definition, LIMITS.definition),
    example: sanitizeVocabText(r.example, LIMITS.example),
    pos: sanitizeVocabText(r.pos, LIMITS.pos),
    status,
    createdAt,
  }
}
