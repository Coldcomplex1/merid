# Privacy Policy - Merid

_Last updated: 2026-07-18_

Merid is a browser extension that helps Vietnamese speakers learn English
vocabulary while browsing. This policy explains exactly what the extension does
with data. In its default state Merid processes everything inside your browser
and sends nothing anywhere. Two optional features - deck sync and the AI
context check - send limited data off your device **only after you turn them
on**, exactly as described below. Merid runs no servers of its own.

## What the extension processes locally

- **Page text.** To find vocabulary matches, the extension reads the visible text
  of pages you visit and compares it against bundled word lists. This scanning
  and replacement happens **entirely in your browser**. Page text is never sent
  anywhere by default; the only exception is the optional AI context check
  described below, which you must turn on yourself.
- **Your settings.** Your preferences (selected dataset, display mode, intensity,
  Vietnamese→English / English→English direction, on/off state, and the list of
  sites you paused Merid on) are stored on your device using `chrome.storage`.
  If you enable Chrome Sync, your *settings* may sync across your own Chrome
  profiles via Google - the extension itself runs no account server.
- **Your deck.** Words you save ("Save to Deck") and words you mark known
  ("I know this") are stored on your device. They leave it only via the optional
  deck sync below.
- **Custom datasets you upload.** Vocabulary CSV files you import in Settings →
  "My datasets" are validated and stored **only on your device**
  (`chrome.storage.local`). They are never uploaded to Merid, Firebase, any AI
  service, or anywhere else, and they are **not** included in the optional deck
  sync - which also means they do not follow you to other devices. You can delete
  any dataset individually from Settings, or remove everything with **Delete all
  stored data**; uninstalling the extension also removes them.

## What is sent off your device

**By default, nothing.** With no sign-in and no API key, the extension makes no
network requests and never transmits page content, URLs, browsing history,
personal identifiers, cookies, or form/input contents anywhere.

**Optional deck sync (off unless you sign in).** You can sign in (on merid.site
- the login carries over automatically - or from the Settings page) to back up
your saved deck and study it on merid.site. When signed in, the data synced is:

- your **email address** (your account identity),
- your **deck** (saved words with their dictionary info, and your known-words
  list), and
- if you use the AI context check, your own **Gemini API key** (see "API keys"
  below).

All of it is stored in Firestore under your own account and protected by
server-side security rules so only you can access it. Page content is **not**
part of deck sync. Signing out stops all syncing immediately.

**Optional AI context check (off by default; requires your own key).** If you
turn this feature on in Settings and paste your own Google Gemini API key,
then after Merid replaces words on a page it sends Google's Gemini API a short
snippet of **page text** for each replaced word - the replaced word, the
original word, and up to ~180 characters of the sentence around it (at most 20
words per request, at most 3 requests per page). Gemini answers whether each
replacement fits its sentence; words that do not fit are reverted. These
snippets are sent directly from your browser to Google using your key, are not
stored by the extension, and pass through no Merid server (there are none).
Google's handling of Gemini API data is governed by Google's own terms. Turn
the feature off in Settings to stop all such requests instantly.

## API keys

- The extension ships with **no API keys** and works fully without one.
- The optional **AI context check** uses **your own** Google Gemini API key,
  which you create yourself at aistudio.google.com and paste into Settings. The
  key is stored on your device (`chrome.storage.local`). If you sign in to the
  optional deck sync, the key is additionally backed up to your own account's
  private Firestore document - protected by server-side security rules so only
  you can read it - purely so the feature keeps working when you sign in on
  another device. The key is only ever sent to Google endpoints (Gemini,
  Firestore) over TLS and is deleted from both places when you clear it in
  Settings.
- There is no Merid backend or proxy; nothing passes through servers we run.

## Your controls

- **Turn the extension off** entirely with the popup toggle, or pause it on a
  single website with **Turn off on this site**.
- **Revert a page** to its original text from the popup.
- **Turn off the AI context check** or clear your API key in Settings at any time.
- **Sign out** in Settings to stop deck sync immediately.
- **Delete everything:** Settings → **Delete all stored data** clears your
  settings, deck and datasets from the device. Uninstalling the extension also
  removes local data. To remove synced data as well, clear your deck while
  signed in (or contact support via the store listing to delete your account
  data).

## Data retention

Extension data is stored on your device until you clear it or uninstall. Synced
deck data remains in your own Firebase account until you delete it or ask for
account deletion via the support contact.

## Children's privacy

The extension is a general-purpose learning tool and does not knowingly collect
personal information from anyone, including children.

## Changes

Material changes to this policy will be reflected in this file and the extension's
store listing.

## Contact

Questions about privacy can be directed to the extension's support contact listed
on its Chrome Web Store page.
