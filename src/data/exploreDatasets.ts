// Loader for the full vocabulary the deck's Explore tab browses.
//
// The entries are generated from the extension's dataset-*.csv into
// public/datasets/ by scripts/gen-datasets.mjs; see that file for why they are
// served as JSON rather than bundled. Nothing here is imported by the marketing
// pages - MyDeck pulls this module in only when Explore is opened, and each
// dataset is fetched only when its pill is picked (124-162 kB gzipped each).
import type { Dataset } from './vocab'
import { sanitizeVocabText, LIMITS } from '../lib/sanitize'

/** One dataset as the generated manifest describes it. */
export interface DatasetMeta {
  id: string
  tag: Dataset
  label: string
  file: string
  count: number
}

/** A vocabulary entry as Explore renders it.
 *
 *  Deliberately not VocabEntry from ./vocab: that type is shaped for the
 *  marketing demo (a `tier`, a one-word `vi` gloss, a single `pron`) and has
 *  nowhere to put two IPA variants or a CEFR band. */
export interface ExploreEntry {
  /** The headword as authored - "largess/largesse", "façade". What renders. */
  word: string
  /** Normalized lookup key: NFC, lowercase, first variant of a slash pair.
   *  Matches how Firestore keys a deck word, which is what lets an entry be
   *  joined against the user's deck and saved into it. */
  key: string
  pos: string
  /** British and North American IPA. Either may be empty. */
  phonBr: string
  phonAm: string
  definition: string
  example: string
  vietnamese: string
  synonyms: string[]
  antonyms: string[]
  /** Every dataset this headword appears in. One tag in a single-dataset view;
   *  in the All view a shared word carries all of them. */
  datasets: Dataset[]
}

/** The generated on-disk shape (short keys - they repeat 3,346 times). */
interface RawEntry {
  w: string
  k: string
  pos: string
  br: string
  am: string
  def: string
  ex: string
  vi: string
  syn: string[]
  ant: string[]
}

/** The id the combined view uses. Not a manifest entry - like
 *  DATASET_REGISTRY.all in the extension it has no file of its own. */
export const ALL_ID = 'all'

/** Load order for the All view, and it is load-bearing: duplicate headwords
 *  keep the *first* row, so this decides which wording a shared word shows.
 *  437 of the headwords appear in more than one dataset. Same order as
 *  DATASET_REGISTRY.all.files in the extension's lib/vocab-core.js. */
const ALL_ORDER = ['sat', 'c1', 'c2'] as const

// Caps for the fields sanitizeVocabText's LIMITS does not cover. These are
// display-only, so they are generous - they exist to bound a pathological
// value, not to match a schema.
const EXTRA_LIMITS = { phon: 64, term: 64 } as const
const MAX_TERMS = 12

/** Runtime shape-check + sanitization, the same treatment Firestore documents
 *  get in toDeckWord (A03). The JSON arrives over the network, so it is not
 *  trusted just for having been generated from a file in this repo. */
function toEntry(raw: unknown, tag: Dataset): ExploreEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Partial<RawEntry>
  const word = sanitizeVocabText(r.w, LIMITS.word)
  const key = sanitizeVocabText(r.k, LIMITS.word)
  if (!word || !key) return null

  const terms = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((v) => sanitizeVocabText(v, EXTRA_LIMITS.term))
          .filter(Boolean)
          .slice(0, MAX_TERMS)
      : []

  return {
    word,
    key,
    pos: sanitizeVocabText(r.pos, LIMITS.pos),
    phonBr: sanitizeVocabText(r.br, EXTRA_LIMITS.phon),
    phonAm: sanitizeVocabText(r.am, EXTRA_LIMITS.phon),
    definition: sanitizeVocabText(r.def, LIMITS.definition),
    example: sanitizeVocabText(r.ex, LIMITS.example),
    vietnamese: sanitizeVocabText(r.vi, LIMITS.vietnamese),
    synonyms: terms(r.syn),
    antonyms: terms(r.ant),
    datasets: [tag],
  }
}

/** Alphabetical by lookup key. The CSVs are already sorted, but the All view's
 *  merge appends C1 and C2 leftovers after the whole of SAT, so its natural
 *  order is three concatenated alphabets. Sorting is a *display* concern and is
 *  deliberately separate from the merge order above, which decides which row
 *  wins - the two must not be conflated. */
function byKey(a: ExploreEntry, b: ExploreEntry): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

// Promises, not values: two components opening the same dataset at once share
// one request instead of racing two.
let manifestPromise: Promise<DatasetMeta[]> | null = null
const datasetPromises = new Map<string, Promise<ExploreEntry[]>>()
let allPromise: Promise<ExploreEntry[]> | null = null

/** The datasets that ship, in the extension's display order (C1 first - it is
 *  the extension's default). B2 has no CSV, so it is simply not in here. */
export function loadManifest(): Promise<DatasetMeta[]> {
  manifestPromise ??= fetchJson('/datasets/manifest.json')
    .then((data) => {
      const list = (data as { datasets?: unknown }).datasets
      if (!Array.isArray(list) || !list.length) throw new Error('empty manifest')
      return list as DatasetMeta[]
    })
    .catch((err) => {
      manifestPromise = null // let a retry try again
      throw err
    })
  return manifestPromise
}

/** One dataset's entries, cached for the life of the page. */
export function loadDataset(id: string): Promise<ExploreEntry[]> {
  if (id === ALL_ID) return loadAll()

  const cached = datasetPromises.get(id)
  if (cached) return cached

  const promise = loadManifest()
    .then((manifest) => {
      const meta = manifest.find((d) => d.id === id)
      if (!meta) throw new Error(`unknown dataset: ${id}`)
      return fetchJson(`/datasets/${meta.file}`).then((data) => {
        if (!Array.isArray(data)) throw new Error(`${meta.file} is not a list`)
        return data
          .map((raw) => toEntry(raw, meta.tag))
          .filter((e): e is ExploreEntry => e !== null)
          .sort(byKey)
      })
    })
    .catch((err) => {
      datasetPromises.delete(id) // let a retry try again
      throw err
    })

  datasetPromises.set(id, promise)
  return promise
}

/** Every dataset merged, first occurrence winning, in ALL_ORDER. A word found
 *  in more than one set keeps the first set's wording but lists every set it
 *  belongs to, so the UI can badge it "SAT · C1 · C2". */
export function loadAll(): Promise<ExploreEntry[]> {
  allPromise ??= Promise.all(ALL_ORDER.map((id) => loadDataset(id)))
    .then((lists) => {
      const merged = new Map<string, ExploreEntry>()
      for (const list of lists) {
        for (const entry of list) {
          const existing = merged.get(entry.key)
          // First wins on content; later sets only add their tag.
          if (existing) {
            if (!existing.datasets.includes(entry.datasets[0])) {
              existing.datasets = [...existing.datasets, ...entry.datasets]
            }
          } else {
            merged.set(entry.key, { ...entry })
          }
        }
      }
      return [...merged.values()].sort(byKey)
    })
    .catch((err) => {
      allPromise = null
      throw err
    })
  return allPromise
}
