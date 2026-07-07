/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WAITLIST BACKEND CONFIGURATION
 * ─────────────────────────────────────────────────────────────────────────────
 *  The waitlist form submits to Formspree (https://formspree.io), a free
 *  form backend designed for frontend use. The endpoint URL below is PUBLIC
 *  by design (it is not a secret key), so it is safe to keep in this file.
 *
 *  >>> TO ACTIVATE THE WAITLIST, REPLACE THE PLACEHOLDER BELOW: <<<
 *
 *  1. Create a free account at https://formspree.io/register
 *  2. Click "+ New form", name it e.g. "Merid waitlist"
 *  3. Copy the form's endpoint URL. It looks like:
 *         https://formspree.io/f/xyzabcde
 *  4. Paste it below in place of the placeholder string, commit, and push
 *     to main. Vercel redeploys automatically.
 *
 *  Every submission then appears in your Formspree dashboard (with email
 *  notifications and CSV export on the free plan).
 *
 *  NOTE: while the placeholder is still in place, the form SIMULATES a
 *  successful signup so the live site never looks broken, but NO EMAIL IS
 *  STORED. A console warning is logged as a reminder.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const WAITLIST_FORM_ENDPOINT = 'https://formspree.io/f/xqevjwra'

/** True until the real Formspree endpoint has been pasted in. */
export const WAITLIST_NOT_CONFIGURED = WAITLIST_FORM_ENDPOINT.includes('xqevjwra')
