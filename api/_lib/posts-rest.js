// Reading blog posts from Firestore over the REST API.
//
// Deliberately unauthenticated. Security rules already allow anyone to read a
// post whose status is 'published' and deny every draft, so the public renderer
// needs no service account, no ADC and no secret of any kind. That is the same
// reasoning that kept firebase-admin out of api/_lib/verify.js, and it means a
// leaked deployment env reveals nothing about the blog.
//
// It also means drafts are protected by the database rather than by this file:
// even if a bug here asked for a draft, Firestore would refuse to return it.
import { FIREBASE_PROJECT_ID } from './blog-config.js'

const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`

/**
 * Firestore's REST format wraps every value in a type tag. This unwraps it back
 * into ordinary JavaScript.
 */
function decodeValue(value) {
  if (value == null) return null
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {})
  return null
}

function decodeFields(fields) {
  const out = {}
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value)
  return out
}

function decodeDocument(doc) {
  if (!doc?.fields) return null
  const post = decodeFields(doc.fields)
  post.id = doc.name.split('/').pop()
  return post
}

/**
 * One published post, or null.
 *
 * Returns null rather than throwing for a missing or unpublished post, because
 * both are the same thing to a reader: a 404. The status check is belt and
 * braces on top of the rules.
 */
export async function fetchPost(lang, slug) {
  const id = `${lang}__${slug}`
  const response = await fetch(`${BASE}/posts/${encodeURIComponent(id)}`)
  if (!response.ok) return null

  const post = decodeDocument(await response.json())
  if (!post || post.status !== 'published') return null
  return post
}

/**
 * Published posts, newest first.
 *
 * The status filter is not optional: an unfiltered list is rejected by the
 * rules rather than silently returning drafts, so removing it would break the
 * page rather than leak.
 *
 * Sorting and language filtering happen here in JavaScript rather than in the
 * query on purpose. Firestore needs a composite index for an equality filter
 * combined with an orderBy on a different field, which would mean the very
 * first deploy 400s until someone clicks a console link. A single equality
 * filter needs no index at all, and sorting a few dozen posts in memory costs
 * nothing.
 *
 * @param {string} [lang] Restrict to one language. Omit for every language.
 */
export async function fetchPublishedPosts(lang) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'posts' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: 'published' },
        },
      },
      limit: 500,
    },
  }

  const response = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Firestore query failed: HTTP ${response.status}`)
  }

  const rows = await response.json()
  const posts = rows
    .map((row) => (row.document ? decodeDocument(row.document) : null))
    .filter(Boolean)
    .filter((post) => !lang || post.lang === lang)

  posts.sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')))
  return posts
}

/**
 * The published counterpart of a post in the other language, or null.
 *
 * Used for hreflang, which must only ever point at a URL that exists - an
 * alternate aimed at an unpublished post is worse than no alternate at all.
 */
export async function fetchCounterpart(post) {
  if (!post?.translationKey) return null

  const body = {
    structuredQuery: {
      from: [{ collectionId: 'posts' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'published' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'translationKey' },
                op: 'EQUAL',
                value: { stringValue: post.translationKey },
              },
            },
          ],
        },
      },
      limit: 5,
    },
  }

  const response = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) return null

  const rows = await response.json()
  const posts = rows
    .map((row) => (row.document ? decodeDocument(row.document) : null))
    .filter(Boolean)

  return posts.find((p) => p.lang !== post.lang) ?? null
}
