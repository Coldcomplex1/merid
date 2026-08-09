// The website's own visitor counter.
//
// Sends small, aggregate events to /api/pulse, which turns them into counters
// (see api/_lib/analytics.js). No cookie is set, no identifier is issued, and
// nothing here can identify a person. The extension is not involved at all -
// everything in this file happens on merid.site.
//
// Two rules this module lives by:
//   1. It never throws into a render or a click handler. A counter that breaks
//      a page has cost more than it will ever be worth.
//   2. It never blocks navigation. Clicks are recorded alongside the link, not
//      in front of it.
import type { Lang } from '../i18n/translations'

const ENDPOINT = '/api/pulse'

/**
 * Where an "Add to Chrome" click happened.
 *
 * Mirrors PLACEMENTS in api/_lib/analytics.js - the server re-checks every
 * value against its own copy, so a name that exists only here lands in `other`
 * rather than creating a key. Same arrangement as FEEDBACK_REASONS in
 * feedback.ts and the allowlist in firestore.rules: two lists, kept in step on
 * purpose, because the client is not allowed to be the authority.
 */
export type Placement =
  | 'hero'
  | 'navbar'
  | 'navbar-mobile'
  | 'final-cta'
  | 'footer'
  | 'banner'
  | 'my-deck'
  | 'goodbye'
  | 'api-key-guide'
  | 'create-dataset'
  | 'tutorial'
  | 'privacy-policy'
  | 'blog-cta'
  | 'blog-author'

/** localStorage keys marking a page this browser has already been counted on.
 *  The value is the day it happened, so it explains itself in devtools. */
const INSTALL_KEY = 'merid-a-install'
const UNINSTALL_KEY = 'merid-a-uninstall'

/** Referrer is only interesting for the first page of a visit; after that it is
 *  always merid.site. */
const REFERRER_SENT_KEY = 'merid-a-ref-sent'

function shouldSend(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  // /api/* does not exist under `vite dev`, so without this every navigation
  // logs a 404 while developing - and StrictMode would double each one.
  const host = location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false

  // Never count ourselves reading the dashboard. The server drops /admin too;
  // this just saves the request.
  if (location.pathname.startsWith('/admin')) return false

  // Not legally required of a cookieless, aggregate-only counter, but it costs
  // three lines and it lets the privacy policy make the stronger claim.
  if (navigator.doNotTrack === '1') return false
  if ((navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl) return false

  return true
}

function send(payload: Record<string, unknown>): void {
  if (!shouldSend()) return
  try {
    const body = JSON.stringify(payload)
    // text/plain keeps this a CORS *simple* request. sendBeacon cannot set
    // headers, so an application/json Blob would demand a preflight the beacon
    // can never complete - and the browser drops it silently. That is the
    // "works in dev, records nothing in production" bug, avoided by construction.
    const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' })

    // sendBeacon returns false when the browser's queue is full, which is the
    // fallback's real job - not merely older browsers.
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return

    void fetch(ENDPOINT, {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    }).catch(() => {})
  } catch {
    /* a counter must never break a render or a click */
  }
}

/** Storage that tolerates being switched off (private mode, blocked storage). */
function readFlag(key: string): boolean {
  try {
    return !!localStorage.getItem(key)
  } catch {
    try {
      return !!sessionStorage.getItem(key)
    } catch {
      return false
    }
  }
}

function writeFlag(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    try {
      sessionStorage.setItem(key, value)
    } catch {
      /* nothing left to try; the event may be counted twice, which beats losing it */
    }
  }
}

function referrerOnce(): string {
  try {
    if (sessionStorage.getItem(REFERRER_SENT_KEY)) return ''
    sessionStorage.setItem(REFERRER_SENT_KEY, '1')
  } catch {
    /* no session storage: send it and accept the odd duplicate */
  }
  return document.referrer || ''
}

/**
 * One page view.
 *
 * `/welcome` and `/goodbye` carry a `first` flag the first time this browser
 * sees them. The extension opens `/welcome` only on a fresh install and sets
 * `/goodbye` as its uninstall URL (merid-extension-final/background.js), so a
 * first-ever hit is a real install or uninstall - and a refresh, a bookmark or
 * a shared link is not.
 */
export function trackPageView(path: string, lang: Lang): void {
  const payload: Record<string, unknown> = { type: 'page', path, lang, ref: referrerOnce() }

  if (path === '/welcome' && !readFlag(INSTALL_KEY)) {
    payload.first = true
    writeFlag(INSTALL_KEY, new Date().toISOString().slice(0, 10))
  } else if (path === '/goodbye' && !readFlag(UNINSTALL_KEY)) {
    payload.first = true
    writeFlag(UNINSTALL_KEY, new Date().toISOString().slice(0, 10))
  }

  send(payload)
}

/** One "Add to Chrome" click. Never call preventDefault around this: the link
 *  must still work if the beacon throws, and a middle-click that we miss is a
 *  far smaller loss than an install we blocked. */
export function trackInstallClick(where: Placement): void {
  send({ type: 'cta', where, path: location.pathname })
}

/**
 * One exit-survey submission, plus the reasons ticked.
 *
 * The survey itself goes to Firestore, where firestore.rules makes the
 * collection deliberately unreadable - a one-way mailbox. Counting the reasons
 * here is what puts the breakdown on the dashboard without turning that mailbox
 * into something scrapeable.
 */
export function trackUninstallReasons(reasons: readonly string[], lang: Lang): void {
  send({ type: 'survey', reasons: [...reasons], lang, path: location.pathname })
}
