// Firestore-backed DeckSource for signed-in users (users/{uid}/words).
// Every record passes toDeckWord() before reaching the UI, so malformed or
// hostile documents are dropped/sanitized rather than rendered (A03/A08).
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { firestoreDb } from '../lib/firebase'
import { sanitizeVocabText, LIMITS } from '../lib/sanitize'
import {
  DailyLimitError,
  toDeckWord,
  type DeckSource,
  type DeckWord,
  type NewDeckWord,
  type WordStatus,
} from './DeckSource'

/** Mirrors dailyLimit() in firestore.rules. Creating a word past this is
 *  rejected at the database, so the check here is only to fail early with a
 *  message the UI can explain. */
const DAILY_LIMIT = 200

/** Days since the Unix epoch, UTC - the client half of the counter protocol
 *  the rules enforce as int(request.time.toMillis() / 86400000). */
function todayIndex(): number {
  return Math.floor(Date.now() / 86400000)
}

export function createFirestoreDeck(uid: string): DeckSource {
  const words = () => collection(firestoreDb(), 'users', uid, 'words')

  const userDoc = () => doc(firestoreDb(), 'users', uid)

  return {
    // Creating a word and bumping the owner's daily counter must land in ONE
    // commit - firestore.rules rejects the word otherwise (counterBumped()).
    // This is the same protocol the extension speaks in lib/sync.js
    // (createWordCommit); the two must stay in step or one of them stops being
    // able to save.
    async addWord(entry: NewDeckWord) {
      const word = sanitizeVocabText(entry.word, LIMITS.word)
      if (!word) throw new Error('empty word')

      const snap = await getDoc(userDoc())
      const today = todayIndex()
      const counter = snap.data()
      const sameDay = Boolean(counter) && counter!.countDay === today
      const used = sameDay ? (counter!.wordCountToday ?? 0) : 0
      if (used >= DAILY_LIMIT) throw new DailyLimitError(DAILY_LIMIT)

      const batch = writeBatch(firestoreDb())
      if (!snap.exists()) {
        // First word this account has ever saved: the batch has to create the
        // profile doc that anchors the counter, at exactly 1.
        batch.set(userDoc(), { createdAt: serverTimestamp(), wordCountToday: 1, countDay: today })
      } else {
        // A merge-set of ONLY the counter fields: validUserDoc() wants all three
        // keys present, and the update rule wants createdAt untouched, so the
        // write must add to the doc rather than replace it. Same shape as
        // createWordBatch() in test/firestore-rules.test.mjs, which is the
        // proven form of this protocol. A new UTC day restarts the count.
        batch.set(userDoc(), { wordCountToday: used + 1, countDay: today }, { merge: true })
      }

      batch.set(doc(words(), word), {
        word,
        vietnamese: sanitizeVocabText(entry.vietnamese, LIMITS.vietnamese),
        definition: sanitizeVocabText(entry.definition, LIMITS.definition),
        example: sanitizeVocabText(entry.example, LIMITS.example),
        pos: sanitizeVocabText(entry.pos, LIMITS.pos),
        status: 'saved',
        datasets: entry.datasets.slice(0, 4),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      try {
        await batch.commit()
      } catch (err) {
        // Two tabs saving at once can both read the same counter and race; the
        // loser is refused by counterBumped(). At the cap that is the limit
        // being hit, which the UI explains rather than calling it a failure.
        if ((err as { code?: string }).code === 'permission-denied' && used + 1 >= DAILY_LIMIT) {
          throw new DailyLimitError(DAILY_LIMIT)
        }
        throw err
      }
    },
    async listWords() {
      const snap = await getDocs(query(words(), orderBy('createdAt', 'desc')))
      return snap.docs
        .map((d) => toDeckWord(d.data()))
        .filter((w): w is DeckWord => w !== null)
    },
    async removeWord(word: string) {
      await deleteDoc(doc(words(), word))
    },
    async setStatus(word: string, status: WordStatus) {
      await updateDoc(doc(words(), word), { status, updatedAt: serverTimestamp() })
    },
    subscribe(onWords, onError) {
      return onSnapshot(
        query(words(), orderBy('createdAt', 'desc')),
        (snap) => {
          onWords(snap.docs.map((d) => toDeckWord(d.data())).filter((w): w is DeckWord => w !== null))
        },
        onError,
      )
    },
  }
}
