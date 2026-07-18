// Uninstall exit-survey submission (/goodbye). Writes one document to the
// write-only `feedback` collection; firestore.rules enforces the schema
// (allow-listed reason slugs, comment ≤ 500 chars, server timestamp) and
// forbids all reads/updates/deletes, so the collection is a one-way mailbox
// the project owner reads in the Firebase console.
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import type { Lang } from '../i18n/translations'

/** Reason slugs - must stay in sync with the allowlist in firestore.rules. */
export const FEEDBACK_REASONS = [
  'too-many',
  'wrong-sites',
  'not-useful',
  'performance',
  'privacy',
  'switched',
  'testing',
  'other',
] as const

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]

/** Mirror of the limit in firestore.rules. */
export const FEEDBACK_COMMENT_MAX = 500

/** The Firestore SDK queues writes while offline and addDoc never rejects,
 *  which would pin the survey on "Sending…" forever. Cap the wait instead:
 *  past the deadline we surface the retry UI (if the SDK later flushes the
 *  queued write anyway, a rare duplicate in a write-only mailbox is harmless). */
const SUBMIT_TIMEOUT_MS = 8000

export async function submitUninstallFeedback(input: {
  reasons: FeedbackReason[]
  comment: string
  lang: Lang
}): Promise<void> {
  const comment = input.comment.trim().slice(0, FEEDBACK_COMMENT_MAX)
  const payload: Record<string, unknown> = {
    source: 'uninstall',
    reasons: input.reasons,
    lang: input.lang,
    createdAt: serverTimestamp(),
  }
  // The rules require a reason or a comment; an absent field beats an empty one.
  if (comment) payload.comment = comment

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      addDoc(collection(firestoreDb(), 'feedback'), payload),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('feedback-timeout')), SUBMIT_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
