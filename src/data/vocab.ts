export type Dataset = 'SAT' | 'B2' | 'C1' | 'C2'

/** 1 = appears even at Low frequency · 2 = Medium and up · 3 = High only */
export type Tier = 1 | 2 | 3

export interface VocabEntry {
  id: string
  word: string
  vi: string
  pos: string
  pron: string
  definition: string
  viMeaning: string
  example: string
  synonyms: string[]
  antonyms: string[]
  datasets: Dataset[]
  tier: Tier
}

export const DATASETS: Dataset[] = ['SAT', 'B2', 'C1', 'C2']

export const VOCAB: Record<string, VocabEntry> = {
  elaborate: {
    id: 'elaborate',
    word: 'elaborate',
    vi: 'phức tạp',
    pos: 'adjective',
    pron: '/ɪˈlæb.ər.ət/',
    definition: 'complex, detailed, intricate',
    viMeaning: 'Công phu, tỉ mỉ, phức tạp',
    example:
      'Dan always beats me at chess because he develops such an elaborate game plan that I can never predict his next move.',
    synonyms: ['intricate', 'complex', 'sophisticated'],
    antonyms: ['simple', 'basic', 'rudimentary'],
    datasets: ['SAT', 'C1', 'C2'],
    tier: 1,
  },
  significant: {
    id: 'significant',
    word: 'significant',
    vi: 'quan trọng',
    pos: 'adjective',
    pron: '/sɪɡˈnɪf.ɪ.kənt/',
    definition: 'important, or large enough to be noticed',
    viMeaning: 'Quan trọng, đáng kể',
    example:
      'Getting eight hours of sleep made a significant difference in my test scores this semester.',
    synonyms: ['notable', 'considerable', 'meaningful'],
    antonyms: ['minor', 'trivial', 'negligible'],
    datasets: ['SAT', 'B2'],
    tier: 1,
  },
  replace: {
    id: 'replace',
    word: 'replace',
    vi: 'thay thế',
    pos: 'verb',
    pron: '/rɪˈpleɪs/',
    definition: 'to take the place of something, or to put something in its place',
    viMeaning: 'Thay thế, thế chỗ',
    example: 'Streaming services have largely replaced DVDs in most households.',
    synonyms: ['substitute', 'swap', 'supplant'],
    antonyms: ['keep', 'retain', 'preserve'],
    datasets: ['B2', 'C1'],
    tier: 1,
  },
  organic: {
    id: 'organic',
    word: 'organic',
    vi: 'tự nhiên',
    pos: 'adjective',
    pron: '/ɔːrˈɡæn.ɪk/',
    definition: 'happening or developing naturally, without being forced',
    viMeaning: 'Tự nhiên, không gượng ép',
    example: 'The best friendships grow in an organic way; you never have to force them.',
    synonyms: ['natural', 'spontaneous', 'unforced'],
    antonyms: ['forced', 'artificial', 'contrived'],
    datasets: ['B2', 'C1', 'C2'],
    tier: 2,
  },
  interpret: {
    id: 'interpret',
    word: 'interpret',
    vi: 'giải thích',
    pos: 'verb',
    pron: '/ɪnˈtɜːr.prɪt/',
    definition: 'to explain or decide what the meaning of something is',
    viMeaning: 'Giải thích, diễn giải',
    example: 'Poetry is fun because every reader interprets the same lines differently.',
    synonyms: ['explain', 'decode', 'construe'],
    antonyms: ['obscure', 'confuse', 'muddle'],
    datasets: ['SAT', 'C2'],
    tier: 3,
  },
  solitude: {
    id: 'solitude',
    word: 'solitude',
    vi: 'cô đơn',
    pos: 'noun',
    pron: '/ˈsɑː.lə.tuːd/',
    definition: 'the state of being alone, especially when peaceful',
    viMeaning: 'Sự cô đơn, nỗi cô độc',
    example: 'She enjoys the solitude of early mornings, before the whole city wakes up.',
    synonyms: ['isolation', 'seclusion', 'loneliness'],
    antonyms: ['company', 'companionship', 'crowd'],
    datasets: ['SAT', 'C1'],
    tier: 1,
  },
  metaphor: {
    id: 'metaphor',
    word: 'metaphor',
    vi: 'ẩn dụ',
    pos: 'noun',
    pron: '/ˈmet̬.ə.fɔːr/',
    definition: 'an expression that describes one thing by comparing it to another',
    viMeaning: 'Phép ẩn dụ',
    example: 'The film uses rain as a metaphor for the character’s grief.',
    synonyms: ['analogy', 'symbol', 'imagery'],
    antonyms: ['literalism', 'plain speech'],
    datasets: ['SAT', 'C2'],
    tier: 2,
  },
}

export type DemoToken = { text: string } | { entryId: string }

/**
 * “Bạn đang đọc một bài viết tiếng Việt bình thường, nhưng một vài từ quan trọng
 * sẽ được thay thế bằng tiếng Anh để bạn học từ vựng một cách tự nhiên. Khi gặp
 * một từ phức tạp, chỉ cần di chuột lên từ đó để xem giải thích chi tiết.”
 */
export const DEMO_PARAGRAPH: DemoToken[] = [
  { text: 'Bạn đang đọc một bài viết tiếng Việt bình thường, nhưng một vài từ ' },
  { entryId: 'significant' },
  { text: ' sẽ được ' },
  { entryId: 'replace' },
  { text: ' bằng tiếng Anh để bạn học từ vựng một cách ' },
  { entryId: 'organic' },
  { text: '. Khi gặp một từ ' },
  { entryId: 'elaborate' },
  { text: ', chỉ cần di chuột lên từ đó để xem ' },
  { entryId: 'interpret' },
  { text: ' chi tiết, không cần rời khỏi trang.' },
]

export function isVisible(entry: VocabEntry, dataset: Dataset, frequency: number): boolean {
  return entry.datasets.includes(dataset) && entry.tier <= frequency
}
