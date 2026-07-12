// Single sign-on hand-off to the Merid Chrome extension.
//
// The extension injects a tiny bridge script on merid.site only. Protocol
// (all via window.postMessage on our own origin, with no page content involved):
//   extension -> page : { source: 'merid-ext', type: 'MERID_EXT_PING' }
//   page -> extension : { source: 'merid-web', type: 'MERID_WEB_SESSION',
//                         refreshToken, email }        (user signed in)
//   page -> extension : { source: 'merid-web', type: 'MERID_WEB_SIGNOUT' }
//
// The refresh token is the user's own credential, posted only to our own
// window; the extension's service worker re-validates it against Google
// before storing anything, so a spoofed message cannot plant a session.
import type { User } from 'firebase/auth'

let currentUser: User | null = null
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
}

/** Called by AuthContext on every auth state change. Also replies to the
 *  extension's ping, so installing the extension after logging in works. */
export function announceAuthToExtension(user: User | null) {
  currentUser = user
  if (!listening) {
    listening = true
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const d = e.data as { source?: string; type?: string } | null
      if (d?.source === 'merid-ext' && d.type === 'MERID_EXT_PING') announce()
    })
  }
  announce()
}
