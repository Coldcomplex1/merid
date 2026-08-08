// Blog posts, from the admin's side of the wire.
//
// Writes go straight from the browser to Firestore. There is no write API and
// no server to compromise, because Firestore's security rules are already a
// server-side authorization boundary enforced by Google rather than by this
// file. Hiding the admin screen protects nothing; the rules do (firestore.rules).
//
// Reads on the public site do not come through here at all - they go through
// api/blog-render.js, which fetches over REST and renders HTML so crawlers that
// do not run JavaScript can still see the words.
import { FirebaseError } from 'firebase/app'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore'
import { firestoreDb } from './firebase'
import { slugify, findFreeSlug, postId } from '../../api/_lib/slug.js'

export type PostLang = 'vie' | 'en'
export type PostStatus = 'draft' | 'published'

export interface FaqEntry {
  question: string
  answer: string
}

export interface Post {
  /** Firestore document id, always `${lang}__${slug}`. */
  id: string
  slug: string
  lang: PostLang
  title: string
  excerpt: string
  content: string
  author: string
  tags: string[]
  coverImage: string
  coverAlt: string
  seoTitle: string
  seoDescription: string
  status: PostStatus
  /** ISO string. Set the first time a post is published, then left alone. */
  publishedAt?: string
  createdAt: string
  updatedAt: string
  /** Links the vie/en versions of one topic, which is what drives hreflang. */
  translationKey?: string
  faq?: FaqEntry[]
  canonicalUrl?: string
}

/** A blank post, so the editor never has to deal with undefined fields. */
export function emptyPost(lang: PostLang = 'vie'): Post {
  const now = new Date().toISOString()
  return {
    id: '',
    slug: '',
    lang,
    title: '',
    excerpt: '',
    content: '',
    author: 'Van Quyet Doan',
    tags: [],
    coverImage: '',
    coverAlt: '',
    seoTitle: '',
    seoDescription: '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

function postsCollection() {
  return collection(firestoreDb(), 'posts')
}

/**
 * Why the admin screen is or is not available to this user.
 *
 * `rules-not-deployed` exists because the two ways of failing need different
 * fixes and used to be indistinguishable. Collapsing them into `false` sent
 * people to re-check a document ID that was correct all along.
 */
export type AdminStatus = 'admin' | 'not-admin' | 'rules-not-deployed' | 'unreachable'

/**
 * Whether this user may manage the blog, and if not, why not.
 *
 * Admin rights are the existence of an `admins/{uid}` document, created by hand
 * in the Firebase console. That keeps every UID out of the repository and makes
 * granting or revoking access one console action rather than a deploy.
 *
 * A user reading *their own* admins document is allowed by the rules whether or
 * not that document exists (firestore.rules: `allow get: if request.auth.uid ==
 * uid`, asserted in test/firestore-rules.test.mjs). So a missing grant comes
 * back as a successful read of a missing document, never as a denial - which
 * makes `permission-denied` here mean the rules being consulted are not the ones
 * in this repo. On a fresh project that means they were never uploaded, and the
 * bottom-of-file default-deny is answering instead.
 *
 * This read only decides what to *render*. A user who forces their way to the
 * route still cannot write anything, because the same check runs in the rules.
 */
export async function checkIsAdmin(uid: string): Promise<AdminStatus> {
  try {
    const snap = await getDoc(doc(firestoreDb(), 'admins', uid))
    return snap.exists() ? 'admin' : 'not-admin'
  } catch (err) {
    if (err instanceof FirebaseError && err.code === 'permission-denied') {
      return 'rules-not-deployed'
    }
    // Offline, blocked by an extension, project misconfigured: unknown, but
    // emphatically not an answer about who this user is.
    return 'unreachable'
  }
}

/** Every post, drafts included. Admin-only; the rules reject this for anyone else. */
export async function listAllPosts(): Promise<Post[]> {
  const snap = await getDocs(query(postsCollection(), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Post, 'id'>), id: d.id }))
}

export async function getPost(id: string): Promise<Post | null> {
  const snap = await getDoc(doc(postsCollection(), id))
  if (!snap.exists()) return null
  return { ...(snap.data() as Omit<Post, 'id'>), id: snap.id }
}

/** True when a post already occupies this language + slug. */
export async function slugTaken(lang: PostLang, slug: string): Promise<boolean> {
  const snap = await getDoc(doc(postsCollection(), postId(lang, slug)))
  return snap.exists()
}

/**
 * A free slug for a title, never colliding with an existing post.
 *
 * `currentSlug` is the post's own slug when editing, so re-saving does not walk
 * a post from `foo` to `foo-2` to `foo-3` on every keystroke.
 */
export async function suggestSlug(
  title: string,
  lang: PostLang,
  currentSlug?: string,
): Promise<string> {
  return findFreeSlug(title, (candidate: string) => slugTaken(lang, candidate), currentSlug)
}

export { slugify }

/**
 * Strips fields Firestore should not receive and drops empty optionals, because
 * the rules use hasOnly() and an explicit `undefined` is still a key.
 */
function toDocument(post: Post): Record<string, unknown> {
  const out: Record<string, unknown> = {
    slug: post.slug,
    lang: post.lang,
    title: post.title.trim(),
    excerpt: post.excerpt.trim(),
    content: post.content,
    author: post.author.trim() || 'Van Quyet Doan',
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: new Date().toISOString(),
  }

  if (post.tags.length) out.tags = post.tags
  if (post.coverImage) out.coverImage = post.coverImage
  if (post.coverAlt) out.coverAlt = post.coverAlt
  if (post.seoTitle.trim()) out.seoTitle = post.seoTitle.trim()
  if (post.seoDescription.trim()) out.seoDescription = post.seoDescription.trim()
  if (post.translationKey?.trim()) out.translationKey = post.translationKey.trim()
  if (post.canonicalUrl?.trim()) out.canonicalUrl = post.canonicalUrl.trim()
  if (post.faq?.length) out.faq = post.faq
  if (post.publishedAt) out.publishedAt = post.publishedAt

  return out
}

/**
 * Creates or overwrites a post.
 *
 * The document id encodes lang and slug, so changing either would strand the old
 * document at a URL nothing links to. `savePost` therefore refuses to move a
 * post: renaming is delete-then-create, which is deliberate friction on an
 * action that breaks every existing link to the post.
 */
export async function savePost(post: Post): Promise<string> {
  const id = postId(post.lang, post.slug)
  if (post.id && post.id !== id) {
    throw new Error(
      'A post\'s language and slug are part of its address and cannot be changed after it is created. Create a new post instead.',
    )
  }
  await setDoc(doc(postsCollection(), id), toDocument(post))
  return id
}

/**
 * Publishes a post. `publishedAt` is stamped only the first time, so editing a
 * live post does not shuffle it back to the top of the listing.
 */
export async function publishPost(post: Post): Promise<string> {
  return savePost({
    ...post,
    status: 'published',
    publishedAt: post.publishedAt || new Date().toISOString(),
  })
}

/**
 * Returns a post to draft.
 *
 * `publishedAt` is kept rather than cleared: republishing later should restore
 * the original date instead of pretending the post is new, and the rules only
 * require the field to exist while the status is published.
 */
export async function unpublishPost(post: Post): Promise<string> {
  return savePost({ ...post, status: 'draft' })
}

export async function deletePost(id: string): Promise<void> {
  await deleteDoc(doc(postsCollection(), id))
}
