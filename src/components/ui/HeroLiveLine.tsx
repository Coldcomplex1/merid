import { useEffect, useRef, useState } from 'react'
import { VOCAB, type VocabEntry } from '../../data/vocab'
import VocabPlayground from '../demo/kit/VocabPlayground'
import { useLang } from '../../i18n/LanguageContext'

/** Words the hero sentence cycles through (all tier-1, instantly readable). */
const ROTATION: string[] = ['significant', 'discover', 'heritage', 'preserve']
const ROTATE_MS = 3200

/**
 * The product, demonstrated inside the hero itself: a Vietnamese sentence in
 * which one word is genuinely replaced by Merid - it rotates through a few
 * vocabulary words, and hovering it opens the real learning card. Visitors
 * who never scroll still experience the extension above the fold.
 */
export default function HeroLiveLine() {
  const { t } = useLang()
  const [index, setIndex] = useState(0)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  // Rotation pauses while the visitor is interacting with the word/card.
  const pausedRef = useRef(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      if (!pausedRef.current) setIndex((i) => (i + 1) % ROTATION.length)
    }, ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [])

  const entry = VOCAB[ROTATION[index]]
  if (!entry) return null

  const handleSave = (e: VocabEntry) => setSavedIds((prev) => new Set(prev).add(e.id))

  return (
    <VocabPlayground
      savedIds={savedIds}
      onSave={handleSave}
      onOpen={() => {
        pausedRef.current = true
      }}
      className="relative z-20 mt-6 max-w-xl"
    >
      {({ renderWord }) => (
        <div
          onMouseLeave={() => {
            pausedRef.current = false
          }}
          onPointerLeave={() => {
            pausedRef.current = false
          }}
        >
          <p className="rounded-2xl bg-surface px-5 py-4 font-wiki text-[17px] leading-relaxed text-heading ring-1 ring-line" lang="vi">
            Bạn đọc báo như mọi ngày, còn Merid lặng lẽ biến vài từ{' '}
            <span key={entry.id} className="animate-word-swap inline-block">
              {renderWord(entry, entry.word, `hero-${entry.id}`)}
            </span>{' '}
            thành cơ hội học tiếng Anh.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent">
            <svg width="12" height="14" viewBox="0 0 26 34" fill="none" aria-hidden="true">
              <g transform="rotate(11 5 3)">
                <path
                  d="M5 3 L5 19.8 L8.9 16.2 L15 14.4 Z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </g>
            </svg>
            {t.hero.liveHint}
          </p>
        </div>
      )}
    </VocabPlayground>
  )
}
