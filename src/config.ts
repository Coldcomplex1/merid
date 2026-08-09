/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SITE-WIDE LINKS
 * ─────────────────────────────────────────────────────────────────────────────
 *  Merid is published on the Chrome Web Store. This is the single source of
 *  truth for the official listing URL; every "Add to Chrome" / "Install"
 *  action on the site links here. If the listing ever moves, change it once.
 *
 *  It stays a normal external link: no redirect hop, no third-party wrapper, no
 *  rewritten href. The site's own counter records that a click happened
 *  alongside the navigation (src/lib/analytics.ts) and never in front of it, so
 *  the link works with the counter blocked, broken, or JavaScript off.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/merid/ggfpandbibalomfbappkblppmffncoeo'
