// Turning a title into a URL.
//
// Plain ESM with no dependencies, because both the browser (the admin editor,
// live as you type a title) and Node (tests, the migration script) need the
// exact same answer. A slug that differs between the two would silently produce
// a post whose URL does not match its own link.
//
// The hard part is Vietnamese. A naive [^a-z0-9]+ strip turns
// "Học từ vựng tiếng Anh" into "hc-t-vng-ting-anh", which is unreadable and
// useless for search. Unicode normalisation fixes almost all of it: NFD splits
// an accented character into a base letter plus a combining mark, so dropping
// the marks leaves the letter behind. The one case it does not fix is đ/Đ, a
// distinct letter rather than a d with a diacritic, so it is mapped by hand.

/** Longest slug we will emit. Keeps URLs readable and well inside Firestore's id limit. */
const MAX_LENGTH = 80

/**
 * @param {string} input Any title, in Vietnamese or English.
 * @returns {string} lowercase, hyphen-separated, ASCII, safe in a URL path.
 */
export function slugify(input) {
  if (typeof input !== 'string') return ''

  return (
    input
      .normalize('NFD')
      // Combining diacritical marks, left behind by NFD.
      .replace(/[̀-ͯ]/g, '')
      // đ and Đ survive NFD intact: they are their own letters, not d + mark.
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      // Anything not a letter or digit becomes a separator. Doing this after
      // normalisation means accented letters have already become plain ones.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_LENGTH)
      // Slicing can leave a trailing hyphen mid-word; trim it again.
      .replace(/-+$/g, '')
  )
}

/** The Firestore document id for a post. The id encodes the URL, so a post can
 *  always be fetched directly from its path with no query. */
export function postId(lang, slug) {
  return `${lang}__${slug}`
}

/**
 * Finds a slug not already taken, appending -2, -3, and so on.
 *
 * Collision handling is deliberately visible in the URL rather than silent:
 * two posts genuinely titled the same thing should not fight over one address,
 * and the author should be able to see in the slug field that it happened.
 *
 * @param {string} desired The slug the author wants.
 * @param {(slug: string) => Promise<boolean>} isTaken Async existence check.
 * @param {string} [currentSlug] The post's own slug when editing, so a post
 *   never collides with itself and get renamed to -2 on every save.
 */
export async function findFreeSlug(desired, isTaken, currentSlug) {
  const base = slugify(desired) || 'post'
  if (base === currentSlug) return base

  if (!(await isTaken(base))) return base

  for (let n = 2; n < 200; n += 1) {
    const candidate = `${base}-${n}`
    if (candidate === currentSlug) return candidate
    if (!(await isTaken(candidate))) return candidate
  }

  // 200 posts sharing one title is not a real scenario; falling back to a
  // timestamp keeps the editor usable instead of throwing at save time.
  return `${base}-${Date.now()}`
}
