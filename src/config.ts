/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WAITLIST BACKEND CONFIGURATION
 * ─────────────────────────────────────────────────────────────────────────────
 *  The waitlist form submits to Formspree (https://formspree.io), a free
 *  form backend designed for frontend use. The endpoint URL below is PUBLIC
 *  by design (it is not a secret key), so it is safe to keep in this file.
 *
 *  The endpoint is CONFIGURED and live. To point the form at a different
 *  Formspree form later, just replace the URL below with the new form's
 *  endpoint (it looks like https://formspree.io/f/xxxxxxxx), commit, and
 *  push to main. Vercel redeploys automatically.
 *
 *  Every submission appears in the Formspree dashboard (with email
 *  notifications and CSV export on the free plan).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const WAITLIST_FORM_ENDPOINT = 'https://formspree.io/f/xqevjwra'

/**
 * True when the endpoint above is missing or does not look like a real
 * Formspree form URL. In that state the form simulates a successful signup
 * (so the live site never looks broken) but stores nothing and logs a
 * console warning. The check is based on the URL FORMAT, so editing the
 * endpoint line can never accidentally re-enable simulation mode.
 */
export const WAITLIST_NOT_CONFIGURED = !/^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i.test(
  WAITLIST_FORM_ENDPOINT,
)
