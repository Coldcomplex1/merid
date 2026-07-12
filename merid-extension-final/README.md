# Merid

A **local-only** Chrome extension (Manifest V3) that helps **Vietnamese learners
pick up English vocabulary passively** while they browse Vietnamese websites. It
detects selected Vietnamese words/phrases from bundled SAT / CEFR datasets and
swaps or annotates them with the English equivalent.

Everything runs **inside your browser**. There is **no backend, no API key, and
no network request to any server** - the extension never sends page content
anywhere.

---

## Features

- Detects Vietnamese vocabulary from bundled datasets (**SAT**, **CEFR C1**, **CEFR C2**, or **All**).
- Replaces / highlights / annotates matches with the English word.
- **Three display modes:** Replace directly · Highlight only (hover for meaning) · Show beside (`từ (word)`).
- **Adjustable intensity** (Light / Medium / Heavy) so you control how aggressive it is.
- **Two scan directions** - Vietnamese → English and English → English - that toggle
  independently; enable both to scan Vietnamese and English on the same page.
- Learning card on hover: definition, pronunciation (browser TTS), phonetics,
  synonyms/antonyms, example.
- **Personal deck (local):** *Save to Deck* keeps a word for review; *I know this*
  stops replacing words you already know. Both lists are managed on a dedicated
  **My deck** page (`deck.html`), opened from the popup.
- Works on dynamic / SPA pages (debounced `MutationObserver`), instant on/off, instant revert.
- **Fully local:** settings and your deck stay on your device; nothing ever leaves the browser.

---

## Architecture

```
Chrome Extension (local only - no network, no secrets)
 ├─ lib/vocab-core.js   Pure, DOM-free logic (matching, normalization, CSV) - also unit-tested
 ├─ content.js          Scans visible text, replaces matches, tooltip, revert
 ├─ background.js       Loads bundled CSV datasets, serves settings/vocabulary to the UI + content script
 ├─ popup.*             Quick controls (dataset, intensity, mode, on/off, revert)
 └─ options.*           Full config: replacement mode / intensity / direction / dataset / privacy
```

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest - minimal permissions, options page, CSP |
| `lib/vocab-core.js` | Shared pure functions (works in the content script **and** in Node tests) |
| `content.js` | DOM scanning, replacement, tooltip, live re-processing, revert |
| `background.js` | Loads bundled CSV datasets, answers settings/vocabulary requests (no network) |
| `popup.html/js/css` | Toolbar popup: dataset, intensity, mode, toggles, revert, deck + settings links |
| `options.html/js/css` | Settings page: replacement options, dataset, data controls |
| `deck.html/js/css` | Dedicated "My deck" page: saved + known words (local) |
| `dataset-*.csv` | Bundled vocabulary (SAT / C1 / C2) |
| `fonts/` | Self-hosted Outfit + Inter woff2 (no remote font requests) |
| `test/`, `scripts/` | Node test suite + zero-dep lint/build scripts |

---

## Install (load unpacked)

1. `git clone` this repo.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the repo folder (or the `dist/` folder after `npm run build`).
4. Pin the extension and open a Vietnamese site (e.g. vnexpress.net, tuoitre.vn).

That's it - there is no setup, no account, and no configuration required. Open
the popup to pick a dataset and toggle the extension on.

---

## Using it

- **Popup** (toolbar icon): pick a dataset (SAT / C1 / C2 / All), set the
  highlight intensity, choose a display mode, toggle Vietnamese→English or
  English→English, turn the extension on/off, or revert the current page.
- **Settings** (options page): the same replacement/intensity/direction/dataset
  controls plus a **Delete all stored data** button.
- Hover any replaced/highlighted word to see its definition, example,
  synonyms/antonyms and to hear it pronounced (browser text-to-speech).

---

## Privacy

Full policy in [`PRIVACY.md`](PRIVACY.md). In short:

- Page text is scanned **locally** in your browser to find vocabulary matches.
- The extension **does not send webpage content to any server** and **uses no AI API**.
- The extension **does not require or store any API key**.
- Only your **settings** (selected dataset, display mode, intensity, on/off) are
  stored locally via `chrome.storage`.
- You can **disable the extension anytime** from the popup, and **Delete all
  stored data** from the Settings page.

---

## Permissions & why they're needed

| Permission | Why |
|---|---|
| `storage` | Save your settings and deck locally (selected dataset, display mode, intensity, scan direction, on/off, saved words, known words). |
| `activeTab` | Lets the popup talk to the current tab (e.g. "revert this page"). |
| `content_scripts: <all_urls>` | The core feature is passive replacement **while you browse any Vietnamese site**, so the content script must run on the pages you visit. It only reads text locally to match vocabulary; nothing is sent anywhere. |

No host permissions, no optional permissions, no external domains - the
extension makes zero network requests.

---

## Datasets

CSV files bundled with the extension. Columns: `word, type, phon_br, phon_n_am,
definition, example, vietnamese, synonyms, antonyms`. Loading is lazy, deduped by
word, validated, and cached for fast service-worker wake-ups.

**Adding CEFR B2** (or any dataset): drop `dataset-B2.csv` (same columns) in the
repo, add a one-line entry to `DATASET_REGISTRY` in `lib/vocab-core.js`, and add a
button in `popup.html` / `options.html`. No other code changes needed. B2 is not
included because we don't ship fabricated vocabulary data.

---

## Development

No build step is required to run the extension unpacked. Tooling is zero-dependency
(uses Node's built-ins):

```bash
npm test          # run the unit test suite (node --test) for lib/vocab-core.js
npm run lint      # syntax-check every extension script (node --check)
npm run build     # copy shippable files to dist/ (+ dist.zip) and fail if a secret is present
npm run gen:assets # re-render the icons + store images from assets/ (needs a Chromium binary)
```

The build **whitelists** only the files the extension needs - `assets/`,
`store-assets/`, `test/`, `scripts/`, docs, and `node_modules/` never ship.

### Store assets

Branded PNGs are generated from the HTML sources in [`assets/`](assets) by
`scripts/gen-assets.js` (via a headless Chromium; set `CHROME_BIN` if it can't be
found automatically). Outputs: the extension icons (`icon16/48/128.png`) and the
Chrome Web Store images in [`store-assets/`](store-assets) (screenshots 1280×800,
promo tile 440×280, marquee 1400×560). Copy-paste listing text lives in
[`STORE_LISTING.md`](STORE_LISTING.md).

---

## Publish checklist (Chrome Web Store)

1. `npm test && npm run lint && npm run build` → produces `dist/` and `dist.zip`.
2. Load `dist/` unpacked in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
3. Test on several real Vietnamese sites (e.g. vnexpress.net, tuoitre.vn).
4. Confirm word replacement works.
5. Confirm the on/off toggle works.
6. Confirm the dataset selector works (SAT / C1 / C2 / All).
7. Confirm **no API key** exists in the built files (the build fails if a key-shaped string is found).
8. Confirm **no backend / API call** is made (open DevTools → Network on a test page; there should be no external requests from the extension).
9. Confirm permissions are minimal (`storage`, `activeTab`).
10. Store assets are ready: icons `icon16/48/128.png`, screenshots + promo images in
    [`store-assets/`](store-assets). Copy the listing text from [`STORE_LISTING.md`](STORE_LISTING.md).
11. Zip the production build (`dist.zip` is created for you).
12. Create/sign in to a Chrome Web Store developer account ($5 one-time), upload `dist.zip`,
    fill the data-use form ("does not collect or transmit user data"), add a public URL for
    [`PRIVACY.md`](PRIVACY.md), then submit for review.
