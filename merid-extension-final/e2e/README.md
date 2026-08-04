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
node e2e/visibility.mjs       # badge, popup panels, card marker, learned-about-you
node e2e/resilience.mjs       # model fallback on 429, review resurfacing, level advice
node e2e/hosted.mjs           # Merid-hosted AI: identity, quota, personal-key priority
```

Set `CHROMIUM_PATH` if your Chromium is not at `/opt/pw-browsers/chromium`.
Each script prints a pass/fail list and exits non-zero on failure.

## Traps worth knowing before editing these

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

- **Feedback is batched, not immediate.** The content script queues interaction
  events and flushes after 4s (explicit ratings flush at once). A test that
  closes the tab sooner is relying on the `pagehide` flush winning a race
  against teardown - it usually loses. Wait out the timer with the page open.

- **The worker cannot `sendMessage` to itself.** `chrome.runtime.sendMessage`
  never invokes the sender's own listener, so a check driven from
  `sw.evaluate` gets no reply at all. Drive message-based assertions from an
  extension page (the popup or options page) instead.
