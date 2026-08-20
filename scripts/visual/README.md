# Visual vocabulary — the picture pipeline

Turns the three vocabulary CSVs into the artwork the extension ships:

```
merid-extension-final/vis/<slug>.avif       the pictures
merid-extension-final/visual-index.json     which entry has one, and which
                                            concept the rest are drawn as
merid-extension-final/vis/CREDITS.json      where each picture came from
```

Run by hand when the CSVs change, not on every build — the same policy as
`scripts/gen-word-levels.mjs`, and for the same reason: the datasets are
hand-maintained and have no build step of their own.

**The extension works without any of this.** Every entry that has no picture
wears a concept glyph, so an empty `vis/` is a complete product, not a broken
one. This pipeline decides how much of it is photographs.

A step-by-step walkthrough in Vietnamese, aimed at whoever is running this
rather than maintaining it, is in `docs/HUONG-DAN-ANH-TU-VUNG.md`.

## What you need

| | Where | Used by |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com/apikey — must start `AIzaSy` | 01, 02, 02b |
| `PEXELS_API_KEY` | pexels.com/api — free, 200 req/hour | 03 |
| `OPENVERSE_TOKEN` | api.openverse.org/v1/auth_tokens/register — optional, raises the rate limit | 03 |

Wikimedia needs no key. All three sources are free; nothing here costs money.

`GEMINI_API_KEYS` (plural, comma-separated) also works and is what
`api/_lib/gemini.js` reads natively — use it if you have several keys to spread
the daily allowance across.

**The model is not chosen here.** Stages 01, 02 and 02b go through
`api/_lib/gemini.js`, which asks each key which models it can actually call and
ranks them, preferring `flash-lite`. Two reasons that matters:

- Google retires model names continuously. An earlier version of this pipeline
  pinned `gemini-2.0-flash` and got a plain 404 on a working key.
- On the free tier `flash-lite` carries roughly 500 requests a day against 20
  for full Flash. A whole run of the three model stages is about **131
  requests** — comfortable on the first, a week's work on the second.

```bash
npm i -D sharp                              # stage 06
pip install open_clip_torch pillow torch    # stage 04, ~2GB
```

## Trying it on ten words first

```bash
node scripts/visual/try.mjs              # a deliberately hard default set
node scripts/visual/try.mjs anchor monk  # words you choose
node scripts/visual/try.mjs --review     # and open the review UI afterwards
```

Runs the whole chain on one small set of words and prints what each stage
decided about each of them: how it was classified and by what, what was
searched for, what the pictures were scored against, and the scores.

Each stage's own `--limit` cannot do this. 01 limits the entries it asks the
model about, 02 limits the concrete ones, 03 limits the searchable ones - so
`--limit 10` three times gives three different tens whose overlap can be empty.

Working files go to `state/trial/`; a real run's state is never touched.

The default words are chosen to be hard rather than typical. Half are verbs with
a physical sense and an abstract meaning - `skirt`, `table`, `eclipse` - which is
the case that has gone wrong before.

## Running it

```bash
export GEMINI_API_KEY=... PEXELS_API_KEY=...

node scripts/visual/01-classify.mjs     # which entries can be photographed
node scripts/visual/02-query.mjs        # what to search for, and what to avoid
node scripts/visual/02b-iconmap.mjs     # a concept for everything else
node scripts/visual/03-fetch.mjs        # collect candidates — run overnight
python3 scripts/visual/04-rank.py       # score them — 15-25 min on CPU
node scripts/visual/05-review.mjs       # you look at them — about an hour
npm i -D sharp && node scripts/visual/06-build.mjs

cd merid-extension-final && npm test && npm run build && node e2e/visual.mjs
```

Every stage writes to `scripts/visual/state/` and resumes: stopping halfway
costs nothing, and re-running a stage after editing a later one re-uses the
answers it already has. Model answers are cached by prompt hash, so a re-run
spends no quota on questions already asked.

Add `--limit N` to try a stage on a handful of entries first.

`--offline` shows what a stage would do without spending anything. It does not
produce data: with nothing asked, stage 02 writes no queries and everything
after it has no work. It is for inspection, not for running the pipeline
without a key — and each stage now says so and exits non-zero rather than
letting the emptiness travel three commands downstream.

## What each stage is for

**01 — classify.** Which entries a photograph could honestly mean. Uses the
Brysbaert et al. (2014) concreteness norms first, which cover about three
quarters of the vocabulary instantly and for free, and asks the model only
where a norm cannot answer. The 437 headwords carrying more than one sense
skip the norms entirely: a norm scores a word FORM, and cannot separate
`delegate` the act from `delegate` the person.

**02 — query.** Builds a search query out of the definition and example rather
than the headword, because the headword is what is ambiguous. Also produces
`negative` — the other senses the spelling could bring back. Those strings are
what makes stage 04 able to discriminate rather than merely threshold.

**02b — iconmap.** Assigns every other entry one of the 56 concepts that have a
glyph in `lib/visual.js`. The list is closed; an answer outside it is dropped
here, and `test/visual-index.test.js` fails the build if one ever reaches the
index.

**03 — fetch.** Six candidates an entry from Openverse (CC0/PDM), Wikimedia
Commons (PD/CC0 only, read from each file's own licence metadata) and Pexels.
All three permit redistribution, which is the requirement — these files end up
inside the package. Unsplash is deliberately absent: its API terms require
hotlinking and forbid redistributing the files.

**04 — rank.** CLIP scores each candidate against "a photo of {word},
{definition}" and against the distractors from stage 02. A candidate has to
clear a floor *and* beat its best distractor by a margin. The margin is the
part that matters: a photograph of a coiled spring scores respectably against
any sentence containing "spring", and is only obviously wrong once something
notices it scores better against "metal coil".

**05 — review.** You look at the top three for each entry and press a key. Only
entries where stage 04 found something above the bar, best first; the rest take
a symbol without asking. `--all` overrides that.
Ordered by score ascending, so the doubtful ones come first; stop whenever you
like and the rest take glyphs. `state/decisions.json` is the one file here that
is committed — it is the only thing in the pipeline that cannot be recomputed.

**06 — build.** Encodes to 320×160, 2:1 to match `.vm-visual` in `content.css`,
smart-cropped. Reports any picture used for two different words, which means at
least one of them is wrong. Measures AVIF against WebP on a sample of your
actual pictures and says which is smaller before encoding the rest.

There is no stage 07. Verification lives in
`merid-extension-final/test/visual-index.test.js`, which runs under `npm test`
and therefore in CI — a check that has to be remembered is not a check.

## Testing without the network

`scripts/visual/test/` holds stand-ins for the model and the three archives.
They answer in the real response shapes, so the parsers, the licence filter,
the rate-limit handling and the resume logic all run for real:

```bash
node --import ./scripts/visual/test/fake-gemini.mjs scripts/visual/02-query.mjs
python3 scripts/visual/04-rank.py --pretrained none   # architecture, random weights
```

The answers are invented; the plumbing is not.

## Data credit

Concreteness ratings: Brysbaert, M., Warriner, A.B., & Kuperman, V. (2014).
*Concreteness ratings for 40 thousand generally known English word lemmas.*
Behavior Research Methods, 46, 904-911. Downloaded on first run into
`state/` and not vendored into the repository.
