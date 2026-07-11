// Security-rules tests. Run against the Firestore emulator:
//   npm run test:rules
// (wraps: firebase emulators:exec --only firestore "node --test test/firestore-rules.test.mjs")
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore'

let env

const ALICE = 'alice-uid'
const BOB = 'bob-uid'
const today = Math.floor(Date.now() / 86400000)

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'merid-rules-test',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080),
    },
  })
})

after(async () => {
  await env?.cleanup()
})

function db(uid) {
  return uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()
}

function wordPayload(word, extra = {}) {
  return {
    word,
    vietnamese: 'ví dụ',
    definition: 'a definition',
    example: 'An example sentence.',
    pos: 'noun',
    status: 'saved',
    datasets: ['SAT'],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  }
}

/** Create a word the compliant way: word doc + counter bump in one batch.
 *  Mirrors what real clients do — full set (with createdAt) when the user doc
 *  doesn't exist yet, merge-set of ONLY the counter fields afterwards so the
 *  immutable createdAt is left untouched. */
function createWordBatch(firestore, uid, word, { count = 1, payload, userExists = false } = {}) {
  const batch = writeBatch(firestore)
  const userRef = doc(firestore, 'users', uid)
  if (userExists) {
    batch.set(userRef, { wordCountToday: count, countDay: today }, { merge: true })
  } else {
    batch.set(userRef, { createdAt: serverTimestamp(), wordCountToday: count, countDay: today })
  }
  batch.set(doc(firestore, 'users', uid, 'words', word), payload ?? wordPayload(word))
  return batch.commit()
}

test('unauthenticated access is denied everywhere', async () => {
  await assertFails(getDoc(doc(db(null), 'users', ALICE)))
  await assertFails(getDoc(doc(db(null), 'users', ALICE, 'words', 'elaborate')))
  await assertFails(setDoc(doc(db(null), 'anything', 'else'), { a: 1 }))
})

test('owner can create a word with the counter batch and read it back', async () => {
  await assertSucceeds(createWordBatch(db(ALICE), ALICE, 'elaborate'))
  await assertSucceeds(getDoc(doc(db(ALICE), 'users', ALICE, 'words', 'elaborate')))
})

test('user B cannot read or write user A data, even with a forged payload', async () => {
  await env.clearFirestore()
  await assertSucceeds(createWordBatch(db(ALICE), ALICE, 'elaborate'))
  const bob = db(BOB)
  await assertFails(getDoc(doc(bob, 'users', ALICE)))
  await assertFails(getDoc(doc(bob, 'users', ALICE, 'words', 'elaborate')))
  await assertFails(createWordBatch(bob, ALICE, 'forged'))
  await assertFails(deleteDoc(doc(bob, 'users', ALICE, 'words', 'elaborate')))
})

test('creating a word WITHOUT bumping the counter is rejected', async () => {
  await env.clearFirestore()
  await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'words', 'sneaky'), wordPayload('sneaky')))
})

test('schema violations are rejected at the DB boundary', async () => {
  await env.clearFirestore()
  const cases = [
    // wordId does not match payload word
    { word: 'mismatch', payload: wordPayload('other') },
    // uppercase / non-normalized word
    { word: 'Upper', payload: wordPayload('Upper') },
    // HTML/script-looking word (regex rejects it)
    { word: 'x<script>', payload: wordPayload('x<script>') },
    // unknown extra field
    { word: 'extra', payload: wordPayload('extra', { isAdmin: true }) },
    // wrong type
    { word: 'badtype', payload: wordPayload('badtype', { definition: 123 }) },
    // over length limit
    { word: 'toolong', payload: wordPayload('toolong', { example: 'x'.repeat(1025) }) },
    // invalid status
    { word: 'badstatus', payload: wordPayload('badstatus', { status: 'hacked' }) },
    // dataset outside the allowlist
    { word: 'baddataset', payload: wordPayload('baddataset', { datasets: ['EVIL'] }) },
  ]
  for (const c of cases) {
    await assertFails(createWordBatch(db(ALICE), ALICE, c.word, { payload: c.payload }))
    await env.clearFirestore()
  }
})

test('daily rate limit: counter cannot exceed the cap or jump by more than 1', async () => {
  await env.clearFirestore()
  const alice = db(ALICE)
  await assertSucceeds(createWordBatch(alice, ALICE, 'one', { count: 1 }))
  // Correct increment succeeds…
  await assertSucceeds(createWordBatch(alice, ALICE, 'two', { count: 2, userExists: true }))
  // …skipping ahead does not (2 -> 5),
  await assertFails(createWordBatch(alice, ALICE, 'cheat', { count: 5, userExists: true }))
  // and the counter can never be written above the cap.
  await assertFails(createWordBatch(alice, ALICE, 'flood', { count: 201, userExists: true }))
})

test('counter cannot be reset backwards on the same day', async () => {
  await env.clearFirestore()
  const alice = db(ALICE)
  await assertSucceeds(createWordBatch(alice, ALICE, 'one', { count: 1 }))
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), { wordCountToday: 0, countDay: today }, { merge: true }),
  )
})

test('owner can flip status, but not rewrite identity fields', async () => {
  await env.clearFirestore()
  const alice = db(ALICE)
  await assertSucceeds(createWordBatch(alice, ALICE, 'elaborate'))
  const ref = doc(alice, 'users', ALICE, 'words', 'elaborate')
  const current = (await getDoc(ref)).data()
  await assertSucceeds(
    setDoc(ref, { ...current, status: 'known', updatedAt: serverTimestamp() }),
  )
  await assertFails(
    setDoc(ref, { ...current, word: 'renamed', updatedAt: serverTimestamp() }),
  )
})

test('owner can delete a word; user profile doc can never be deleted', async () => {
  await env.clearFirestore()
  const alice = db(ALICE)
  await assertSucceeds(createWordBatch(alice, ALICE, 'elaborate'))
  await assertSucceeds(deleteDoc(doc(alice, 'users', ALICE, 'words', 'elaborate')))
  await assertFails(deleteDoc(doc(alice, 'users', ALICE)))
})
