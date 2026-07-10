// Defense-in-depth for vocab data rendered in the UI (A03).
//
// React already escapes everything interpolated into JSX, and this codebase
// bans dangerouslySetInnerHTML for deck data. These helpers add a second
// layer for data that arrives from outside the bundle (Firestore documents
// written by any client): strip characters that have no business in
// dictionary text and enforce the same length caps as firestore.rules, so a
// record that somehow bypassed the rules still can't smuggle markup or
// control characters into the DOM.

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]/g

export function sanitizeVocabText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

/** Explicit escaping for the rare case where vocab text must leave React's
 *  auto-escaping (e.g. building an HTML string). Prefer plain JSX. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Field caps mirror firestore.rules — keep the two in sync.
export const LIMITS = {
  word: 64,
  vietnamese: 128,
  definition: 512,
  example: 1024,
  pos: 32,
} as const
