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

**The extension builds and ships without any of this**, and shows no picture on
any card while `visual-index.json` is absent - which is what 1.7.0 got wrong and
1.7.1 had to withdraw the feature over. The card draws what this pipeline names
and nothing where it names nothing, so a checkout with no `vis/` is the product
minus a feature rather than a broken one. But the feature IS the pictures: run
this at least once, even if only far enough for the symbols.

```bash
node scripts/visual/run.mjs               # all six stages, then build and push
node scripts/visual/run.mjs --no-photos   # 01, 02, 02b, 06 - symbols only,
                                          # GEMINI_API_KEY and nothing else
```

`run.mjs` checks every prerequisite before it runs anything, stops at the first
failure with the command that fixes it, commits `decisions.json` the moment the
reviewing ends, and hands off to `ship.mjs`. Each stage below still runs on its
own, and each still resumes.

A step-by-step walkthrough in Vietnamese, aimed at whoever is running this
rather than maintaining it, is in `docs/HUONG-DAN-ANH-TU-VUNG.md`.

## What you need

| | Where | Used by |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com/apikey — `AIzaSy...` or the newer `AQ.Ab...`, both work | 01, 02, 02b |
| `PEXELS_API_KEY` | pexels.com/api — free, 200 req/hour | 03 |
| `OPENVERSE_TOKEN` | api.openverse.org/v1/auth_tokens/register — optional, raises the rate limit | 03 |

Wikimedia needs no key. All three sources are free; nothing here costs money.

Those limits are budgets stage 03 keeps to, not trivia: Pexels' 200 an hour is
the reason `PEXELS_PER_MIN` is three and not a hundred and eighty. A source that
runs out is rested on its own and the run carries on without it — see `Budget`
in `03-fetch.mjs`, and `test/fetch-limits.mjs` for what that costs. Both rates
are overridable:

```bash
MERID_PEXELS_PER_HOUR=200 MERID_OPENVERSE_PER_MIN=60 node scripts/visual/03-fetch.mjs
```

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
node scripts/visual/05-review.mjs --sample 50   # you look at 50 — ten minutes
npm i -D sharp
node scripts/visual/06-build.mjs                # measures what those 50 proved
node scripts/visual/06-build.mjs --accept-above 0.284   # acts on it, using the
                                                # number the line above printed

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
entries where stage 04 found something above the bar; the rest are dropped
without asking, and `--all` overrides that.

Dropped does not mean "gets a concept". Stage 02b only assigns those to
abstract entries, and everything in this queue is concrete by construction -
stage 02 went looking for a photograph of it. The 56 concepts are abstractions
and not one of them is what `anchor` is about.

So a concrete word without a photograph gets one of three **kind** glyphs
instead - a box, a stride, a figure - from the `object`/`action`/`role` stage 02
already recorded in `queries.json`. It costs nothing and says far more than the
letter A. Only an entry stage 02 recorded no kind for falls through to nothing
at all - the card is drawn with no picture panel, because `visualFor` draws only
what the index names. Stage 06 prints the coverage that results, and
`test/visual-index.test.js` refuses a build under 90%; read the number before
settling on a cutoff, because a strict one turns photographs into boxes.

The three are in `GLYPH` but deliberately not in `ICON_IDS`, so the concept
mapper is never offered them - `kind-object` coming back for an abstract word
would be worse than any of the 56 and indistinguishable in the index from a
genuine fallback.

Least confident first, because that is where looking decides something. The cost
is that stopping early leaves the confident ones unreviewed - and unreviewed
means a symbol - so `--order best` is there for when you know you will not
finish. `state/decisions.json` is the one file here that is committed — it is
the only thing in the pipeline that cannot be recomputed. **Commit it when you
stop reviewing, not when the artwork is finished.** Stages 05 and 06 both say so
if it is not in git yet; everything else in `state/` is a cache a machine can
rebuild, and that file is an hour of somebody's attention.

`--sample 50` changes the job rather than shortening it. Reviewing every entry
means deciding every picture yourself. Reviewing fifty drawn evenly across the
score range means *measuring* how often stage 04's top candidate is the one a
person keeps, which is a fact about the other two hundred and forty as well.
The sample is spread across all five score bands on purpose: a sample taken off
either end can say how good that end is and nothing else.

**06 — build.** Encodes to 320×160, 2:1 to match `.vm-visual` in `content.css`,
smart-cropped. Reports any picture used for two different words, which means at
least one of them is wrong — `05-review.mjs --only craft,artisan` reopens just
that pair. Measures AVIF against WebP on a sample of your actual pictures and
says which is smaller before encoding the rest.

Each picture is encoded at the best quality that fits under the 9KB per-file
cap `scripts/build.js` enforces, starting at 45 and stepping down only for the
few busy photographs that need it. One that will not fit even at the bottom
gets no picture rather than one the build refuses — and `vis/` is swept of
files the new index no longer names, because `scripts/build.js` reads the
directory rather than the index, so a picture dropped here but left on disk
would fail the build it was dropped to save.

It also counts the words that end with neither a photograph nor a concept
symbol, whose cards are then drawn with no picture at all. Those are always
concrete words — stage 01 judged them photographable so stage 02b never gave
them a concept, and the 56 concepts are abstractions with nothing that fits
*anchor*. That count is the real price of a strict `--accept-above`, so it is
printed next to it, as the coverage percentage the extension's tests gate on.

It also reads the reviewing. Two tables: agreement per score band, which shows
whether the score predicts correctness at all, and agreement cumulative from the
top, which is the question `--accept-above` asks — take the first candidate for
everything at or above here, how often is it right? The figure it reports is the
low end of a 90% interval rather than the raw fraction, because nine out of ten
from a sample of ten is not ninety percent, and the entries it decides are ones
nobody will ever look at. A cutoff is recommended only where that low end holds
at 70%; below that a drawn symbol is the better answer, since a wrong photograph
on a vocabulary card does not merely fail to help, it teaches the wrong thing.
If agreement never climbs with the score, no cutoff is offered and no command is
printed to run by reflex.

`state/auto-accepted.json` lists what shipped on the strength of that statistic
rather than a person, so a later pass can go straight to it.

**ship.mjs** — the six commands between "the artwork is on my disk" and "the
artwork is on GitHub", as one. Discards the `package.json` edit that `npm i -D
sharp` leaves behind and that blocks every pull, pulls with `--no-edit` so no
editor opens, asks stage 06 what cutoff the reviewing supports rather than
making you copy the number out of the last run, builds at that cutoff, and
pushes only if `npm test` and `npm run build` both pass. It stops at the first
failure and says what to do about it.

It cannot fix the one thing that stops it arriving, though: if `npm i -D sharp`
has edited `package.json` and you have not pulled since, the pull that would
deliver this script is the pull that file blocks. Run
`git checkout -- package.json package-lock.json` by hand first, once.

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
node scripts/visual/test/agreement.mjs                # the sample → measure → accept loop
node scripts/visual/test/fetch-limits.mjs            # what stage 03 does when a source says 429
```

The answers are invented; the plumbing is not.

`agreement.mjs` is the one that matters most, because it covers the only part of
the pipeline with nothing to look at when it goes wrong. Every other stage fails
visibly — a missing file, an empty JSON, a photograph of the wrong thing on a
card. Stage 06's cutoff fails by printing a confident number. So the test starts
the real 05, answers its HTTP API the way a person's keystrokes would against a
planted truth, runs the real 06 and reads what it concluded — including the run
where the score predicts nothing and the right answer is to refuse to name a
cutoff at all.

It takes a few minutes and looks stalled while it runs: it calls stage 06 five
times and each call encodes a sample in AVIF at effort 9, which is about a
second a picture. That is stage 06 being itself, not the test hanging — the same
second a picture applies to a real run, so 350 pictures is six minutes.
`MERID_KEEP=1` leaves the fixture in `state/test-agreement/` to poke at.

## Data credit

Concreteness ratings: Brysbaert, M., Warriner, A.B., & Kuperman, V. (2014).
*Concreteness ratings for 40 thousand generally known English word lemmas.*
Behavior Research Methods, 46, 904-911. Downloaded on first run into
`state/` and not vendored into the repository.
