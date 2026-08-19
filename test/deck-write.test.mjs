// The web app's word-create protocol, against the real rules.
//
// firestore.rules will not accept a new word unless the same commit also bumps
// the owner's daily counter (counterBumped()). That contract is invisible in
// the type system and easy to break from either side, so this exercises the
// batch src/deck/firestoreDeck.ts addWord() actually builds - the port below is
// deliberately verbatim, the same duplication test/firestore-rules.test.mjs
// already accepts for createWordBatch(). If addWord changes, change this too.
//
// Runs under `npm run test:rules`, which starts the Firestore emulator.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, getDoc, writeBatch, serverTimestamp, setLogLevel } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

setLogLevel('error')
const env = await initializeTestEnvironment({
  projectId: 'merid-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
})
// A uid of its own: test/firestore-rules.test.mjs drives ALICE, and the two
// files must not contend for the same documents on a shared emulator.
const UID = 'deckwriter'
const db = () => env.authenticatedContext(UID).firestore()
const LIMITS = { word: 64, vietnamese: 128, definition: 512, example: 1024, pos: 32 }
// Same class as CONTROL_CHARS in src/lib/sanitize.ts, spelled with escapes.
const CONTROL = new RegExp(
  '[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029]', 'g')
const clean = (v, max) =>
  typeof v !== 'string' ? '' : v.normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max)

const DAILY_LIMIT = 200

/** Verbatim port of firestoreDeck.addWord's body. */
async function addWord(firestore, entry, nowMs = Date.now()) {
  const word = clean(entry.word, LIMITS.word)
  if (!word) throw new Error('empty word')
  const userRef = doc(firestore, 'users', UID)
  const snap = await getDoc(userRef)
  const today = Math.floor(nowMs / 86400000)
  const counter = snap.data()
  const sameDay = Boolean(counter) && counter.countDay === today
  const used = sameDay ? counter.wordCountToday ?? 0 : 0
  if (used >= DAILY_LIMIT) throw new Error('DailyLimitError')

  const batch = writeBatch(firestore)
  if (!snap.exists()) {
    batch.set(userRef, { createdAt: serverTimestamp(), wordCountToday: 1, countDay: today })
  } else {
    batch.set(userRef, { wordCountToday: used + 1, countDay: today }, { merge: true })
  }
  batch.set(doc(firestore, 'users', UID, 'words', word), {
    word,
    vietnamese: clean(entry.vietnamese, LIMITS.vietnamese),
    definition: clean(entry.definition, LIMITS.definition),
    example: clean(entry.example, LIMITS.example),
    pos: clean(entry.pos, LIMITS.pos),
    status: 'saved',
    datasets: (entry.datasets ?? []).slice(0, 4),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return batch.commit()
}

const entry = (word, extra = {}) => ({
  word, vietnamese: 'nghia', definition: 'a definition', example: 'An example.',
  pos: 'verb', datasets: ['SAT'], ...extra,
})

test('first ever save creates the user doc at 1', async () => {
  await env.clearFirestore()
  await assertSucceeds(addWord(db(), entry('abase')))
  assert.equal((await getDoc(doc(db(), 'users', UID))).data().wordCountToday, 1)
  const w = (await getDoc(doc(db(), 'users', UID, 'words', 'abase'))).data()
  assert.equal(w.status, 'saved')
  assert.deepEqual(w.datasets, ['SAT'])
})

test('second save bumps the counter to 2, createdAt untouched', async () => {
  const before = (await getDoc(doc(db(), 'users', UID))).data().createdAt
  await assertSucceeds(addWord(db(), entry('abate')))
  const u = (await getDoc(doc(db(), 'users', UID))).data()
  assert.equal(u.wordCountToday, 2)
  assert.deepEqual(u.createdAt, before)
})

test('a new UTC day restarts the counter at 1', async () => {
  await env.clearFirestore()
  const today = Math.floor(Date.now() / 86400000)
  // Yesterday's counter, left at the cap. The rules compute today() from
  // request.time, so the only way to reach this branch is a stale stored day.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('users/' + UID).set({
      createdAt: new Date(), wordCountToday: 200, countDay: today - 1,
    })
  })
  await assertSucceeds(addWord(db(), entry('abase')))
  const u = (await getDoc(doc(db(), 'users', UID))).data()
  assert.equal(u.wordCountToday, 1)
  assert.equal(u.countDay, today)
})

test('multi-dataset provenance is accepted', async () => {
  await env.clearFirestore()
  await assertSucceeds(addWord(db(), entry('adhere', { datasets: ['SAT', 'C1', 'C2'] })))
  const w = (await getDoc(doc(db(), 'users', UID, 'words', 'adhere'))).data()
  assert.deepEqual(w.datasets, ['SAT', 'C1', 'C2'])
})

test("the 'ALL' tag is rejected - provenance must be real dataset tags", async () => {
  await env.clearFirestore()
  await assertFails(addWord(db(), entry('abase', { datasets: ['ALL'] })))
})

test('the one over-long vietnamese (SAT compound, 137 chars) truncates, not rejects', async () => {
  await env.clearFirestore()
  const long = JSON.parse(readFileSync('public/datasets/sat.json', 'utf8')).find((e) => e.k === 'compound')
  assert.equal(long.vi.length, 137)
  await assertSucceeds(addWord(db(), entry('compound', { vietnamese: long.vi })))
  assert.equal((await getDoc(doc(db(), 'users', UID, 'words', 'compound'))).data().vietnamese.length, 128)
})

test('the daily cap is enforced by the rules, not just the pre-check', async () => {
  await env.clearFirestore()
  const today = Math.floor(Date.now() / 86400000)
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('users/' + UID).set({ createdAt: new Date(), wordCountToday: 200, countDay: today })
  })
  await assert.rejects(() => addWord(db(), entry('abase')), /DailyLimitError/)
  const fs = db()
  const batch = writeBatch(fs)
  batch.set(doc(fs, 'users', UID), { wordCountToday: 201, countDay: today }, { merge: true })
  batch.set(doc(fs, 'users', UID, 'words', 'abase'), {
    word: 'abase', status: 'saved', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  await assertFails(batch.commit())
})

test.after(async () => { await env.cleanup() })
