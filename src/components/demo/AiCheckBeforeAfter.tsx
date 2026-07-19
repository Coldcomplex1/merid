import { useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'

/**
 * Before/after toggle for the AI Context Check. The sentence contains one
 * good replacement ("quan trọng" → significant) and one classic homonym trap:
 * "đá" (to kick) wrongly replaced with "rock". Switching the check on reverts
 * the wrong word in place, exactly like the real feature does on a page.
 */
export default function AiCheckBeforeAfter() {
  const { t } = useLang()
  const s = t.apiKeyGuide.beforeAfter
  const [aiOn, setAiOn] = useState(false)

  return (
    <div className="w-full">
      <div className="rounded-2xl bg-cream-50 p-5 text-ink shadow-card sm:p-6">
        <p className="font-wiki text-[16px] leading-relaxed" lang="vi">
          Trận đấu có bàn thắng{' '}
          <span className="hl-en font-semibold whitespace-nowrap">significant</span> khi tiền đạo{' '}
          {aiOn ? (
            <span key="fixed" className="animate-word-swap inline-block font-semibold whitespace-nowrap">
              đá
              <span className="ml-1 align-middle text-[11px] font-extrabold text-[#188038]">↺</span>
            </span>
          ) : (
            <span key="wrong" className="hl-en animate-word-swap inline-block font-semibold whitespace-nowrap">
              rock
            </span>
          )}{' '}
          quả bóng vào góc cao khung thành.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-navy-200/60 pt-4">
          <span className="text-[12px] font-extrabold tracking-[0.1em] text-navy-500 uppercase">
            AI Context Check
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={aiOn}
            onClick={() => setAiOn((v) => !v)}
            className={`relative h-7 w-13 cursor-pointer rounded-full transition-colors duration-300 ${
              aiOn ? 'bg-[#188038]' : 'bg-navy-300'
            }`}
          >
            <span
              className={`absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[9px] font-extrabold shadow transition-transform duration-300 ${
                aiOn ? 'translate-x-6 text-[#188038]' : 'translate-x-0 text-navy-500'
              }`}
            >
              {aiOn ? '✓' : ''}
            </span>
          </button>
        </div>
      </div>

      <p
        className={`mt-3 rounded-xl px-4 py-3 text-sm leading-relaxed font-semibold ${
          aiOn ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
        }`}
        role="status"
      >
        {aiOn ? s.fixedNote : s.wrongNote}
      </p>
    </div>
  )
}
