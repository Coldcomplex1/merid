// Mock DeckSource for the /demo testing environment: seeds from the bundled
// landing-page vocab and persists edits to localStorage only. Lets the whole
// My Deck UI (list, remove, puzzle, flashcards) be exercised without Firebase.
import { VOCAB } from '../data/vocab'
import { toDeckWord, type DeckSource, type DeckWord, type WordStatus } from './DeckSource'

const STORAGE_KEY = 'merid-demo-deck'

function seed(): DeckWord[] {
  const now = Date.now()
  return Object.values(VOCAB)
    .map((entry, i) =>
      toDeckWord({
        word: entry.word,
        vietnamese: entry.viMeaning,
        definition: entry.definition,
        example: entry.example,
        pos: entry.pos,
        status: 'saved',
        createdAt: now - i * 60_000,
      }),
    )
    .filter((w): w is DeckWord => w !== null)
}

function load(): DeckWord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const words = parsed.map(toDeckWord).filter((w): w is DeckWord => w !== null)
        if (words.length) return words
      }
    }
  } catch {
    // Corrupted storage — fall back to a fresh seed.
  }
  return seed()
}

function save(words: DeckWord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words))
  } catch {
    // Quota/private-mode failures are fine for a demo.
  }
}

export function createMockDeck(): DeckSource {
  let words = load()
  save(words)
  return {
    async listWords() {
      return [...words]
    },
    async removeWord(word: string) {
      words = words.filter((w) => w.word !== word)
      save(words)
    },
    async setStatus(word: string, status: WordStatus) {
      words = words.map((w) => (w.word === word ? { ...w, status } : w))
      save(words)
    },
  }
}

/** Restore the demo deck to its initial sample state. */
export function resetMockDeck() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
