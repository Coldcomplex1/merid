# Privacy Policy - Merid

_Last updated: 2026-07-10_

Merid is a browser extension that helps Vietnamese speakers learn English
vocabulary while browsing. This policy explains exactly what the extension does
with data. Merid processes everything inside your browser; nothing leaves your
device unless you explicitly sign in to the optional deck sync described below.

## What the extension processes locally

- **Page text.** To find vocabulary matches, the extension reads the visible text
  of pages you visit and compares it against bundled word lists. This scanning
  happens **entirely in your browser**. Page text is never uploaded.
- **Your settings.** Your preferences (selected dataset, display mode, intensity,
  Vietnamese→English / English→English direction, and on/off state) are stored on
  your device using `chrome.storage`. If you enable Chrome Sync, your *settings*
  may sync across your own Chrome profiles via Google - the extension itself runs
  no account server.

## What is sent off your device

**By default, nothing.** The extension makes no network requests, does not call
any AI or third-party API, and never transmits page content, URLs, browsing
history, personal identifiers, cookies, or form/input contents anywhere.

**Optional deck sync (off unless you sign in).** You can sign in (on merid.site
- the login carries over automatically - or from the Settings page, with your
Google account or email) to back up your saved deck and study it on merid.site.
When signed in, the only data synced is your deck (the saved words with their
dictionary info and your known-words list) and, if you use the AI context
check, your own Gemini API key (see "API keys" below) - stored in Firestore
under your own account and protected by server-side security rules. Page
content is still never sent anywhere. Signing out stops all syncing
immediately.

## API keys

- The extension ships with **no API keys** and works fully without one.
- The optional **AI context check** (off by default) uses **your own** Google
  Gemini API key, which you create yourself at aistudio.google.com and paste
  into Settings. The key is stored on your device (`chrome.storage.local`). If
  you sign in to the optional deck sync, the key is additionally backed up to
  your own account's private Firestore document — protected by server-side
  security rules so only you can read it — purely so the feature keeps working
  when you sign in on another device. The key is only ever sent to Google
  endpoints (Gemini, Firestore) over TLS and is deleted from both places when
  you clear it in Settings.
- There is no Merid backend or proxy; nothing passes through servers we run.

## Your controls

- **Turn the extension off** entirely with the popup toggle.
- **Revert a page** to its original text from the popup.
- **Delete everything:** Settings → **Delete all stored data** clears your
  settings. Uninstalling the extension also removes local data.

## Data retention

All extension data is stored on your device until you clear it or uninstall.

## Children's privacy

The extension is a general-purpose learning tool and does not knowingly collect
personal information from anyone, including children.

## Changes

Material changes to this policy will be reflected in this file and the extension's
store listing.

## Contact

Questions about privacy can be directed to the extension's support contact listed
on its Chrome Web Store page.
