# Privacy Policy - Merid

_Last updated: 2026-07-10_

Merid is a browser extension that helps Vietnamese speakers learn English
vocabulary while browsing. This policy explains exactly what the extension does
with data. Merid is **local-only**: it processes everything inside your browser
and sends nothing off your device.

## What the extension processes locally

- **Page text.** To find vocabulary matches, the extension reads the visible text
  of pages you visit and compares it against bundled word lists. This scanning
  happens **entirely in your browser**. Page text is never uploaded.
- **Your settings.** Your preferences (selected dataset, display mode, intensity,
  and Vietnamese→English / English→English direction) are stored on your device
  using `chrome.storage`. If you enable Chrome Sync, your *settings* may sync
  across your own Chrome profiles via Google - the extension itself runs no
  account server.

Merid only reads a page after you explicitly activate it there (its keyboard
shortcut or the popup's Activate button, which grant Chrome's temporary
`activeTab` access). It is never injected automatically, and access ends when you
navigate away or reload.

## What is sent off your device

**Nothing.** The extension makes **no network requests**. It does not contact any
backend, does not call any AI or third-party API, and does not transmit page
content, URLs, browsing history, personal identifiers, cookies, or form/input
contents anywhere.

## API keys

- The extension contains **no API keys** and does not ask you for one.
- There is no backend, proxy, or external service involved at any point.

## Your controls

- **Activate Merid** on the current page with its keyboard shortcut
  (`Ctrl+Shift+Y`, or `Command+Shift+Y` on macOS) or the popup's Activate button.
- **Turn Merid off / revert the page** by pressing the shortcut again (or the
  popup button). This restores the original text and stops processing.
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
