/**
 * Prompt builder for the /create-dataset page. Generates an English prompt the
 * user pastes into an AI (ChatGPT, Claude, Gemini, …) to produce a CSV that the
 * Merid extension's custom-dataset importer accepts. The prompt is always
 * English regardless of the site language - models follow English formatting
 * instructions most reliably - while every visible UI string stays bilingual.
 *
 * Everything here runs locally in the browser; nothing is sent anywhere.
 */

export type Level = 'B2' | 'C1' | 'C2'
export type WordCount = 50 | 100 | 200

export const LEVELS: readonly Level[] = ['B2', 'C1', 'C2']
export const WORD_COUNTS: readonly WordCount[] = [50, 100, 200]
export const DEFAULT_LEVEL: Level = 'C1'
export const DEFAULT_WORD_COUNT: WordCount = 100

/** The exact header the extension importer expects (order matters for the AI). */
export const CSV_HEADER =
  'word,type,phon_br,phon_n_am,definition,example,vietnamese,synonyms,antonyms'

/** One correctly formatted record, used as a format reference everywhere. */
export const EXAMPLE_ROW =
  'consider,v,/kənˈsɪd.ər/,/kənˈsɪd.ɚ/,"to think carefully about something before making a decision","We considered all the options before deciding.","cân nhắc, xem xét","ponder, weigh",""'

/** Blank template offered as a download (header + nothing else). */
export const TEMPLATE_CSV = CSV_HEADER + '\n'

/**
 * Topic presets. `id` keys the localized label in translations; `prompt` is the
 * English phrase embedded in the generated prompt. 'custom' uses free text.
 */
export const TOPIC_PRESETS = [
  { id: 'business', prompt: 'business and finance' },
  { id: 'technology', prompt: 'technology' },
  { id: 'science', prompt: 'science' },
  { id: 'environment', prompt: 'the environment and climate' },
  { id: 'academic', prompt: 'academic writing' },
  { id: 'economics', prompt: 'economics' },
  { id: 'medicine', prompt: 'medicine and health' },
  { id: 'travel', prompt: 'travel' },
  { id: 'everyday', prompt: 'everyday conversation' },
  { id: 'custom', prompt: '' },
] as const

export type TopicPresetId = (typeof TOPIC_PRESETS)[number]['id']

/**
 * Make free-text topics safe to embed as plain text inside the prompt: strip
 * control characters and line breaks, straighten double quotes (the topic sits
 * inside a quoted phrase), collapse whitespace, cap the length.
 */
export function sanitizeTopic(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, ' ')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export interface PromptOptions {
  level: Level
  /** Already-sanitized topic phrase (use sanitizeTopic for free text). */
  topic: string
  count: WordCount
}

/** Build the full copy-paste prompt for the chosen level, topic and size. */
export function buildDatasetPrompt({ level, topic, count }: PromptOptions): string {
  const topicPhrase = topic || 'general advanced English'
  return `You are building a personal English vocabulary dataset for Merid, a browser extension that helps Vietnamese learners pick up English words while browsing.

Create a CSV vocabulary list of exactly ${count} entries.

WORD SELECTION RULES
1. Every headword must be genuinely useful, modern English at CEFR level ${level} - skip words that are clearly easier than ${level}, archaic, or too obscure to meet in real reading.
2. Topic: "${topicPhrase}". Choose vocabulary a learner would actually meet when reading or talking about this topic.
3. No duplicate headwords - every value in the "word" column must be unique.
4. Each entry must include an accurate Vietnamese meaning with correct diacritics, a concise English definition, a natural example sentence, and the part of speech.
5. Include British IPA (phon_br) and North American IPA (phon_n_am) only when you are confident they are correct; otherwise leave those fields empty.
6. Include 1-3 useful synonyms and antonyms when they exist; otherwise leave those fields empty.

FORMAT RULES (follow exactly)
1. The first line must be exactly this header, in this order:
${CSV_HEADER}
2. One vocabulary entry per CSV record - never spread an entry across multiple lines.
3. Wrap any field that contains a comma or a double quote in double quotes, and escape a double quote inside a field by doubling it ("").
4. Put multiple Vietnamese meanings, synonyms or antonyms inside ONE quoted field, separated by commas (e.g. "cân nhắc, xem xét").
5. The output must be plain UTF-8 CSV text.
6. Return ONLY the raw CSV content: no explanation before or after it, no Markdown table, and no \`\`\` code fences. If you are able to attach files, you may instead provide the same content as a downloadable .csv file.

Here is ONE correctly formatted record as a format reference only - do NOT copy it into the dataset unless it genuinely fits the requested topic and level:
${EXAMPLE_ROW}

Now output the ${count}-entry CSV.`
}
