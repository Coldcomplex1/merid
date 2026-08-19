// Builds public/datasets/*.json - the full vocabulary the deck's Explore tab
// browses.
//
// The three dataset-*.csv files ship inside the extension bundle, where the
// service worker fetches them with chrome.runtime.getURL(). Nothing under
// merid-extension-final/ is served by Vite, so the website could never read
// them; until now its only word data was the 17-entry marketing demo in
// src/data/vocab.ts and the headword-only index in src/data/wordLevels.ts.
//
// This emits the same rows as JSON into public/, which Vite copies to dist/
// verbatim. One file per dataset rather than one combined blob: Explore fetches
// only the set you open (124-162 kB gzipped each), and the "All" view is a
// runtime concatenation, exactly as DATASET_REGISTRY.all is in the extension's
// lib/vocab-core.js. Nothing lands in the app bundle either way.
//
// Output is committed, like src/data/wordLevels.ts. The CSVs are hand-maintained
// with no build step of their own, so this runs by hand when they change rather
// than on every build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = join(ROOT, 'merid-extension-final')
const TARGET_DIR = join(ROOT, 'public', 'datasets')

/** Dataset tag -> CSV, in the order and with the labels DATASET_REGISTRY uses
 *  in the extension's lib/vocab-core.js. C1 leads because it is the extension's
 *  default dataset, and that registry's key order is its display order.
 *
 *  B2 is declared in the Dataset union but ships no CSV, so it is absent here
 *  and therefore absent from the manifest - see the note in src/data/wordLevels.ts. */
const DATASETS = [
  { id: 'c1', tag: 'C1', label: 'C1', file: 'dataset-C1.csv' },
  { id: 'c2', tag: 'C2', label: 'C2', file: 'dataset-C2.csv' },
  { id: 'sat', tag: 'SAT', label: 'SAT', file: 'dataset-SAT.csv' },
]

/** Every column the entries need. The C1/C2 schema also has a `cefr` column,
 *  which is not read: its value is `c1` in dataset-C1.csv and `c2` in
 *  dataset-C2.csv without exception, so it says nothing the file the row came
 *  from does not already say. Fields are read by header name, so the two
 *  schemas need no branch. */
const REQUIRED_COLUMNS = [
  'word', 'type', 'phon_br', 'phon_n_am',
  'definition', 'example', 'vietnamese', 'synonyms', 'antonyms',
]

function fail(message) {
  console.error(`\x1b[31mgen-datasets: ${message}\x1b[0m`)
  process.exit(1)
}

/** RFC-4180 reader, ported from parseCsvRecords in the extension's
 *  lib/vocab-core.js - the strict parser it uses for user uploads, not the
 *  newline-splitting parseCSV the content script uses on these bundled files.
 *
 *  No row in the three CSVs currently contains a quoted newline, but they did
 *  once (VOCABULARY_DATASET_AUDIT.md section 3 records the fix), and the loose
 *  parser shatters a record into corrupt rows when they do. Honouring quotes
 *  here means a regression fails loudly instead of shipping broken entries. */
function parseCsv(text) {
  const src = text.replace(/^﻿/, '')
  const records = []
  let field = ''
  let record = []
  let inQuotes = false

  const endField = () => { record.push(field); field = '' }
  const endRecord = () => {
    endField()
    if (record.some((f) => f.trim() !== '')) records.push(record)
    record = []
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { endField(); continue }
    if (ch === '\r' && src[i + 1] === '\n') continue // CRLF: the \n ends the record
    if (ch === '\n' || ch === '\r') { endRecord(); continue }
    field += ch
  }
  if (inQuotes) return null // unterminated quote
  endRecord() // the file may lack a trailing newline
  return records
}

/** The shape the extension gives a word before it becomes a Firestore doc id
 *  (normalizeWord in lib/sync.js), and the same one scripts/gen-word-levels.mjs
 *  uses: NFC, lowercased, whitespace collapsed. Explore joins its entries
 *  against DeckWord.word, which is only exact because both sides do this. */
function normalizeWord(word) {
  return word.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Fifteen headwords are variant spellings rather than single words -
 *  "largess/largesse", "nevertheless or nonetheless". gen-word-levels.mjs
 *  indexes every variant; here we only need the first, because it is the key a
 *  word is saved under. That also makes those entries savable at all:
 *  firestore.rules validWord() rejects a slash, so "largess/largesse" could
 *  never be a document id, while "largess" can. */
function primaryKeyOf(headword) {
  const first = headword.split(/\s+or\s+|\//)[0]
  return normalizeWord(first)
}

/** Split a comma-separated column into a trimmed list, dropping blanks. */
function listOf(value) {
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

mkdirSync(TARGET_DIR, { recursive: true })

const manifest = []
const summary = []

for (const { id, tag, label, file } of DATASETS) {
  const path = join(SOURCE_DIR, file)
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    fail(`cannot read ${path}`)
  }

  const records = parseCsv(text)
  if (!records) fail(`${file} has an unterminated double quote`)
  if (records.length < 2) fail(`${file} has no data rows`)

  const headers = records[0].map((h) => h.trim().toLowerCase())
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))
  if (missing.length) fail(`${file} is missing column(s): ${missing.join(', ')}`)

  const at = (row, column) => {
    const i = headers.indexOf(column)
    return i === -1 ? '' : (row[i] ?? '').trim()
  }

  const entries = []
  for (const row of records.slice(1)) {
    const word = at(row, 'word')
    if (!word) continue

    // Short keys: they repeat once per entry, and there are thousands. `k` is
    // emitted rather than recomputed in the browser so loading a dataset costs
    // no per-entry normalization.
    const entry = {
      w: word,
      k: primaryKeyOf(word),
      pos: at(row, 'type'),
      br: at(row, 'phon_br'),
      am: at(row, 'phon_n_am'),
      def: at(row, 'definition'),
      ex: at(row, 'example'),
      vi: at(row, 'vietnamese'),
      syn: listOf(at(row, 'synonyms')),
      ant: listOf(at(row, 'antonyms')),
    }
    if (!entry.k) continue
    entries.push(entry)
  }

  if (!entries.length) fail(`${file} yielded no entries - has its format changed?`)

  const json = JSON.stringify(entries)
  writeFileSync(join(TARGET_DIR, `${id}.json`), json, 'utf8')

  manifest.push({ id, tag, label, file: `${id}.json`, count: entries.length })
  summary.push(`${tag} ${entries.length} (${(Buffer.byteLength(json) / 1024).toFixed(0)} kB)`)
}

// No "all" entry: like DATASET_REGISTRY.all it has no file of its own, and the
// loader concatenates SAT -> C1 -> C2 at runtime. That order is load-bearing -
// duplicate headwords keep the first row, so reordering it silently changes
// which entry a shared word resolves to.
writeFileSync(
  join(TARGET_DIR, 'manifest.json'),
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), datasets: manifest }, null, 2) + '\n',
  'utf8',
)

const total = manifest.reduce((n, d) => n + d.count, 0)
console.log(
  `\x1b[32mgen-datasets\x1b[0m ${total} entries -> public/datasets/ \x1b[2m(${summary.join(', ')})\x1b[0m`,
)
