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
  where,
  writeBatch,
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
  /**
   * The other language's slug for this topic.
   *
   * Redundant with translationKey from the application's point of view, but not
   * from the database's: security rules can fetch a known document path and
   * cannot run a query, so this is what lets them verify the pair is published
   * too. Maintained automatically by savePost, never typed by hand.
   */
  counterpartSlug?: string
  faq?: FaqEntry[]
  canonicalUrl?: string
}

/** A topic: the vie and en versions of one piece of writing. */
export interface Topic {
  translationKey: string
  vie: Post | null
  en: Post | null
}

/** Why a topic cannot be published, or null when it can. */
export function publishBlocker(topic: Topic): string | null {
  if (!topic.translationKey) return 'This post has no topic, so it cannot be paired.'
  if (!topic.vie) return 'Missing the Vietnamese version.'
  if (!topic.en) return 'Missing the English version.'
  return null
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
  if (post.counterpartSlug?.trim()) out.counterpartSlug = post.counterpartSlug.trim()
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

/** The other language's post for the same topic, or null. */
export async function findCounterpart(post: Post): Promise<Post | null> {
  if (!post.translationKey?.trim()) return null
  const otherLang: PostLang = post.lang === 'vie' ? 'en' : 'vie'
  const snap = await getDocs(
    query(
      postsCollection(),
      where('translationKey', '==', post.translationKey.trim()),
      where('lang', '==', otherLang),
    ),
  )
  const found = snap.docs[0]
  return found ? { ...(found.data() as Omit<Post, 'id'>), id: found.id } : null
}

/** Groups posts into topics, so the admin can reason about pairs rather than files. */
export function groupIntoTopics(posts: Post[]): Topic[] {
  const byKey = new Map<string, Topic>()

  for (const post of posts) {
    // A post with no topic still needs somewhere to live in the list, or it
    // becomes invisible in the one screen meant to surface exactly that problem.
    const key = post.translationKey?.trim() || `__unpaired__${post.id}`
    const topic = byKey.get(key) ?? { translationKey: post.translationKey?.trim() ?? '', vie: null, en: null }
    topic[post.lang] = post
    byKey.set(key, topic)
  }

  return [...byKey.values()].sort((a, b) => {
    const at = a.vie?.updatedAt ?? a.en?.updatedAt ?? ''
    const bt = b.vie?.updatedAt ?? b.en?.updatedAt ?? ''
    return bt.localeCompare(at)
  })
}

/**
 * Publishes both languages of a topic, together, in one batch.
 *
 * Together is not a convenience. The rules verify with getAfter() that the
 * counterpart ends the write published, so two separate writes would each be
 * refused: at the moment of the first, the second is still a draft. Which is
 * the point, since a lone published post is exactly what the pairing rule
 * exists to prevent.
 *
 * `publishedAt` is stamped only the first time, so editing a live topic does not
 * shuffle it back to the top of the listing.
 */
export async function publishTopic(topic: Topic): Promise<void> {
  const blocker = publishBlocker(topic)
  if (blocker) throw new Error(blocker)

  const vie = topic.vie as Post
  const en = topic.en as Post
  const now = new Date().toISOString()
  const batch = writeBatch(firestoreDb())

  for (const [post, other] of [
    [vie, en],
    [en, vie],
  ] as const) {
    batch.set(
      doc(postsCollection(), postId(post.lang, post.slug)),
      toDocument({
        ...post,
        counterpartSlug: other.slug,
        status: 'published',
        publishedAt: post.publishedAt || now,
      }),
    )
  }

  await batch.commit()
}

/**
 * Returns both languages of a topic to draft, together.
 *
 * Both, because taking down one language would leave the other published
 * without a pair, which is the state the rule forbids. The rules would refuse
 * the half-write anyway; doing it in one batch means the admin never has to
 * discover that by failing.
 *
 * `publishedAt` is kept rather than cleared: republishing later should restore
 * the original date instead of pretending the post is new.
 */
export async function unpublishTopic(topic: Topic): Promise<void> {
  const batch = writeBatch(firestoreDb())

  for (const post of [topic.vie, topic.en]) {
    if (!post) continue
    batch.set(doc(postsCollection(), postId(post.lang, post.slug)), toDocument({ ...post, status: 'draft' }))
  }

  await batch.commit()
}

/** Saves one post as a draft, linking it to its counterpart if one exists. */
export async function saveDraft(post: Post): Promise<string> {
  const counterpart = await findCounterpart(post)

  if (!counterpart) return savePost({ ...post, status: 'draft' })

  // Writing both sides links the pair from whichever end was saved second, so
  // counterpartSlug can never be set on only one of them.
  const batch = writeBatch(firestoreDb())
  batch.set(
    doc(postsCollection(), postId(post.lang, post.slug)),
    toDocument({ ...post, status: 'draft', counterpartSlug: counterpart.slug }),
  )
  batch.set(
    doc(postsCollection(), postId(counterpart.lang, counterpart.slug)),
    toDocument({ ...counterpart, counterpartSlug: post.slug }),
  )
  await batch.commit()
  return postId(post.lang, post.slug)
}

export async function deletePost(id: string): Promise<void> {
  await deleteDoc(doc(postsCollection(), id))
}
