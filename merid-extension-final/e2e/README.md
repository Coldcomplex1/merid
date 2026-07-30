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
node e2e/ai-check.mjs         # verdict cache + per-sentence verdicts
node e2e/personalization.mjs  # ranker effect, word upgrades, persona
```

Set `CHROMIUM_PATH` if your Chromium is not at `/opt/pw-browsers/chromium`.
Each script prints a pass/fail list and exits non-zero on failure.

## Two traps worth knowing before editing these

- **Setting `datasetKey` in `chrome.storage.sync` does not switch the
  dataset.** The worker caches the parsed vocabulary and rebuilds it only via
  the `setDataset` message / `loadVocabulary()`, which is the path the popup
  and options page use. Write the key *and* call `loadVocabulary()`, or the
  test silently runs against the default SAT set.

- **A `fetch` stub must only intercept `generativelanguage.googleapis.com`.**
  The worker also `fetch()`es the bundled dataset CSVs through
  `chrome.runtime.getURL`. A blanket stub swallows those too, leaving an empty
  vocabulary, zero replacements, and assertions that pass vacuously because
  there is nothing on the page to be wrong about.
