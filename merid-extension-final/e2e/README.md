# End-to-end checks

These drive a real Chromium with the unpacked extension loaded and assert on
the actual page: what gets replaced, what the tooltip does, and how the AI
context check behaves. They cover the things unit tests cannot - DOM
replacement, the viewport guard, service-worker messaging and storage.

They are **not** part of `npm test`, which stays dependency-free and runs
anywhere. These need Playwright and a Chromium binary.

```bash
npm i --no-save playwright
node e2e/interaction.mjs      # replacement, feedback signals, tooltip
node e2e/scroll-feed.mjs      # endless feed: deep posts checked, caps, 20s ceiling
node e2e/spread.mjs           # words land through a whole article, and in every feed post
node e2e/article-repeat.mjs   # a news article: no repeated word, no bare syllable of a title
node e2e/main-content.mjs     # a news page: the article is scanned, the rail and promos are not
node e2e/ui-language.mjs      # panel language: site choice, Settings override, English card
node e2e/ai-check.mjs         # verdict cache + per-sentence verdicts
node e2e/personalization.mjs  # ranker effect, word upgrades, persona
node e2e/visibility.mjs       # badge, popup panels, card marker, learned-about-you
node e2e/dark-mode.mjs        # the card's palette on dark pages and under forced dark
node e2e/resilience.mjs       # model fallback on 429, review resurfacing, level advice
node e2e/hosted.mjs           # Merid-hosted AI: identity, quota, personal-key priority
node e2e/private-pages.mjs    # DMs on Facebook/Instagram: blocked by path, feed still scanned
node e2e/onboarding.mjs       # first-run wizard: four steps, both ways in, and what it saves
node e2e/visual.mjs           # card artwork: strict-CSP pages, hostile resets, the off switch
```

Set `CHROMIUM_PATH` if your Chromium is not at `/opt/pw-browsers/chromium`.
Each script prints a pass/fail list and exits non-zero on failure.

## Traps worth knowing before editing these

- **`e2e/visual.mjs` draws its own pictures if `vis/` is empty, and deletes
  them afterwards.** Real artwork is produced by the dataset pipeline and
  committed; the placeholders this script generates are not, because a
  checked-in gradient claiming to illustrate "abolish" is worse than no picture.
  It encodes them with a throwaway Chromium (canvas -> `toDataURL('image/webp')`)
  because nothing in this repo encodes images. If you interrupt the script
  mid-run, delete any leftover `vis/` and `visual-index.json` by hand.

- **Setting `datasetKey` in `chrome.storage.sync` does not switch the
  dataset.** The worker caches the parsed vocabulary and rebuilds it only via
  the `setDataset` message / `loadVocabulary()`, which is the path the popup
  and options page use. Write the key *and* call `loadVocabulary()`, or the
  test silently runs against the default SAT set.

- **A fresh install arms the setup wizard, and the popup gives way to it.**
  `onInstalled` writes `onboardingPending: true`, and every one of these scripts
  is a fresh install. The first time `popup.html` is opened it clears the flag,
  hands the wizard to the active tab and closes itself - so a test driving the
  popup loses the page under it ("Target page, context or browser has been
  closed"). If you open `popup.html`, set
  `{ onboardingPending: false, onboardingDone: true }` in your setup. Content
  scripts are unaffected: the wizard never opens itself on a page.

- **A `fetch` stub must only intercept `generativelanguage.googleapis.com`.**
  The worker also `fetch()`es the bundled dataset CSVs through
  `chrome.runtime.getURL`. A blanket stub swallows those too, leaving an empty
  vocabulary, zero replacements, and assertions that pass vacuously because
  there is nothing on the page to be wrong about.

  The same stub now also swallows `visual-index.json`, which the worker fetches
  the same way. That failure is quieter: the index comes back empty, every word
  falls through to a generated glyph, and a test asserting "the card has some
  artwork" passes without a single bundled picture having been loaded.

- **Feedback is batched, not immediate.** The content script queues interaction
  events and flushes after 4s (explicit ratings flush at once). A test that
  closes the tab sooner is relying on the `pagehide` flush winning a race
  against teardown - it usually loses. Wait out the timer with the page open.

- **The worker cannot `sendMessage` to itself.** `chrome.runtime.sendMessage`
  never invokes the sender's own listener, so a check driven from
  `sw.evaluate` gets no reply at all. Drive message-based assertions from an
  extension page (the popup or options page) instead.
