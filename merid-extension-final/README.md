# Merid

A Chrome extension (Manifest V3) that helps **Vietnamese learners pick up
English vocabulary passively** while they browse. It detects Vietnamese
words/phrases from bundled SAT / CEFR datasets (or your own uploaded CSV) and
swaps or annotates them with the English equivalent, with a learning card on
hover.

**The core experience is local:** page scanning, matching and replacement all
run inside your browser, and the default install makes **no network requests**.
Two **optional, off-by-default** features use the network once the user opts in:

- **Deck sync** - sign in (on merid.site or in Settings) to back up your saved
  words to your own Firebase account and study them on merid.site/my-deck.
- **AI context check** - paste **your own** Gemini API key and Merid verifies
  each replaced word fits its sentence (short sentence snippets are sent to
  Google's Gemini API; bad fits revert automatically).

---

## Features

- Vietnamese → English and English → English scanning (independently toggleable).
- Bundled datasets (**SAT**, **CEFR C1**, **CEFR C2**, or **All**).
- **Custom datasets:** upload your own vocabulary CSV in Settings ("My datasets"),
  then select it from the popup or Settings. A guided builder at
  [merid.site/create-dataset](https://merid.site/create-dataset) helps you generate
  a compatible CSV with an AI of your choice. Custom datasets are stored **only on
  your device**.
- **Three display modes:** Replace directly · Highlight only (hover for meaning) · Show beside (`từ (word)`).
- **Adjustable intensity** so you control how aggressive replacement is.
- Learning card on hover: definition, pronunciation (browser TTS), phonetics,
  synonyms/antonyms, example.
- **Personal deck:** *Save to Deck* keeps a word for review; *I know this*
  stops replacing words you already know. Optional cloud backup via sign-in.
- **Per-site pause:** "Turn off on this site" in the popup keeps Merid away from
  sites where replacement is unwanted (banking, work tools…). Covers the site's
  subdomains too.
- **Revert this page** button restores the original text with one click.
- Works on dynamic / SPA pages (debounced `MutationObserver`), instant on/off.
- **Localized UI:** English + Vietnamese (`_locales/`), following the browser language.
- First-run onboarding tour (merid.site/welcome) and an uninstall exit survey.

---

## Architecture

```
Chrome Extension
 ├─ lib/vocab-core.js   Pure, DOM-free logic (matching, normalization, CSV, per-site rules) - unit-tested
 ├─ content.js          Scans visible text, replaces matches, tooltip, revert, AI-check batching
 ├─ background.js       Loads bundled CSV datasets, serves settings/vocabulary, optional sync + Gemini calls
 ├─ popup.*             Quick controls (dataset, intensity, mode, on/off, per-site pause, revert)
 └─ options.*           Full config: replacement, datasets, account & sync, AI check, privacy
```

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest - minimal permissions (`storage`, `activeTab`), options page, CSP |
| `_locales/en`, `_locales/vi` | UI strings (manifest + popup + learning card) |
| `lib/vocab-core.js` | Shared pure functions (works in the content script **and** in Node tests) |
| `lib/custom-datasets.js` | `chrome.storage.local` persistence for user-uploaded datasets (background only) |
| `lib/firebase-config.js` | Firebase project identifiers + merid.site URLs (not secrets) |
| `lib/firebase-rest.js`, `lib/sync.js` | Optional deck sync over Firebase REST (no SDK, no remote code) |
| `content.js` | DOM scanning, replacement, tooltip, live re-processing, revert |
| `content-bridge.js` | merid.site single sign-on relay (session carries into the extension) |
| `background.js` | Datasets, settings, optional sync + AI-check requests |
| `popup.html/js/css` | Toolbar popup |
| `options.html/js/css` | Settings page |
| `dataset-*.csv` | Bundled vocabulary (SAT / C1 / C2) |
| `fonts/` | Self-hosted Outfit + Inter woff2 (no remote font requests) |
| `test/`, `scripts/` | Node test suite + zero-dep lint/build scripts |

---

## Install (load unpacked)

1. `git clone` this repo.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the repo folder (or the `dist/` folder after `npm run build`).
4. Pin the extension and open a Vietnamese site (e.g. vnexpress.net, tuoitre.vn).

No account or API key is required for the core experience - open the popup,
pick a dataset and browse.

---

## Using it

- **Popup** (toolbar icon): pick a dataset (SAT / C1 / C2 / All / your own), set
  the intensity, choose a display mode, toggle Vietnamese→English /
  English→English, turn the extension on/off, pause it on the current site, or
  revert the current page.
- **Settings** (options page): the same replacement controls plus custom dataset
  upload, account & sync, the AI context check, and **Delete all stored data**.
- Hover any replaced/highlighted word to see its definition, example,
  synonyms/antonyms and to hear it pronounced (browser text-to-speech).

---

## Privacy

Full policy in [`PRIVACY.md`](PRIVACY.md). In short:

- Page text is scanned **locally** in your browser to find vocabulary matches.
- **By default the extension makes no network requests** - no account, no key,
  nothing sent anywhere.
- If you **sign in** (optional), your email + deck (saved/known words) are stored
  in your own Firebase account for backup/study on merid.site. Signing out stops
  syncing.
- If you enable the **AI context check** (optional, needs your own Gemini key),
  short sentence snippets around replaced words are sent to Google Gemini to
  verify fit. Nothing is proxied through Merid servers - there are none.
- You can **pause Merid per site**, **turn it off**, and **Delete all stored
  data** from Settings.

---

## Permissions & why they're needed

| Permission | Why |
|---|---|
| `storage` | Save your settings, per-site pause list and deck locally; hold the optional sign-in session. |
| `activeTab` | The popup's current-tab actions: read the active tab's hostname for "Turn off on this site" and message the page for "Revert this page". Only on user action. |
| `content_scripts: <all_urls>` | The core feature is passive replacement **while you browse**, so the content script must run on the pages you visit. Matching is local; page snippets leave the browser only via the opt-in AI check. |

No `host_permissions`, no optional permissions, no remote code. The `identity`
permission is **not** requested: in-extension Google sign-in stays dormant until
`googleClientId` is configured in `lib/firebase-config.js` **and** `identity` is
added back to the manifest (see the comments there). Users still get Google
sign-in on merid.site - the session carries into the extension automatically.

---

## Datasets

CSV files bundled with the extension. Columns: `word, type, phon_br, phon_n_am,
definition, example, vietnamese, synonyms, antonyms`. Loading is lazy, deduped by
word, validated, and cached for fast service-worker wake-ups.

**Adding CEFR B2** (or any bundled dataset): drop `dataset-B2.csv` (same columns)
in the repo, add a one-line entry to `DATASET_REGISTRY` in `lib/vocab-core.js`, and
add a button in `popup.html` / `options.html`. No other code changes needed. B2 is
not included because we don't ship fabricated vocabulary data - but users can build
their own B2 list as a custom dataset (below) without rebuilding the extension.

### Custom datasets (user-uploaded)

Users can upload their own vocabulary CSVs from **Settings → Vocabulary dataset →
My datasets**. The guided page at
[merid.site/create-dataset](https://merid.site/create-dataset) generates an AI
prompt that produces a compatible file.

- **Format:** same header as the bundled files -
  `word,type,phon_br,phon_n_am,definition,example,vietnamese,synonyms,antonyms`.
  Only `word` and `vietnamese` are required per row; other fields may be empty.
  A `cefr` column (as in the bundled C1/C2 files) is also accepted. Column order
  doesn't matter; headers are matched case-insensitively. Quoted fields (commas,
  escaped `""` quotes, even line breaks), UTF-8 Vietnamese, BOM and CRLF are all
  handled.
- **Validation:** files are checked before import (`validateDatasetCsv` in
  `lib/vocab-core.js`); the UI shows how many rows are valid, which rows were
  skipped and why, and which duplicates were removed. **Duplicate headwords keep
  the first row** (same rule the bundled "All" dataset uses). Broken rows are
  never imported silently.
- **Limits:** 2 MB per file, 5,000 rows per dataset, 10 datasets, name ≤ 40
  characters. Clear errors are shown instead of truncating silently.
- **Storage & privacy:** validated entries are stored in `chrome.storage.local`
  (`vm_custom_index` + `vm_custom_data_<id>`) on the device only. They are never
  uploaded anywhere, never sent to any AI, and are **not** part of the optional
  deck sync - which also means custom datasets do **not** follow you to another
  computer; re-upload the CSV there. Deleting a dataset (or Settings → Delete all
  stored data) removes it completely.
- **Selection:** a custom dataset is selected with `datasetKey = custom:<id>`
  (popup "My datasets" dropdown or the Use button in Settings). "All" covers only
  the bundled datasets and never mixes in custom entries. If the selected custom
  dataset is missing (e.g. deleted, or the setting synced to another device),
  Merid falls back to SAT and shows a notice.

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

Routine console logging is compiled out of release builds: flip the `DEBUG`
flag at the top of `content.js` / `background.js` while developing.

The build **whitelists** only the files the extension needs - `assets/`,
`store-assets/`, `test/`, `scripts/`, docs, and `node_modules/` never ship.

### Store assets

Branded PNGs are generated from the HTML sources in [`assets/`](assets) by
`scripts/gen-assets.js` (via a headless Chromium; set `CHROME_BIN` if it can't be
found automatically). Outputs: the extension icons (`icon16/48/128.png`) and the
Chrome Web Store images in [`store-assets/`](store-assets) (screenshots 1280×800,
promo tile 440×280, marquee 1400×560).

`store-assets/screenshot-5-realpage.png` is different: it shows the REAL content
script running over a fictional Vietnamese article (`assets/realpage.html`) with
the learning card open - regenerate it with `node scripts/gen-real-screenshot.js`
(needs Playwright, dev-only). Copy-paste listing text lives in
[`STORE_LISTING.md`](STORE_LISTING.md).

---

## Publish checklist (Chrome Web Store)

1. `npm test && npm run lint && npm run build` → produces `dist/` and `dist.zip`.
2. Load `dist/` unpacked in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
3. Test on several real Vietnamese sites (e.g. vnexpress.net, tuoitre.vn).
4. Confirm word replacement, the on/off toggle, the dataset selector, per-site
   pause and "Revert this page" all work.
5. Confirm the UI shows Vietnamese when Chrome's language is Vietnamese
   (`chrome://settings/languages`) and English otherwise.
6. Confirm **no API key ships** in the built files (the build fails if a
   key-shaped secret is found; the Firebase project identifiers in
   `lib/firebase-config.js` are public identifiers, not secrets).
7. Confirm the **default build makes no network requests** (DevTools → Network on
   a test page while signed out with no Gemini key). Then confirm the only
   requests after opting in are to the four Google endpoints in the manifest CSP
   (identitytoolkit / securetoken / firestore / generativelanguage).
8. Confirm permissions are exactly `storage` + `activeTab`.
9. Host [`PRIVACY.md`](PRIVACY.md) at a public URL (e.g. merid.site/privacy).
10. Store assets ready: icons `icon16/48/128.png`, screenshots + promo images in
    [`store-assets/`](store-assets). Copy listing text, the single-purpose
    statement, permission justifications, **and the data-safety answers** from
    [`STORE_LISTING.md`](STORE_LISTING.md) - they must match actual behavior.
11. Upload `dist.zip` in the developer dashboard ($5 one-time registration),
    fill the data-use form per STORE_LISTING §6, add the privacy policy URL and
    a support email, then submit for review. Expect a longer first review
    because of the all-sites content script.
