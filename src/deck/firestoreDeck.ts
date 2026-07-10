// Firestore-backed DeckSource for signed-in users (users/{uid}/words).
// Every record passes toDeckWord() before reaching the UI, so malformed or
// hostile documents are dropped/sanitized rather than rendered (A03/A08).
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { firestoreDb } from '../lib/firebase'
import { toDeckWord, type DeckSource, type DeckWord, type WordStatus } from './DeckSource'

export function createFirestoreDeck(uid: string): DeckSource {
  const words = () => collection(firestoreDb(), 'users', uid, 'words')

  return {
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
  }
}
