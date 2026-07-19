// The extension's matching engine, ported 1:1 from
// merid-extension-final/lib/vocab-core.js so the /try page runs the REAL
// product logic on the REAL datasets, entirely in the visitor's browser.
// Keep the algorithms in lockstep with the extension: tokenization, greedy
// 3→2→1 phrase matching, and the deterministic frequency gate.

export interface EngineEntry {
  word: string
  type: string
  phon_br: string
  phon_n_am: string
  definition: string
  example: string
  vietnamese: string
  synonyms: string
  antonyms: string
}

export type EngineDatasetKey = 'sat' | 'c1' | 'c2' | 'all'

export const ENGINE_DATASETS: { key: EngineDatasetKey; label: string; files: string[] }[] = [
  { key: 'sat', label: 'SAT', files: ['/datasets/dataset-SAT.csv'] },
  { key: 'c1', label: 'C1', files: ['/datasets/dataset-C1.csv'] },
  { key: 'c2', label: 'C2', files: ['/datasets/dataset-C2.csv'] },
  {
    key: 'all',
    label: 'All',
    files: ['/datasets/dataset-SAT.csv', '/datasets/dataset-C1.csv', '/datasets/dataset-C2.csv'],
  },
]

/* ── Text helpers (identical to VMCore) ─────────────────────────────────── */

/** Canonical match key: lowercase + collapse whitespace. Accents are kept on
 *  purpose - they are meaningful in Vietnamese. */
export function normalizeKey(str: string): string {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Split text into tokens, keeping whitespace runs and single punctuation
 *  chars as their own tokens so the text can be losslessly reassembled. */
export function tokenize(text: string): string[] {
  return (text || '').split(/(\s+|[^\s\wÀ-ỹ])/g)
}

export function isWordToken(token: string): boolean {
  return !!token && /[\wÀ-ỹ]/.test(token)
}

/* ── Matching ───────────────────────────────────────────────────────────── */

export type VocabMap = Map<string, EngineEntry[]>

/** Index every comma-separated Vietnamese meaning (VIE → ENG direction). */
export function buildVocabMap(vocab: EngineEntry[]): VocabMap {
  const map: VocabMap = new Map()
  const addKey = (key: string, item: EngineEntry) => {
    const k = normalizeKey(key)
    if (!k) return
    const arr = map.get(k)
    if (arr) {
      if (!arr.some((e) => e.word === item.word)) arr.push(item)
    } else {
      map.set(k, [item])
    }
  }
  for (const item of vocab) {
    for (const s of (item.vietnamese || '').split(',')) addKey(s, item)
  }
  return map
}

export interface Match {
  size: number
  matchedText: string
  key: string
  items: EngineEntry[]
}

/** Greedy longest-first phrase match over window sizes [3, 2, 1]. */
export function findMatch(tokens: string[], startIndex: number, vocabMap: VocabMap): Match | null {
  const minSingleWordLen = 2
  if (!isWordToken(tokens[startIndex])) return null

  for (const size of [3, 2, 1]) {
    if (startIndex + size > tokens.length) continue
    if (size > 1 && !isWordToken(tokens[startIndex + size - 1])) continue

    const slice = tokens.slice(startIndex, startIndex + size)
    const matchedText = slice.join('')
    const key = normalizeKey(matchedText)
    const items = vocabMap.get(key)
    if (!items) continue

    const isSingleWord = !key.includes(' ')
    if (isSingleWord && key.length < minSingleWordLen) continue

    return { size, matchedText, key, items }
  }
  return null
}

/* ── Deterministic intensity gate ───────────────────────────────────────── */

function hashToInt(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Same key + frequency always yields the same answer (0..100). */
export function gateByFrequency(key: string, frequency: number): boolean {
  const f = Math.max(0, Math.min(100, Number(frequency)))
  if (f >= 100) return true
  if (f <= 0) return false
  return hashToInt('gate|' + key) % 100 < f
}

/* ── CSV parsing (identical to VMCore) ──────────────────────────────────── */

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

export function parseCSV(text: string): EngineEntry[] {
  const clean = (text || '').replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/)
  if (!lines.length || !lines[0]) return []
  const headers = splitCsvLine(lines[0])
  const rows: EngineEntry[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i] || !lines[i].trim()) continue
    const parts = splitCsvLine(lines[i])
    const entry: Record<string, string> = {}
    headers.forEach((header, idx) => {
      entry[header] = parts[idx] != null ? parts[idx] : ''
    })
    if (entry.word?.trim() && entry.vietnamese?.trim()) {
      rows.push({
        word: entry.word.trim(),
        type: entry.type || '',
        phon_br: entry.phon_br || '',
        phon_n_am: entry.phon_n_am || '',
        definition: entry.definition || '',
        example: entry.example || '',
        vietnamese: entry.vietnamese,
        synonyms: entry.synonyms || '',
        antonyms: entry.antonyms || '',
      })
    }
  }
  return rows
}

/* ── Dataset loading (lazy, cached per session) ─────────────────────────── */

const datasetCache = new Map<EngineDatasetKey, Promise<EngineEntry[]>>()

export function loadDataset(key: EngineDatasetKey): Promise<EngineEntry[]> {
  const cached = datasetCache.get(key)
  if (cached) return cached
  const spec = ENGINE_DATASETS.find((d) => d.key === key) ?? ENGINE_DATASETS[0]
  const promise = Promise.all(
    spec.files.map(async (file) => {
      const resp = await fetch(file)
      if (!resp.ok) throw new Error(`dataset fetch failed: ${resp.status}`)
      return parseCSV(await resp.text())
    }),
  ).then((lists) => {
    // Dedupe by normalized headword, first dataset wins (same as the extension).
    const byWord = new Map<string, EngineEntry>()
    for (const list of lists) {
      for (const entry of list) {
        const k = entry.word.toLowerCase()
        if (!byWord.has(k)) byWord.set(k, entry)
      }
    }
    return Array.from(byWord.values())
  })
  promise.catch(() => datasetCache.delete(key)) // allow a retry after failures
  datasetCache.set(key, promise)
  return promise
}
