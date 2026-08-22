# Privacy Policy - Merid

_Last updated: 2026-08-18_

Merid is a browser extension that helps Vietnamese speakers learn English
vocabulary while browsing. This policy explains exactly what the extension does
with data.

Finding and replacing words happens **entirely inside your browser**: no
browsing history is kept, no URLs are stored, and nothing is sent to anyone in
order to do it.

There is one exception, and it is **on by default**: the AI context check.
Before a replaced word is shown, the extension sends the short sentence around
it (up to 180 characters) to `merid.site/api/check`, and from there to a
language model, to ask whether the word actually fits. That is described in
full below, and turning it off in Settings stops every request instantly.

This used to be off by default and required an API key of your own. Merid now
supplies the keys and counts usage server-side, so the feature works with no
setup - the trade is that a Merid server now sits in the middle, which earlier
versions of this policy said there was not.

The full policy, covering the merid.site website as well, is at
<https://merid.site/privacy-policy>.

## What the extension processes locally

- **Page text.** To find vocabulary matches, the extension reads the visible text
  of pages you visit and compares it against bundled word lists. This scanning
  and replacement happens **entirely in your browser**. No page content is sent
  anywhere beyond the sentence fragments used by the AI context check below.
- **Pages the extension does not read at all.** Messaging, email, banking and
  payments, sign-in screens and password managers, health, tax/benefits/identity
  services and proctored exams are excluded outright, and cannot be switched on.
  Where a site serves private messages from the same address as public content -
  Facebook, Instagram, X, LinkedIn, TikTok, Reddit - the message pages are
  excluded on their own, so a direct message is never read even though the feed
  on that site is. Opening an inbox without a page reload is covered too: the
  extension stops and restores the page. Nothing from an excluded page is
  scanned, stored or sent, whatever your other settings say.
- **Your settings.** Your preferences (selected dataset, display mode, intensity,
  Vietnamese→English / English→English direction, on/off state, interface
  language, and the lists of sites you paused or re-enabled) are stored on your
  device using `chrome.storage`. If you enable Chrome Sync, your *settings* may
  sync across your own Chrome profiles via Google.
- **Your deck.** Words you save ("Save to Deck") and words you mark known
  ("I know this") are stored on your device. They leave it only via the optional
  sync below.
- **Custom datasets you upload.** Vocabulary CSV files you import in Settings →
  "My datasets" are validated and stored **only on your device**
  (`chrome.storage.local`). They are never uploaded to Merid, Firebase, any AI
  service, or anywhere else, and they are **not** included in the optional sync -
  which also means they do not follow you to other devices. You can delete
  any dataset individually from Settings, or remove everything with **Delete all
  stored data**; uninstalling the extension also removes them.
- **The AI answer cache.** Context-check results are kept on the device for 30
  days, so re-reading a page costs no further requests. It is never synced.
- **A device identity for the AI allowance.** An anonymous account id and a
  refresh token, stored locally - see "AI context check" below.

## What is sent off your device

**AI context check (on by default).** After Merid replaces a word, it asks a
language model whether that word really fits the sentence it landed in; words
that do not fit are never shown. For each checked word it sends:

- the **English word** that was substituted,
- the **Vietnamese** it replaced,
- up to **180 characters of the sentence around it**, and
- a short summary of your own preferences, built on your device from your
  ratings (for example "prefers C1-level words; reads mostly business").

At most 20 words per request, and at most 3 requests per page.

It does **not** send the page address, the page title, your browsing history,
form or input contents, cookies, or any part of the page beyond those sentence
fragments. Answers are cached on your device for 30 days.

There are two ways this request reaches a model, and you choose which:

- **Through Merid (the default).** The request goes to `merid.site/api/check`, a
  serverless function Merid runs on Vercel, which holds the API keys and
  forwards the question to a model provider: **Qwen (Alibaba Cloud Model
  Studio)** answers first, with **Google Gemini** as the fallback. The provider
  receives the text of the question only - not your account id, not your email,
  and no way to tell who asked. Merid's server keeps **one number**: how many
  requests were made today, counted against your account id and expiring at
  midnight UTC. The fragments are not logged, not written to any database, and
  not used to train anything. **Turn the check off in Settings** and nothing is
  sent at all.
- **With your own API key.** If you have a personal Gemini key saved, Merid uses
  it instead and the request goes **straight from your browser to Google** - it
  never reaches a Merid server, and no daily limit from us applies. The key
  field is currently hidden in Settings because almost nobody needs it any more;
  a key saved under an earlier version is still used, and can still be cleared.

**Anonymous account for the AI check.** So the daily allowance can be counted
without asking you to sign up, Merid creates an anonymous Firebase account for
this device the first time the check runs. It holds no personal information -
just a random id - and is used only to count that allowance. Signing in with a
real account replaces it and raises the limit.

**Personalization profile (on by default, stored on your device).** Merid
records how you interact with the words it shows: how often a word appeared,
whether you opened its card, rated it 👍/👎, saved it to your deck, or marked
it "I know this", plus a coarse subject area derived from the page's address
(for example `business` or `tech`) and the CEFR level of the word. It uses
these counts to show more of what suits you and less of what does not.

This profile contains **counts about vocabulary only**. It does not store page
text, page titles, full URLs, your browsing history, or anything that
identifies you. It lives in `chrome.storage.local` on this device; if you use
the optional sync, it is also backed up to your own account so your
preferences follow you to another computer. You can read back everything it
holds - and erase it on its own, without touching your deck - in Settings →
**What Merid has learned about you** → **Forget what Merid learned**.

**Optional sync (off unless you sign in).** You can sign in (on merid.site
- the login carries over automatically - or from the Settings page) to back up
your saved deck and study it on merid.site. When signed in, the data synced is:

- your **email address** (your account identity),
- your **deck** (saved words with their dictionary info, and your known-words
  list),
- your **personalization profile**, as a backup, and
- your own **Gemini API key**, if you have one saved (see "API keys" below).

All of it is stored in Firestore under your own account and protected by
server-side security rules so only you can access it. Page content is **not**
part of the sync. Signing out stops all syncing immediately.

## Where the extension may connect

The extension's own Content Security Policy allows exactly four destinations:
`merid.site` (the context check), and Google's endpoints for sign-in
(`identitytoolkit`, `securetoken`), Firestore, and the Gemini API. Nothing else
is reachable from it.

## API keys

- The extension ships with **no API keys**. Merid's keys live in server-side
  environment variables and are never sent to a browser - a key inside an
  extension is a key anyone can read.
- The optional **personal key** path uses your own Google Gemini API key, created
  at aistudio.google.com. It is stored on your device (`chrome.storage.local`).
  If you sign in to the optional sync, it is additionally backed up to your own
  account's private Firestore document - protected by server-side security rules
  so only you can read it - purely so the feature keeps working when you sign in
  on another device. The key is only ever sent to Google endpoints (Gemini,
  Firestore) over TLS and is deleted from both places when you clear it in
  Settings.

## Third parties

Vercel (hosting for merid.site and `/api/check`), Alibaba Cloud Model Studio
(Qwen), Google Gemini API, Google Firebase Authentication and Cloud Firestore,
and Upstash Redis (the daily allowance counter). No third-party analytics, no ad
networks, no tracking pixels.

## Your controls

- **Turn the extension off** entirely with the popup toggle, or pause it on a
  single website with **Turn off on this site**.
- **Turn off the AI context check** in Settings at any time - after that nothing
  leaves the device, bar the sync if you are signed in.
- **Sign out** in Settings to stop syncing immediately.
- **Forget what Merid learned** in Settings clears the personalization profile
  on its own, leaving your deck and settings intact.
- **Delete everything:** Settings → **Delete all stored data** clears your
  settings, deck, profile and datasets from the device. Uninstalling the
  extension also removes local data. To remove synced data as well, clear your
  deck while signed in (or contact support via the store listing to delete your
  account data).

## Data retention

Extension data is stored on your device until you clear it or uninstall. The AI
answer cache expires after 30 days; the daily allowance counter expires at
midnight UTC. Synced data remains in your own Firebase account until you delete
it or ask for account deletion via the support contact.

## Limited Use

Merid's use and transfer of information received from Google APIs adheres to the
Chrome Web Store User Data Policy, including the Limited Use requirements. Data
is used only to provide the user-facing features described here; it is not sold,
not used for advertising, and not used to train models. It is transferred to
third parties only as needed to operate a feature you are using (passing
sentence fragments to a model provider), to comply with law, or as part of a
merger or acquisition with prior notice.

## Children's privacy

The extension is a general-purpose learning tool and does not knowingly collect
personal information from anyone, including children.

## Changes

Material changes to this policy will be reflected in this file, at
<https://merid.site/privacy-policy>, and on the extension's store listing.

## Contact

Questions about privacy can be directed to the extension's support contact listed
on its Chrome Web Store page.
