// =============================================================
// Merid - session bridge, runs ONLY on merid.site (see manifest).
//
// Purpose: sign in once. When the user logs in on merid.site, the web app
// posts its Firebase session to this bridge, which relays it to the service
// worker so the extension starts syncing without a second login.
//
// Scope & privacy: this is the extension's only automatic content script and
// it is limited to our own site. It reads NO page content - it only listens
// for the specific handshake messages below and posts one "ping" so the page
// knows the extension is installed.
//
// Security: messages are accepted only from the page's own window and origin
// (postMessage from embedded iframes/other origins is ignored), and the relay
// carries nothing but the session fields. The service worker re-validates the
// refresh token against Google before trusting it.
// =============================================================
(function () {
    'use strict';

    const PAGE_ORIGIN = window.location.origin;

    window.addEventListener('message', (event) => {
        if (event.source !== window || event.origin !== PAGE_ORIGIN) return;
        const d = event.data;
        if (!d || d.source !== 'merid-web') return;

        if (d.type === 'MERID_WEB_SESSION' && typeof d.refreshToken === 'string' && d.refreshToken) {
            chrome.runtime.sendMessage({
                type: 'MERID_ADOPT_SESSION',
                refreshToken: d.refreshToken,
                email: typeof d.email === 'string' ? d.email : ''
            }, () => { void chrome.runtime.lastError; });
        } else if (d.type === 'MERID_WEB_SIGNOUT') {
            chrome.runtime.sendMessage({ type: 'MERID_WEB_SIGNOUT' }, () => { void chrome.runtime.lastError; });
        }
    });

    // Tell the page we're here, so it can hand over an existing session.
    window.postMessage({ source: 'merid-ext', type: 'MERID_EXT_PING' }, PAGE_ORIGIN);
})();
