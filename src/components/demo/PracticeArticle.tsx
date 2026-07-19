import { VOCAB, type Dataset, type VocabEntry } from '../../data/vocab'
import type { Seg } from '../../data/wikiContent'
import VocabPlayground from './kit/VocabPlayground'

const text = (s: string): Seg => ({ t: 'text', s })
const b = (s: string): Seg => ({ t: 'b', s })
const link = (s: string): Seg => ({ t: 'link', s })
const vocab = (id: string): Seg => ({ t: 'vocab', id })

/** Default sample: a short travel-news piece dense enough in vocab words that
 *  every intensity/dataset change is visible. Kept in Vietnamese on purpose -
 *  it depicts the product running on a real Vietnamese page. */
export const PRACTICE_PARAGRAPHS: Seg[][] = [
  [
    b('Hội An'),
    text(' vừa được một tạp chí du lịch quốc tế bình chọn là điểm đến '),
    vocab('renowned'),
    text(' bậc nhất châu Á. Khu phố cổ, nơi được '),
    link('UNESCO'),
    text(' công nhận là '),
    vocab('heritage'),
    text(' văn hóa thế giới, vẫn giữ gần như nguyên vẹn những ngôi nhà '),
    vocab('ancient'),
    text(' hơn 200 năm tuổi bên bờ sông Hoài.'),
  ],
  [
    text('Chính quyền thành phố cho biết sẽ dùng nguồn thu '),
    vocab('significant'),
    text(' từ vé tham quan để '),
    vocab('preserve'),
    text(' từng mái ngói rêu phong, đồng thời '),
    vocab('expand'),
    text(' khu phố đi bộ theo hướng phát triển '),
    vocab('organic'),
    text(', không phá vỡ nhịp sống vốn có. Nhiều chuyên gia '),
    vocab('interpret'),
    text(' sức hút của Hội An như một '),
    vocab('phenomenon'),
    text(' hiếm gặp: càng ít thay đổi, càng đông người muốn '),
    vocab('discover'),
    text('.'),
  ],
]

export type DisplayMode = 'replace' | 'highlight' | 'beside'

export function labelFor(entry: VocabEntry, mode: DisplayMode): string {
  if (mode === 'replace') return entry.word
  if (mode === 'beside') return `${entry.vi} (${entry.word})`
  return entry.vi
}

interface PracticeArticleProps {
  mode?: DisplayMode
  /** 1..3 tier gate, mirroring the demo panel's Casual/Focused/Locked-in. */
  intensity?: number
  dataset?: Dataset | 'All'
  savedIds: Set<string>
  knownIds: Set<string>
  onSave: (entry: VocabEntry) => void
  onKnow: (entry: VocabEntry) => void
  onOpen?: (entry: VocabEntry) => void
  paragraphs?: Seg[][]
  /** Fake masthead above the article (site name + date). */
  masthead?: boolean
  className?: string
  /** Forwarded to the playground: makes the article body a scrollable
   *  viewport (the tutorial's mini-browser uses this). */
  scrollerClassName?: string
}

/**
 * A miniature Vietnamese article with Merid genuinely "running" on it: gold
 * words open the real learning card, Save to Deck and I know this both work.
 * Used on /welcome (first hover happens here) and /tutorial (the persistent
 * mini-browser article).
 */
export default function PracticeArticle({
  mode = 'replace',
  intensity = 2,
  dataset = 'All',
  savedIds,
  knownIds,
  onSave,
  onKnow,
  onOpen,
  paragraphs = PRACTICE_PARAGRAPHS,
  masthead = true,
  className = '',
  scrollerClassName = '',
}: PracticeArticleProps) {
  const isVisible = (entry: VocabEntry) =>
    (dataset === 'All' || entry.datasets.includes(dataset)) && entry.tier <= intensity

  return (
    <VocabPlayground
      savedIds={savedIds}
      onSave={onSave}
      onKnow={onKnow}
      onOpen={onOpen}
      className={className}
      scrollerClassName={scrollerClassName}
    >
      {({ renderWord }) => (
        <article className="rounded-2xl bg-cream-50 p-5 text-ink shadow-card sm:p-7">
          {masthead && (
            <div className="mb-4 flex items-center justify-between border-b border-navy-200/60 pb-3">
              <span className="font-wiki text-lg font-bold tracking-tight">baomau.vn</span>
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                Du lịch · Hôm nay
              </span>
            </div>
          )}
          <h3 className="font-wiki text-xl leading-snug font-bold sm:text-2xl" lang="vi">
            Hội An được vinh danh điểm đến hàng đầu châu Á
          </h3>
          <div className="mt-3 space-y-3.5 font-wiki text-[15px] leading-relaxed sm:text-base" lang="vi">
            {paragraphs.map((para, pi) => (
              <p key={pi}>
                {para.map((seg, si) => {
                  const key = `p${pi}-${si}`
                  switch (seg.t) {
                    case 'text':
                      return <span key={key}>{seg.s}</span>
                    case 'b':
                      return <b key={key}>{seg.s}</b>
                    case 'i':
                      return <i key={key}>{seg.s}</i>
                    case 'link':
                      return (
                        <span key={key} className="wiki-link-plain">
                          {seg.s}
                        </span>
                      )
                    case 'vocab': {
                      const entry = VOCAB[seg.id]
                      if (!entry) return <span key={key} />
                      if (knownIds.has(entry.id) || !isVisible(entry)) {
                        return <span key={key}>{entry.vi}</span>
                      }
                      return renderWord(entry, labelFor(entry, mode), key)
                    }
                  }
                })}
              </p>
            ))}
          </div>
        </article>
      )}
    </VocabPlayground>
  )
}
