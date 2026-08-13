// Single sign-on and language hand-off to the Merid Chrome extension.
//
// The extension injects a tiny bridge script on merid.site only. Protocol
// (all via window.postMessage on our own origin, with no page content involved):
//   extension -> page : { source: 'merid-ext', type: 'MERID_EXT_PING' }
//   page -> extension : { source: 'merid-web', type: 'MERID_WEB_SESSION',
//                         refreshToken, email }        (user signed in)
//   page -> extension : { source: 'merid-web', type: 'MERID_WEB_SIGNOUT' }
//   page -> extension : { source: 'merid-web', type: 'MERID_WEB_LANG', lang }
//
// The refresh token is the user's own credential, posted only to our own
// window; the extension's service worker re-validates it against Google
// before storing anything, so a spoofed message cannot plant a session.
//
// The language message is how the extension's panel comes up in the language
// chosen here: chrome.i18n follows the BROWSER's language and takes no
// override, so picking VI on this site would otherwise leave the toolbar
// panel in English. It carries the two-letter code and nothing else.
import type { User } from 'firebase/auth'
import type { Lang } from '../i18n/translations'

let currentUser: User | null = null
let currentLang: Lang | null = null
let listening = false

function post(message: Record<string, unknown>) {
  window.postMessage({ source: 'merid-web', ...message }, window.location.origin)
}

function announce() {
  if (currentUser) {
    post({
      type: 'MERID_WEB_SESSION',
      refreshToken: currentUser.refreshToken,
      email: currentUser.email ?? '',
    })
  } else {
    post({ type: 'MERID_WEB_SIGNOUT' })
  }
  if (currentLang) post({ type: 'MERID_WEB_LANG', lang: currentLang })
}

/** Start replying to the extension's ping, once. It fires on install and on
 *  every page load, and it is what makes installing the extension AFTER
 *  logging in (or after picking a language) work. */
function listen() {
  if (listening) return
  listening = true
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window || e.origin !== window.location.origin) return
    const d = e.data as { source?: string; type?: string } | null
    if (d?.source === 'merid-ext' && d.type === 'MERID_EXT_PING') announce()
  })
}

/** Called by AuthContext on every auth state change. */
export function announceAuthToExtension(user: User | null) {
  currentUser = user
  listen()
  announce()
}

/** Called by LanguageProvider whenever the VI/EN choice is made or restored. */
export function announceLangToExtension(lang: Lang) {
  currentLang = lang
  listen()
  post({ type: 'MERID_WEB_LANG', lang })
}
