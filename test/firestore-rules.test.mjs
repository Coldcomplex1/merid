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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  deleteDoc,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'

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

// ---------------------------------------------------------------------------
// users/{uid}/settings/ai – private Gemini API key backup
// ---------------------------------------------------------------------------
function aiKeyDoc(firestore, uid) {
  return doc(firestore, 'users', uid, 'settings', 'ai')
}

test('owner can store, read, replace and delete their own AI key', async () => {
  await env.clearFirestore()
  const alice = db(ALICE)
  await assertSucceeds(setDoc(aiKeyDoc(alice, ALICE), { geminiKey: 'AIzaFakeKey_for-tests', updatedAt: serverTimestamp() }))
  await assertSucceeds(getDoc(aiKeyDoc(alice, ALICE)))
  await assertSucceeds(setDoc(aiKeyDoc(alice, ALICE), { geminiKey: 'AIzaReplacedKey', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(aiKeyDoc(alice, ALICE)))
})

test('another user (or anonymous) can never touch someone\'s AI key', async () => {
  await env.clearFirestore()
  await assertSucceeds(setDoc(aiKeyDoc(db(ALICE), ALICE), { geminiKey: 'AIzaFakeKey', updatedAt: serverTimestamp() }))
  for (const stranger of [db(BOB), db(null)]) {
    await assertFails(getDoc(aiKeyDoc(stranger, ALICE)))
    await assertFails(setDoc(aiKeyDoc(stranger, ALICE), { geminiKey: 'AIzaPlanted', updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(aiKeyDoc(stranger, ALICE)))
  }
})

test('AI key doc schema is enforced at the DB boundary', async () => {
  await env.clearFirestore()
  const alice = db(ALICE)
  const cases = [
    { geminiKey: '', updatedAt: serverTimestamp() },                       // empty
    { geminiKey: 'x'.repeat(129), updatedAt: serverTimestamp() },          // too long
    { geminiKey: 'has space', updatedAt: serverTimestamp() },              // whitespace
    { geminiKey: '<script>alert(1)</script>', updatedAt: serverTimestamp() }, // markup
    { geminiKey: 123, updatedAt: serverTimestamp() },                      // wrong type
    { geminiKey: 'AIzaOk', updatedAt: serverTimestamp(), extra: true },    // extra field
    { geminiKey: 'AIzaOk', updatedAt: new Date() },                        // client-set time
  ]
  for (const payload of cases) {
    await assertFails(setDoc(aiKeyDoc(alice, ALICE), payload))
  }
  // Only the fixed 'ai' doc id is allowed under settings/.
  await assertFails(setDoc(doc(alice, 'users', ALICE, 'settings', 'other'), { geminiKey: 'AIzaOk', updatedAt: serverTimestamp() }))
})

// ---------------------------------------------------------------------------
// users/{uid}/profile/state – learned personalization profile
// ---------------------------------------------------------------------------
function profileDoc(firestore, uid) {
  return doc(firestore, 'users', uid, 'profile', 'state')
}

const PROFILE_JSON = JSON.stringify({ v: 1, words: { candid: { up: 2 } }, events: 2 })

test('owner can store, read, replace and delete their own profile', async () => {
  await env.clearFirestore()
  const alice = db(ALICE)
  await assertSucceeds(setDoc(profileDoc(alice, ALICE), { state: PROFILE_JSON, updatedAt: serverTimestamp() }))
  await assertSucceeds(getDoc(profileDoc(alice, ALICE)))
  await assertSucceeds(setDoc(profileDoc(alice, ALICE), { state: '{"v":1}', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(profileDoc(alice, ALICE)))
})

test('another user (or anonymous) can never touch someone\'s profile', async () => {
  await env.clearFirestore()
  await assertSucceeds(setDoc(profileDoc(db(ALICE), ALICE), { state: PROFILE_JSON, updatedAt: serverTimestamp() }))
  for (const stranger of [db(BOB), db(null)]) {
    await assertFails(getDoc(profileDoc(stranger, ALICE)))
    await assertFails(setDoc(profileDoc(stranger, ALICE), { state: '{"v":1}', updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(profileDoc(stranger, ALICE)))
  }
})

test('profile doc schema is enforced at the DB boundary', async () => {
  await env.clearFirestore()
  const alice = db(ALICE)
  const cases = [
    { state: '', updatedAt: serverTimestamp() },                        // empty
    { state: 'x'.repeat(200001), updatedAt: serverTimestamp() },        // over the size cap
    { state: { v: 1 }, updatedAt: serverTimestamp() },                  // wrong type (map, not string)
    { state: 42, updatedAt: serverTimestamp() },                        // wrong type
    { state: PROFILE_JSON, updatedAt: serverTimestamp(), extra: true }, // extra field
    { state: PROFILE_JSON, updatedAt: new Date() },                     // client-set time
    { updatedAt: serverTimestamp() },                                   // missing state
  ]
  for (const payload of cases) {
    await assertFails(setDoc(profileDoc(alice, ALICE), payload))
  }
  // Only the fixed 'state' doc id is allowed under profile/.
  await assertFails(setDoc(doc(alice, 'users', ALICE, 'profile', 'other'), { state: PROFILE_JSON, updatedAt: serverTimestamp() }))
})

// ---------------------------------------------------------------------------
// feedback/{id} – anonymous, write-only uninstall-survey mailbox (/goodbye)
// ---------------------------------------------------------------------------
function feedbackPayload(extra = {}) {
  return {
    source: 'uninstall',
    reasons: ['too-many', 'other'],
    comment: 'Quá nhiều từ bị thay.',
    lang: 'vi',
    createdAt: serverTimestamp(),
    ...extra,
  }
}

test('anyone can submit a valid uninstall survey (anonymous or signed in)', async () => {
  await env.clearFirestore()
  await assertSucceeds(setDoc(doc(db(null), 'feedback', 'fb1'), feedbackPayload()))
  // A comment alone (no reason ticked) is still signal.
  await assertSucceeds(
    setDoc(doc(db(null), 'feedback', 'fb2'), feedbackPayload({ reasons: [], comment: 'ghi chú' })),
  )
  // Reasons alone (no comment field at all) works too.
  const { comment: _omit, ...noComment } = feedbackPayload()
  await assertSucceeds(setDoc(doc(db(null), 'feedback', 'fb3'), noComment))
  await assertSucceeds(setDoc(doc(db(ALICE), 'feedback', 'fb4'), feedbackPayload()))
})

test('feedback is write-only: no read, overwrite or delete - even by authors', async () => {
  await env.clearFirestore()
  await assertSucceeds(setDoc(doc(db(null), 'feedback', 'fb1'), feedbackPayload()))
  await assertFails(getDoc(doc(db(null), 'feedback', 'fb1')))
  await assertFails(getDoc(doc(db(ALICE), 'feedback', 'fb1')))
  await assertFails(setDoc(doc(db(null), 'feedback', 'fb1'), feedbackPayload({ comment: 'edited' })))
  await assertFails(deleteDoc(doc(db(ALICE), 'feedback', 'fb1')))
})

test('feedback schema is enforced at the DB boundary', async () => {
  await env.clearFirestore()
  const cases = [
    feedbackPayload({ source: 'spam' }),                   // wrong source tag
    feedbackPayload({ reasons: ['made-up-slug'] }),        // reason outside the allowlist
    feedbackPayload({ reasons: [], comment: '' }),         // carries no signal at all
    feedbackPayload({ comment: 'x'.repeat(501) }),         // oversized comment
    feedbackPayload({ comment: 42 }),                      // wrong comment type
    feedbackPayload({ lang: 'fr' }),                       // unsupported lang
    feedbackPayload({ email: 'p@example.com' }),           // unknown extra field (no PII fields)
    feedbackPayload({ createdAt: new Date() }),            // client-chosen timestamp
    { source: 'uninstall', createdAt: serverTimestamp() }, // reasons list missing entirely
  ]
  let i = 0
  for (const payload of cases) {
    await assertFails(setDoc(doc(db(null), 'feedback', `bad${i++}`), payload))
  }
})

// ---------------------------------------------------------------------------
// Blog posts
//
// This is where "a draft is not public" is actually decided. The admin UI and
// the render function both assume these rules hold; if they do not, hiding the
// admin screen buys nothing and the public renderer would happily serve drafts.
// ---------------------------------------------------------------------------

const ADMIN = 'admin-uid'

function postPayload(extra = {}) {
  const now = new Date().toISOString()
  return {
    slug: 'bai-viet',
    lang: 'vie',
    title: 'Bài viết',
    excerpt: 'Tóm tắt.',
    content: '## Heading\n\nBody.',
    author: 'Van Quyet Doan',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    ...extra,
  }
}

/** A post that satisfies the pairing rule: has a topic and names its partner. */
function pairedPayload(lang, slug, partnerSlug, extra = {}) {
  return postPayload({
    lang,
    slug,
    translationKey: 'chu-de',
    counterpartSlug: partnerSlug,
    ...extra,
  })
}

const PUBLISHED = { status: 'published', publishedAt: new Date().toISOString() }

/** Seeds documents with rules bypassed, so a test can start from a given state. */
async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore())
  })
}

async function makeAdmin() {
  await seed(async (raw) => {
    await setDoc(doc(raw, 'admins', ADMIN), { grantedAt: new Date().toISOString() })
  })
}

test('anyone may read a published post, nobody may read a draft', async () => {
  await env.clearFirestore()
  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__live'), postPayload({
      slug: 'live', status: 'published', publishedAt: new Date().toISOString(),
    }))
    await setDoc(doc(raw, 'posts', 'vie__draft'), postPayload({ slug: 'draft' }))
  })

  // The public renderer fetches unauthenticated, so this is the real path.
  await assertSucceeds(getDoc(doc(db(null), 'posts', 'vie__live')))
  await assertFails(getDoc(doc(db(null), 'posts', 'vie__draft')))
  // Being signed in is not being an admin.
  await assertFails(getDoc(doc(db(ALICE), 'posts', 'vie__draft')))
})

test('an admin may read drafts', async () => {
  await env.clearFirestore()
  await makeAdmin()
  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__draft'), postPayload({ slug: 'draft' }))
  })
  await assertSucceeds(getDoc(doc(db(ADMIN), 'posts', 'vie__draft')))
})

test('a public list must filter to published, or it is refused entirely', async () => {
  await env.clearFirestore()
  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__live'), postPayload({
      slug: 'live', status: 'published', publishedAt: new Date().toISOString(),
    }))
    await setDoc(doc(raw, 'posts', 'vie__draft'), postPayload({ slug: 'draft' }))
  })

  const posts = collection(db(null), 'posts')
  // Rules cannot filter a query, only reject it: an unfiltered list would have
  // to return the draft, so the whole query fails rather than leaking it.
  await assertFails(getDocs(posts))
  await assertSucceeds(getDocs(query(posts, where('status', '==', 'published'))))
})

test('a signed-in non-admin cannot create, edit, publish or delete', async () => {
  await env.clearFirestore()
  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__bai-viet'), postPayload())
  })

  await assertFails(setDoc(doc(db(ALICE), 'posts', 'vie__new'), postPayload({ slug: 'new' })))
  await assertFails(setDoc(doc(db(ALICE), 'posts', 'vie__bai-viet'), postPayload({ title: 'Hijacked' })))
  await assertFails(setDoc(doc(db(ALICE), 'posts', 'vie__bai-viet'), postPayload({
    status: 'published', publishedAt: new Date().toISOString(),
  })))
  await assertFails(deleteDoc(doc(db(ALICE), 'posts', 'vie__bai-viet')))

  // And an anonymous visitor certainly cannot.
  await assertFails(setDoc(doc(db(null), 'posts', 'vie__anon'), postPayload({ slug: 'anon' })))
})

test('an admin can run the whole lifecycle', async () => {
  await env.clearFirestore()
  await makeAdmin()
  const client = db(ADMIN)
  const vieRef = doc(client, 'posts', 'vie__bai-viet')
  const enRef = doc(client, 'posts', 'en__the-post')

  await assertSucceeds(setDoc(vieRef, pairedPayload('vie', 'bai-viet', 'the-post')))
  await assertSucceeds(setDoc(enRef, pairedPayload('en', 'the-post', 'bai-viet')))
  await assertSucceeds(setDoc(vieRef, pairedPayload('vie', 'bai-viet', 'the-post', { title: 'Đã sửa' })))

  // Publishing is a pair operation, so it is one batch.
  const publish = writeBatch(client)
  publish.set(vieRef, pairedPayload('vie', 'bai-viet', 'the-post', PUBLISHED))
  publish.set(enRef, pairedPayload('en', 'the-post', 'bai-viet', PUBLISHED))
  await assertSucceeds(publish.commit())

  const unpublish = writeBatch(client)
  unpublish.set(vieRef, pairedPayload('vie', 'bai-viet', 'the-post'))
  unpublish.set(enRef, pairedPayload('en', 'the-post', 'bai-viet'))
  await assertSucceeds(unpublish.commit())

  await assertSucceeds(deleteDoc(vieRef))
})

test('the document id must match the post it contains', async () => {
  await env.clearFirestore()
  await makeAdmin()
  // The id encodes the URL, so a mismatch would strand the post at an address
  // nothing resolves to.
  await assertFails(setDoc(doc(db(ADMIN), 'posts', 'vie__wrong'), postPayload({ slug: 'bai-viet' })))
  await assertFails(setDoc(doc(db(ADMIN), 'posts', 'en__bai-viet'), postPayload({ lang: 'vie' })))
  await assertSucceeds(setDoc(doc(db(ADMIN), 'posts', 'vie__bai-viet'), postPayload()))
})

test('a post cannot move to a different URL once created', async () => {
  await env.clearFirestore()
  await makeAdmin()
  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__bai-viet'), postPayload())
  })
  // Changing slug or lang in place would silently break every existing link.
  await assertFails(setDoc(doc(db(ADMIN), 'posts', 'vie__bai-viet'), postPayload({ slug: 'khac' })))
  await assertFails(setDoc(doc(db(ADMIN), 'posts', 'vie__bai-viet'), postPayload({ lang: 'en' })))
})

test('post shape is enforced at the DB boundary', async () => {
  await env.clearFirestore()
  await makeAdmin()
  const cases = [
    postPayload({ lang: 'fr' }),                        // unsupported language
    postPayload({ status: 'scheduled' }),               // no such status; nothing schedules
    postPayload({ slug: 'Không Hợp Lệ' }),              // slug must be url-safe kebab-case
    postPayload({ slug: '' }),                          // empty slug
    postPayload({ title: '' }),                         // empty title
    postPayload({ title: 'x'.repeat(201) }),            // oversized title
    postPayload({ excerpt: 'x'.repeat(401) }),          // oversized excerpt
    postPayload({ tags: Array(13).fill('t') }),         // too many tags
    postPayload({ views: 10 }),                         // unknown field
    pairedPayload('vie', 'bai-viet', 'the-post', { status: 'published' }), // published, no publishedAt
    { slug: 'bai-viet', lang: 'vie', title: 'x' },      // missing required fields
  ]
  let i = 0
  for (const payload of cases) {
    const id = `${payload.lang ?? 'vie'}__${payload.slug ?? 'bai-viet'}`
    await assertFails(setDoc(doc(db(ADMIN), 'posts', id), payload), `case ${i++} should be refused`)
  }
})

test('nobody can promote themselves to admin', async () => {
  await env.clearFirestore()
  // The admins collection is console-only on purpose: if it were writable from
  // the client, every other rule here would be decoration.
  await assertFails(setDoc(doc(db(ALICE), 'admins', ALICE), { grantedAt: 'now' }))
  await assertFails(setDoc(doc(db(null), 'admins', ALICE), { grantedAt: 'now' }))

  await makeAdmin()
  await assertFails(setDoc(doc(db(ADMIN), 'admins', ALICE), { grantedAt: 'now' }))
  await assertFails(deleteDoc(doc(db(ADMIN), 'admins', ADMIN)))
})

test('a user can check their own admin status but cannot enumerate admins', async () => {
  await env.clearFirestore()
  await makeAdmin()
  // The admin UI reads its own doc to decide whether to render.
  await assertSucceeds(getDoc(doc(db(ADMIN), 'admins', ADMIN)))

  // A non-admin's own read must *succeed and report absence*, never be denied.
  // RequireAdmin leans on that: because a missing grant looks like this and not
  // like a denial, it can treat permission-denied as "these rules were never
  // deployed" and say so, instead of blaming the admin document. Tightening
  // this to require existence would break that diagnosis, not just this test.
  const missing = await assertSucceeds(getDoc(doc(db(ALICE), 'admins', ALICE)))
  assert.equal(missing.exists(), false)
  // But cannot read someone else's, or list the collection.
  await assertFails(getDoc(doc(db(ALICE), 'admins', ADMIN)))
  await assertFails(getDocs(collection(db(ALICE), 'admins')))
})

// ---------------------------------------------------------------------------
// The pairing rule: every published post exists in both languages
//
// Enforced in the rules rather than only in the admin, because a rule the UI
// merely encourages stops being true the first time anyone edits a document in
// the Firebase console.
// ---------------------------------------------------------------------------

test('publishing one language on its own is refused', async () => {
  await env.clearFirestore()
  await makeAdmin()
  const client = db(ADMIN)

  // Both drafts exist and are correctly paired...
  await assertSucceeds(setDoc(doc(client, 'posts', 'vie__bai-viet'), pairedPayload('vie', 'bai-viet', 'the-post')))
  await assertSucceeds(setDoc(doc(client, 'posts', 'en__the-post'), pairedPayload('en', 'the-post', 'bai-viet')))

  // ...but publishing just one leaves a live post whose pair is a draft.
  await assertFails(
    setDoc(doc(client, 'posts', 'vie__bai-viet'), pairedPayload('vie', 'bai-viet', 'the-post', PUBLISHED)),
  )
  await assertFails(
    setDoc(doc(client, 'posts', 'en__the-post'), pairedPayload('en', 'the-post', 'bai-viet', PUBLISHED)),
  )
})

test('publishing both in one batch succeeds', async () => {
  await env.clearFirestore()
  await makeAdmin()
  const client = db(ADMIN)

  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__bai-viet'), pairedPayload('vie', 'bai-viet', 'the-post'))
    await setDoc(doc(raw, 'posts', 'en__the-post'), pairedPayload('en', 'the-post', 'bai-viet'))
  })

  // getAfter() sees the end state of the batch, so both being published at once
  // satisfies each document's check. This is the only way to go live.
  const batch = writeBatch(client)
  batch.set(doc(client, 'posts', 'vie__bai-viet'), pairedPayload('vie', 'bai-viet', 'the-post', PUBLISHED))
  batch.set(doc(client, 'posts', 'en__the-post'), pairedPayload('en', 'the-post', 'bai-viet', PUBLISHED))
  await assertSucceeds(batch.commit())
})

test('publishing with a counterpart that does not exist is refused', async () => {
  await env.clearFirestore()
  await makeAdmin()
  await assertFails(
    setDoc(
      doc(db(ADMIN), 'posts', 'vie__bai-viet'),
      pairedPayload('vie', 'bai-viet', 'nonexistent', PUBLISHED),
    ),
  )
})

test('a published post cannot be created without pairing fields', async () => {
  await env.clearFirestore()
  await makeAdmin()
  const client = db(ADMIN)

  // No translationKey at all.
  await assertFails(setDoc(doc(client, 'posts', 'vie__bai-viet'), postPayload(PUBLISHED)))
  // A topic but no named counterpart, so the rules cannot verify the pair.
  await assertFails(
    setDoc(doc(client, 'posts', 'vie__bai-viet'), postPayload({ translationKey: 'chu-de', ...PUBLISHED })),
  )
  // Empty topic string is not a topic.
  await assertFails(
    setDoc(
      doc(client, 'posts', 'vie__bai-viet'),
      postPayload({ translationKey: '', counterpartSlug: 'x', ...PUBLISHED }),
    ),
  )
})

test('drafts do not need a pair, so writing one language first works', async () => {
  await env.clearFirestore()
  await makeAdmin()
  // Otherwise there would be no way to start: the first half of a pair could
  // never be saved, because its partner does not exist yet.
  await assertSucceeds(setDoc(doc(db(ADMIN), 'posts', 'vie__bai-viet'), postPayload()))
})

test('a legacy published post with no pair can still be unpublished and deleted', async () => {
  await env.clearFirestore()
  await makeAdmin()

  // Exactly the state of the post that was published before this rule existed.
  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__te'), postPayload({ slug: 'te', ...PUBLISHED }))
  })

  const ref = doc(db(ADMIN), 'posts', 'vie__te')

  // The carve-out that matters: pairing fields are required only while
  // published. Without it this document would fail every write and be stuck
  // live forever, which is worse than the state the rule set out to prevent.
  await assertSucceeds(setDoc(ref, postPayload({ slug: 'te' })))
  await assertSucceeds(deleteDoc(ref))
})

test('a legacy published post cannot be edited while staying published', async () => {
  await env.clearFirestore()
  await makeAdmin()
  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__te'), postPayload({ slug: 'te', ...PUBLISHED }))
  })

  // Editing it in place while leaving it live would perpetuate the violation.
  await assertFails(
    setDoc(doc(db(ADMIN), 'posts', 'vie__te'), postPayload({ slug: 'te', title: 'Edited', ...PUBLISHED })),
  )
})

test('unpublishing both in one batch succeeds', async () => {
  await env.clearFirestore()
  await makeAdmin()
  const client = db(ADMIN)

  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__bai-viet'), pairedPayload('vie', 'bai-viet', 'the-post', PUBLISHED))
    await setDoc(doc(raw, 'posts', 'en__the-post'), pairedPayload('en', 'the-post', 'bai-viet', PUBLISHED))
  })

  const batch = writeBatch(client)
  batch.set(doc(client, 'posts', 'vie__bai-viet'), pairedPayload('vie', 'bai-viet', 'the-post'))
  batch.set(doc(client, 'posts', 'en__the-post'), pairedPayload('en', 'the-post', 'bai-viet'))
  await assertSucceeds(batch.commit())
})

test('unpublishing one half is allowed, and the other half is then unpublishable', async () => {
  await env.clearFirestore()
  await makeAdmin()
  const client = db(ADMIN)

  await seed(async (raw) => {
    await setDoc(doc(raw, 'posts', 'vie__bai-viet'), pairedPayload('vie', 'bai-viet', 'the-post', PUBLISHED))
    await setDoc(doc(raw, 'posts', 'en__the-post'), pairedPayload('en', 'the-post', 'bai-viet', PUBLISHED))
  })

  // Going to draft never needs a pair, so this is permitted at the database
  // level; the admin does both together so it cannot happen by accident.
  await assertSucceeds(
    setDoc(doc(client, 'posts', 'vie__bai-viet'), pairedPayload('vie', 'bai-viet', 'the-post')),
  )
  // And the survivor can no longer be re-saved as published on its own.
  await assertFails(
    setDoc(doc(client, 'posts', 'en__the-post'), pairedPayload('en', 'the-post', 'bai-viet', PUBLISHED)),
  )
})
