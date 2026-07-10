import { sanitizeVocabText, LIMITS } from '../lib/sanitize'

export type WordStatus = 'saved' | 'known'

/** One word in a user's deck — the UI-side mirror of users/{uid}/words/{id}. */
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

/**
 * Swappable deck backend. `/my-deck` uses the Firestore implementation,
 * `/demo` uses the in-browser mock — both drive the exact same UI, so every
 * deck feature can be tested end-to-end without touching Firebase.
 */
export interface DeckSource {
  listWords(): Promise<DeckWord[]>
  removeWord(word: string): Promise<void>
  setStatus(word: string, status: WordStatus): Promise<void>
}

/** Runtime shape-check + sanitization for records arriving from outside the
 *  bundle (A03/A08). Returns null for anything malformed — callers drop it. */
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
