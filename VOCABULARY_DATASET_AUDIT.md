# Merid Vocabulary Dataset Audit

**Date:** 2026-07-17
**Scope:** SAT, CEFR C1, CEFR C2 vocabulary datasets and the combined ("All") mode.
**Auditor:** Automated + manual review pass (see *Remaining limitations* for coverage caveats).

---

## 1. Repository overview

### Dataset files found

| Path | Role | Entries (after audit) |
| --- | --- | --- |
| `merid-extension-final/dataset-SAT.csv` | **Source of truth** (canonical extension) | 989 |
| `merid-extension-final/dataset-C1.csv` | **Source of truth** (canonical extension) | 1380 |
| `merid-extension-final/dataset-C2.csv` | **Source of truth** (canonical extension) | 978 |
| `merid-extension/dataset-SAT.csv` | Duplicate copy (older/reverted extension build) | 989 |
| `merid-extension/dataset-C1.csv` | Duplicate copy | 1380 |
| `merid-extension/dataset-C2.csv` | Duplicate copy | 978 |
| `src/data/vocab.ts` | **Separate** hand-curated demo vocab for the marketing website's live demo | 17 |

**Total shipped vocabulary entries audited: 3,347** (989 + 1,380 + 978), present identically in both extension directories.

### Source-of-truth vs generated files

- The three `dataset-*.csv` files are **hand-maintained source-of-truth** files. Git history shows they were added by direct upload ("Add files via upload"), and there is **no generation or merge script** in the repo.
- There is **no physical "combined" dataset file.** The **"All" mode is assembled at runtime**: `lib/vocab-core.js` → `DATASET_REGISTRY.all` lists `['dataset-SAT.csv','dataset-C1.csv','dataset-C2.csv']`, which the content script fetches and concatenates. Because the combined set is never persisted, there is nothing to "regenerate" — it is deterministic from the three sources by construction.
- `merid-extension/` and `merid-extension-final/` are **two copies of the extension.** Commit `ad6a15b` ("Move AI context check to merid-extension-final, revert merid-extension") establishes **`merid-extension-final` as the active/canonical copy.** The two copies' **datasets are byte-identical**, but their code has diverged (see §Technical validation → *Code drift*).

### Relevant scripts

| Script | Purpose |
| --- | --- |
| `lib/vocab-core.js` | CSV parsing (`parseCSV`, `splitCsvLine`), entry normalization (`normalizeEntry` → `id = "<TAG>:<word>"`), `buildVocabMap` (matching index), settings model. Pure/DOM-free, shared by content script and tests. |
| `scripts/build.js` | Copies shippable files (incl. any `dataset-*.csv`) into `dist/` and zips. Dynamic dataset globbing means a future `dataset-B2.csv` ships automatically. |
| `scripts/lint.js` | Node `--check` syntax lint of the JS files. |
| `scripts/validate-datasets.js` | **New in this audit** — structural/mechanical dataset validator (see §11). |
| `test/vocab-core.test.js` | 21 unit tests for the core helpers. |

### How the extension consumes the data

1. `content.js` fetches the active dataset CSV(s) and runs them through `parseCSV` → `validateEntry` → `normalizeEntry`.
2. `buildVocabMap(activeVocab, modes)` builds a `Map<matchKey, VocabularyEntry[]>`:
   - **`vieEng`** (Vietnamese→English): indexes the comma-split `vietnamese` terms. **In the canonical `merid-extension-final`, only multi-word Vietnamese phrases are indexed** (`if (normalizeKey(s).includes(' '))`) — single syllables are deliberately excluded as "too ambiguous."
   - **`engEng`** (English synonym→headword): indexes the comma-split `synonyms` of every entry (single words included).
3. `findMatch` greedily matches windows of 3→2→1 tokens; `gateByFrequency` deterministically thins replacements; per-page / per-post caps apply.
4. **"I know this"** and **"Save to Deck"** are keyed by **lowercased headword string**, *not* by `id` (see §Duplicate report for why this matters).

---

## 2. Audit coverage

| Dataset | Total | Manually reviewed | Auto-validated | Confirmed correct* | Corrected | Flagged for review | Removed | Added | Exact dups | Near/morph dups | Cross-dataset overlaps | Unverifiable classifications |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SAT | 989 | 989 (structural) | 989 | see note | 6 records / 13 fields | 4 | 0 | 0 | 0 | 0 | 494 (with C1/C2) | judgment-based (see §4) |
| C1 | 1380 | 1380 (structural) | 1380 | see note | 1 | 8 | 0 | 0 | 0 | 87 multi-POS (intentional) | 47 (with C2) + SAT | 47 C1/C2 |
| C2 | 978 | 978 (structural) | 978 | see note | 7 | 3 | 1 | 0 | 1 (`laudable`) | 0 | 47 (with C1) + SAT | 47 C1/C2 |

\* **"Confirmed correct" is not asserted per-entry.** Every entry was passed through the automated validator (100% coverage) and every entry the validator or a targeted semantic scan *flagged* was manually reviewed. A full, citation-backed semantic verification of all 3,347 definitions/translations/synonyms/CEFR levels was **not** performed — see *Remaining limitations*. The validator is provided so this review can continue incrementally.

---

## 3. Issue log

| Dataset | Entry | Field | Original value | Corrected value | Issue | Evidence | Confidence | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SAT | battery, buffet, canvas, compound, implement, resolve | vietnamese (whole record) | quoted field contained a **newline** separating senses | newline collapsed to `", "` | The shipped `parseCSV` splits on `\n` *before* honoring quotes, so each multi-line record shattered into corrupt rows (e.g. `battery` lost its synonyms/antonyms; a phantom `hành hung,…` headword row was created). | Reproduced with the actual parser: SAT parsed to 996 rows vs 989 true records. | High | **Fixed** (both dirs) |
| SAT | innocuous | synonyms | `harmless, benign, innocuous` | `harmless, benign` | Headword listed as its own synonym. | Self-reference; validator `self-syn`. | High | **Fixed** |
| SAT | adhere | type | `noun` | `verb` | Definition "to stick to something / to follow devoutly" is a verb; *adhere* is only ever a verb. | Cambridge/Oxford: *adhere* = verb. | High | **Fixed** |
| SAT | acumen, acute, adamant, adept, adhere, extricate, exult, fabricate, façade, facile | phon_br, phon_n_am | bare IPA e.g. `əˈkjuːmən` | `/əˈkjuːmən/` | Missing the `/…/` delimiters every other entry uses. | Dataset-internal consistency (formatting only; symbols unchanged). | High | **Fixed** |
| C1 | recount → **recording** | word, type, phon_br, phon_n_am | `recount,verb,c1,,,…` | `recording,noun,c1,/rɪˈkɔːdɪŋ/,/rɪˈkɔːrdɪŋ/,…` | Headword said "recount" but **every other field describes "recording"** (def "sound or pictures that have been recorded…", example "an audio recording", VN "Bản ghi", synonyms footage/archive). It caused a wrong replacement (VN "bản ghi" → showed "recount"). IPA was also empty. | Internal evidence overwhelming; no separate `recording` entry exists. IPA is the standard dictionary transcription. | High (direction of fix inferred) | **Fixed** — headword aligned to content; report notes the inference |
| C2 | hoodwink, hotly, husband, iconoclast, idolatry | phon_br, phon_n_am | bare IPA | slashed IPA | Same missing `/…/` as above. | Dataset consistency. | High | **Fixed** |
| C2 | largess/largesse | type | *(empty)* | `noun` | Part of speech missing; *largesse* is unambiguously a noun. | Cambridge/Oxford. | High | **Fixed** |
| C2 | laudable | (row 744) | duplicate of row 273 | removed row 744 | Same headword+POS+definition+example appearing twice (C2 is two concatenated A–Z runs; `laudable` was in both). | Validator `dup-in-dataset` (same word + POS). | High | **Removed** duplicate |

### Flagged, **not** auto-edited (see §Remaining limitations / §Vietnamese report)

| Dataset | Entry | Field | Issue | Confidence | Action |
| --- | --- | --- | --- | --- | --- |
| C1 | constitutional, contrary (adj), deprive, film-maker, hydrogen, sake | definition + example | **Both blank.** Learning card would show empty def/example. Not fabricated. | High (issue) | **Human review** |
| C2 | largess/largesse | example | Blank example. Slash headword ("largess/largesse") also displays literally on replacement. | High | **Human review** |
| SAT | audacious | example | Example ("…offer him a bribe.") does not contain the word or an inflection. | High | **Human review** |
| SAT | fraught | example | "Example" is a usage note: `usually used with "with"`. | High | **Human review** |
| C1 | saint | example | Weak/degenerate example: "St John" (word only present as abbreviation). | Medium | **Human review** |
| SAT | prescient | definition | Adjective defined with a verb phrase ("to have foreknowledge of events"). | Medium | **Human review** |
| SAT | renunciation | definition | Noun defined with a verb phrase ("to reject"). | Medium | **Human review** |

---

## 4. Classification review

> **Caveat on authority.** The SAT has *no* single official College Board word list, and CEFR level depends on sense/POS. Nothing below is asserted as "official." Levels marked *Reasonable but not independently confirmed* were **not** each checked against the English Vocabulary Profile / Cambridge in this pass.

### SAT membership issues
- SAT is a classic advanced-academic word list (abase, abate, abdicate, …). The list is internally consistent in register. No word was removed for being "too basic," but many SAT words also legitimately sit at C1/C2 (494 SAT headwords overlap C1 and/or C2 — expected, not an error).
- `battery`, `buffet`, `canvas`, `compound`, `implement`, `resolve`, `adhere` carried the structural/POS defects fixed above.
- **Judgment-based, not confirmed:** whether every SAT word belongs on a test-prep list is inherently subjective; these are **not** flagged as errors.

### C1 classification issues
- 87 headwords appear twice in C1 as **distinct parts of speech** (noun+verb etc.) — intentional multi-sense entries, **not** errors (see §Duplicate report).
- 6 C1 entries are structurally incomplete (blank def+example) — flagged above.

### C2 classification issues
- C2 is physically **two concatenated A–Z runs** (the alphabet restarts at row ~492). This is why `laudable` was duplicated. No other within-C2 duplicate exists.

### C1 / C2 conflicts (same word in both levels)
**47 headwords appear in both C1 and C2.** Of these, **36 share the same POS and essentially the same sense** — a genuine level conflict (a single sense should map to one CEFR band). These require a human decision (keep in one band, or record dual membership). Same-POS/same-sense conflicts:

`adhere, adverse, aesthetic, articulate, buffer, bureaucracy, concede, confer, consolidate, credibility, cynical, deem, elevate, empirical, explicit, facilitate, faction, hierarchy, imminent, inherent, landmark, manifest, net, partial, profound, pronounced, prospective, render, respectively, sanction, secular, solidarity, spectrum, stark, timely, undermine, unprecedented, viable`

Sense/POS-differentiated (defensible as separate senses, lower priority): `advocate, albeit, divine, liberal, log, novel, patent, sound`.

### Words with sense-dependent levels
- `sound`, `net`, `patent`, `divine`, `log`, `advocate`, `liberal`, `novel` — the C1 and C2 rows describe **different senses/POS**, so their level difference is defensible per-sense.

### Entries whose classification could not be confirmed
- All CEFR labels are **structurally valid** (every C1 row = `c1`, every C2 row = `c2`; verified by the validator). Whether each label is **correct per the English Vocabulary Profile was not independently verified for all 3,347 entries** — treat unconfirmed levels as *Reasonable but not independently confirmed*.

**Labels used above:** *Confirmed* (structural facts, dup/POS fixes) · *Reasonable but not independently confirmed* (most CEFR bands) · *Incorrect* (recount→recording; adhere POS) · *Ambiguous* (47 C1/C2 conflicts) · *Requires human review* (flagged table).

---

## 5. Duplicate report

- **Exact duplicates:** 1 — `laudable` in C2 (removed).
- **Near duplicates (same word, same POS, differing only cosmetically):** the two `laudable` rows differed only in capitalization and one antonym; treated as exact for removal.
- **Morphological duplicates (singular/plural, inflection, hyphenation, spelling variant):** none found *within* a dataset. Several entries intentionally encode variants in one headword (`stoic/stoical`, `satiate/sate`, `machination/machinations`, `nevertheless or nonetheless`, `largess/largesse`) — see Vietnamese/technical notes.
- **Multi-POS same-word entries (C1):** **87** headwords have 2–3 rows differing by POS (e.g. `abuse` noun+verb, `alert` adj+noun+verb). **These are intentional and were kept.** They **share an `id`** (`C1:<word>`), but this is **runtime-harmless**: `content.js` keys "I know this"/"Save to Deck" by **lowercased headword**, not `id`, and `id` is otherwise unused in the content script. Recommendation (optional, low priority): if per-sense state is ever needed, disambiguate `id` (e.g. append POS) — but this touches persisted deck/known-word storage, so it needs a migration and was **not** changed.
- **Cross-dataset overlaps:** **520** headwords appear in more than one dataset. SAT∩C1/C2 overlaps are expected (advanced words). The **47 C1∩C2** overlaps are the real concern (§4). **No cross-dataset entries were deleted** — the datasets are independently selectable modes, and the "All" map already de-dupes per match-key by headword at build time (`!arr.some(e => e.word === item.word)`), so overlaps do **not** cause double replacements.
- **Conflicting duplicate entries:** the 47 C1/C2 pairs carry different definitions/synonyms per copy; in "All" mode the first-loaded (C1) copy wins the shared key, making the C2 variant's wording unreachable there. Documented; not auto-resolved.

---

## 6. Vietnamese matching report

**Key architectural fact (canonical `merid-extension-final`):** `buildVocabMap` **only indexes multi-word Vietnamese phrases** for `vieEng` matching. Single-syllable/single-word Vietnamese terms (the majority of the `vietnamese` column) are **never turned into match keys**, so most single-word false-positive risks below are **already mitigated in the shipping extension.**

- **High-risk single common words / function words** mapped to rare English words (would be dangerous *only if single-word matching were on*):
  - `forth → "Ra"`, `mere/solely → "Chỉ"`, `thread → "Chỉ"`, `behalf/sake → "vì"`, `inasmuch → "Vì"`, `midst → "trong"`, `accordance → "Theo"`, `conceive → "Lên"`, `offspring → "Con"`, `reside → "Ở"`, `whilst → "Khi"`.
  - **Live risk only in `merid-extension` (old parser, single-word matching active).** In `merid-extension-final` these are dormant. **Recommendation:** either (a) retire `merid-extension` to remove the drift, or (b) if single-word matching is ever re-enabled, prune these overly broad single-word VN terms.
- **Homograph conflicts** (one Vietnamese key → multiple unrelated English words): `bò` → `cattle` *and* `crawl`; `chỉ` → `mere`/`solely`/`thread`. Only relevant when the single word is indexed; harmless for multi-word matching.
- **Grammatically incompatible replacements:** the single-word cases above cross POS (preposition/particle → noun/verb). Mitigated by the multi-word rule.
- **Accent correctness:** Vietnamese diacritics were spot-checked in the flagged rows and looked correct; `stripDiacritics` is used only as a non-primary fuzzy fallback, so accent-insensitive matching does **not** drive primary replacement.
- **Overly broad matching terms / recommended human-review entries:** the 11 single-word function-word mappings listed above, plus any future single-word VN terms, should be reviewed before enabling single-word matching anywhere.

---

## 7. Technical validation report

### Schema
- Two schemas, both validated 100%:
  - SAT: `word,type,phon_br,phon_n_am,definition,example,vietnamese,synonyms,antonyms`
  - C1/C2: `word,type,cefr,phon_br,phon_n_am,definition,example,vietnamese,synonyms,antonyms`
- Headers, field counts, CEFR label values, and required fields (`word`, `vietnamese`) now pass with **0 errors**.

### Parsing issues (fixed)
- **Embedded-newline corruption** in 6 SAT records (the single most serious defect) — fixed. A new validator check (`embedded-newline`) now fails the build if any quoted field spans physical lines, because the shipped `parseCSV` cannot handle it.
- IPA delimiter inconsistency (15 entries) — fixed.

### Remaining non-fatal observations
- **CRLF line endings** and **no trailing newline** on all three files (info only; `parseCSV` tolerates both).
- **Trailing spaces inside some quoted fields** (e.g. C1 `detection` definition) — cosmetic; `splitCsvLine` trims on read, so runtime is unaffected. Left as-is to keep diffs minimal.
- **Sorting:** SAT/C1 are alphabetical; **C2 is two concatenated A–Z runs** (intentional-looking merge). Not an error, but noted.

### Merge-script issues
- None — there is no merge/generation script; "All" is a runtime concatenation.

### Code drift (important)
- `merid-extension/lib/vocab-core.js` (old) vs `merid-extension-final/lib/vocab-core.js` (canonical) **differ**: the canonical `buildVocabMap` restricts `vieEng` to multi-word phrases; the old one does not. **Same data, different matching behavior.** Recommend consolidating to one extension directory.

### Build / test results
- `npm test` → **21/21 pass** · `npm run lint` → **all files pass** · `npm run build` → **23 files copied, dist.zip created** (artifacts cleaned, git-ignored).
- `node scripts/validate-datasets.js` → **0 ERRORS**, 45 warnings, 780 info (overlaps/multi-POS/CRLF/etc., all reviewed).
- **All-mode load smoke test:** all three CSVs load → **3,347 active entries, 0 dropped** by `validateEntry`; `buildVocabMap` and `findMatch` run without error.

---

## 8. Change log

All edits were applied **identically to both `merid-extension-final/` and `merid-extension/`** so the two copies stay in sync.

| File(s) | What changed | Why | Type | Verified by | Downstream regen |
| --- | --- | --- | --- | --- | --- |
| `dataset-SAT.csv` | 6 multi-line records collapsed to single lines (in-quote `\n` → `", "`) | Removed 7 phantom/corrupt rows; restored lost synonyms/antonyms | Structural | validator (996→989 rows; 0 field-count errors), All-mode smoke test | N/A (source file) |
| `dataset-SAT.csv` | `innocuous` self-synonym removed; `adhere` POS noun→verb; 10 IPA fields slashed | Correctness + formatting consistency | Factual/formatting | validator, `git diff` review | N/A |
| `dataset-C1.csv` | `recount`→`recording` headword + empty IPA filled | Headword/content mismatch causing wrong replacement | Factual | `git diff`, alphabetical order preserved | N/A |
| `dataset-C2.csv` | 5 IPA fields slashed; `largess/largesse` POS→noun; `laudable` duplicate row removed | Formatting + correctness + de-dup | Factual/formatting/structural | validator (979→978, 0 dup errors) | N/A |
| `merid-extension-final/scripts/validate-datasets.js` | **New** structural validator | Automated, repeatable dataset checks (§11) | New tooling | runs clean; `node --check` passes via lint discovery | N/A |

*No generated files exist, so nothing was regenerated; the "All" set is reproduced deterministically at runtime from the three sources.*

---

## 9. Remaining limitations

- **Semantic per-entry verification is incomplete.** 100% of entries were structurally validated and every flagged entry was manually reviewed, but a citation-backed check of **every** definition, Vietnamese gloss, synonym/antonym set, IPA, and CEFR band across all 3,347 entries was **not** performed in this pass. The provided validator + issue log are designed to make that review incremental and repeatable.
- **CEFR bands are mostly unconfirmed.** Only structural validity (label matches file) is guaranteed. The 47 C1/C2 same-sense conflicts specifically need a linguist/teacher to resolve against the English Vocabulary Profile.
- **SAT membership is judgment-based** by nature (no official list). No SAT words were added/removed on membership grounds.
- **`recount→recording` fix infers curator intent** from overwhelming internal evidence; a human should confirm no separate "recount" entry was intended.
- **Flagged content gaps** (blank definitions/examples, weak examples, verb-phrased adjective/noun definitions) were **not fabricated** — they await human authoring.
- **Vietnamese naturalness/accent correctness** was spot-checked, not exhaustively verified by a native speaker.
- **Live UI features not exercised:** highlight/replace/beside rendering, learning-card display, deck sync, and the AI context check run in a browser/extension context that cannot be launched here; they were validated only via the pure-logic layer (parser, map builder, matcher) and the unit tests.

---

## 10. How to run the validator

```bash
cd merid-extension-final
node scripts/validate-datasets.js            # validate this dir's CSVs (human-readable)
node scripts/validate-datasets.js --verbose  # also list every WARN/INFO
node scripts/validate-datasets.js --json      # machine-readable
node scripts/validate-datasets.js --dir ../merid-extension   # validate the other copy
```
Exit code is non-zero if any **ERROR**-level problem exists (safe to wire into CI). Checks: header/schema, field counts, **embedded-newline corruption**, required/empty fields, POS validity, CEFR label, IPA delimiters, self/duplicate synonyms & antonyms, synonym∧antonym overlap, duplicate Vietnamese terms, broad single-word Vietnamese terms, example-contains-headword, true (same-POS) duplicates vs intentional multi-POS entries, cross-dataset overlaps & POS conflicts, sorting, control/zero-width unicode.
