// Builds src/data/wordLevels.ts - the word -> SAT/C1/C2 index the deck Library
// filters on.
//
// The level never reaches Firestore. The extension knows which dataset a word
// came from at save time (content.js sets dataset.currentLevel on the tooltip),
// but handleSave drops it, and lib/sync.js writes a fixed payload of
// word/vietnamese/definition/example/pos/status. Adding the field there would
// only ever label words saved *after* that release - every word already in a
// user's deck would stay blank forever - and in "All" mode the extension's tag
// is literally 'ALL', which firestore.rules rejects.
//
// So the level is resolved on the web side instead, by joining the deck word
// against the same CSVs the extension ships. That labels existing decks
// retroactively and needs no extension release. Words a user imported from
// their own CSV are simply absent here, which is correct - we do not know their
// level.
//
// Output is committed. The CSVs are hand-maintained with no build step of their
// own, so this runs by hand when they change rather than on every build.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = join(ROOT, 'merid-extension-final')
const TARGET = join(ROOT, 'src', 'data', 'wordLevels.ts')

/** Dataset tag -> CSV, matching DATASET_REGISTRY in the extension's
 *  lib/vocab-core.js. B2 is declared in the Dataset union but has no CSV yet. */
const DATASETS = [
  ['SAT', 'dataset-SAT.csv'],
  ['C1', 'dataset-C1.csv'],
  ['C2', 'dataset-C2.csv'],
]

function fail(message) {
  console.error(`\x1b[31mgen-word-levels: ${message}\x1b[0m`)
  process.exit(1)
}

/** Same shape the extension gives a word before it becomes a Firestore doc id
 *  (normalizeWord in lib/sync.js): NFC, lowercased, whitespace collapsed. The
 *  join against DeckWord.word is only exact because both sides do this. */
function normalizeWord(word) {
  return word.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Fifteen headwords across the three files are not single words but variant
 *  spellings - "largess/largesse", "nevertheless or nonetheless". Saving from
 *  the extension stores whichever form the page used, so every variant has to
 *  be indexed or those words silently lose their level. Multi-word entries
 *  ("per se", "status quo") and diacritics ("facade" vs "facade") are left
 *  alone - they are real headwords, not variants. */
function variantsOf(headword) {
  return headword
    .split(/\s+or\s+|\//)
    .map(normalizeWord)
    .filter(Boolean)
}

const index = new Map()
const counts = []

for (const [tag, file] of DATASETS) {
  const path = join(SOURCE_DIR, file)
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    fail(`cannot read ${path}`)
  }

  const rows = text.split('\n').slice(1) // drop the header
  let added = 0

  for (const row of rows) {
    if (!row.trim()) continue
    // The headword is column 1 and never contains a comma or a quote in any of
    // the three files, so the first comma is a safe field boundary - no need to
    // pull in a CSV parser for one column.
    const comma = row.indexOf(',')
    const headword = comma === -1 ? row : row.slice(0, comma)

    for (const word of variantsOf(headword)) {
      const tags = index.get(word)
      if (tags) {
        if (!tags.includes(tag)) tags.push(tag)
      } else {
        index.set(word, [tag])
      }
      added++
    }
  }

  if (!added) fail(`${file} yielded no headwords - has its format changed?`)
  counts.push(`${tag} ${added}`)
}

// Grouped by tag rather than written as a word -> tags object: three long
// delimited strings are the smallest form that still gzips well, and the
// runtime rebuilds the Sets it actually looks words up in.
//
// The delimiter is '|', not a space: a dozen headwords are phrases ("per se",
// "status quo"), and splitting those on a space would index "per" and "se" as
// separate words while losing the phrase itself.
const DELIMITER = '|'
const lines = []
for (const [tag] of DATASETS) {
  const words = [...index]
    .filter(([, tags]) => tags.includes(tag))
    .map(([word]) => word)
    .sort()
  if (words.some((word) => word.includes(DELIMITER))) {
    fail(`a headword contains ${DELIMITER}, which is the index delimiter`)
  }
  lines.push(`const ${tag} =\n  '${words.join(DELIMITER)}'`)
}

const output = `// GENERATED FILE - do not edit by hand.
// Regenerate with: node scripts/gen-word-levels.mjs
//
// Word -> dataset index built from the extension's dataset-{SAT,C1,C2}.csv, so
// the deck Library can filter by level even though Firestore never stores one.
// See scripts/gen-word-levels.mjs for why the level is resolved here instead of
// at save time.
//
// \`import type\` is deliberate: the Dataset union is shared with the demo
// vocabulary, but pulling in its runtime value would drag VOCAB into this chunk.
import type { Dataset } from './vocab'

${lines.join('\n\n')}

/** Only the three that have a CSV. 'B2' exists in the Dataset union but ships
 *  no dataset yet, so it would filter to an empty grid. */
export const LEVELS: readonly Dataset[] = ['SAT', 'C1', 'C2']

const SETS: readonly (readonly [Dataset, ReadonlySet<string>])[] = [
  ['SAT', new Set(SAT.split('${DELIMITER}'))],
  ['C1', new Set(C1.split('${DELIMITER}'))],
  ['C2', new Set(C2.split('${DELIMITER}'))],
]

/** Datasets a word appears in - 520 headwords are in more than one, so this is
 *  a list, not a single level. Empty for anything saved from a user's own CSV,
 *  which we have no way to label. \`word\` is matched as Firestore stores it
 *  (NFC, lowercase, whitespace collapsed). */
export function levelsFor(word: string): Dataset[] {
  const key = word.normalize('NFC').toLowerCase().replace(/\\s+/g, ' ').trim()
  const found: Dataset[] = []
  for (const [tag, words] of SETS) if (words.has(key)) found.push(tag)
  return found
}
`

writeFileSync(TARGET, output, 'utf8')

const bytes = Buffer.byteLength(output, 'utf8')
console.log(
  `\x1b[32mgen-word-levels\x1b[0m ${index.size} headwords -> src/data/wordLevels.ts ` +
    `\x1b[2m(${counts.join(', ')}; ${(bytes / 1024).toFixed(1)} kB)\x1b[0m`,
)
