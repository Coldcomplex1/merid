import { useState } from 'react'
import VocabPopupCard from './VocabPopupCard'
import { VOCAB } from '../../data/vocab'

const FLOATING_CHIPS = [
  { label: 'SAT', className: '-top-4 left-6', delay: '0s' },
  { label: 'B2', className: 'top-1/2 -right-6', delay: '1.1s' },
  { label: 'C1', className: '-top-3 right-10', delay: '0.5s' },
  { label: 'C2', className: 'top-24 -right-4', delay: '1.6s' },
  { label: 'Context-aware learning', className: '-right-3 bottom-20', delay: '2.2s' },
]

/** Fake browser window showing the extension running on a Vietnamese Wikipedia-style page. */
export default function BrowserMockup({ className = '' }: { className?: string }) {
  const [popupVisible, setPopupVisible] = useState(true)

  const hidePopup = () => {
    setPopupVisible(false)
    setTimeout(() => setPopupVisible(true), 2500)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Floating dataset chips */}
      {FLOATING_CHIPS.map((chip) => (
        <span
          key={chip.label}
          className={`absolute z-20 animate-float rounded-full border border-gold-400/60 bg-navy-800/95 px-3 py-1 text-xs font-bold text-gold-300 shadow-card backdrop-blur ${chip.className}`}
          style={{ animationDelay: chip.delay }}
        >
          {chip.label}
        </span>
      ))}

      {/* Browser window */}
      <div className="overflow-hidden rounded-2xl shadow-card ring-1 ring-navy-600/60">
        {/* Chrome bar */}
        <div className="flex items-center gap-2 border-b border-navy-200/40 bg-cream-100 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f26d5f]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f5c14e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#5ec269]" />
          <div className="ml-2 flex flex-1 items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[11px] text-navy-500">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6z" />
            </svg>
            vi.wikipedia.org/wiki/Trang_Chính
          </div>
        </div>

        {/* Page content */}
        <div className="space-y-3 bg-[#f6f6f4] p-4 pb-10 font-sans">
          {/* Featured article card */}
          <article className="overflow-hidden rounded-md border border-[#e2d9b8] bg-white">
            <header className="flex items-center gap-2 border-b border-[#e2d9b8] bg-[#faf1d5] px-3 py-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-gold-400 text-[10px] text-navy-900">
                ★
              </span>
              <h5 className="font-wiki text-[13px] font-bold text-[#202122]">Bài viết chọn lọc</h5>
            </header>
            <div className="p-3 text-[12px] leading-relaxed text-[#202122]">
              <div
                className="float-right ml-2.5 mb-1 h-20 w-16 rounded-sm bg-gradient-to-br from-navy-500 via-navy-700 to-navy-900 shadow-inner"
                aria-hidden="true"
              />
              <p>
                <span className="wiki-link italic">Xuân quang xạ tiết</span> là một bộ phim{' '}
                <span className="wiki-link">tâm lý tình cảm</span> Hồng Kông năm 1997, một tác phẩm{' '}
                <span className="hl-en animate-pulse-soft">elaborate</span> do{' '}
                <span className="wiki-link">Vương Gia Vệ</span> đạo diễn, với sự tham gia của{' '}
                <span className="wiki-link">Trương Quốc Vinh</span>,{' '}
                <span className="wiki-link">Lương Triều Vỹ</span> và{' '}
                <span className="wiki-link">Trương Chấn</span>. Bộ phim khắc họa nỗi{' '}
                <span className="hl-en animate-pulse-soft" style={{ animationDelay: '0.9s' }}>solitude</span>{' '}
                của hai người đàn ông nơi đất khách, và được xem là một trong những tác phẩm giàu{' '}
                <span className="hl-vi animate-pulse-soft" style={{ animationDelay: '1.8s' }}>ẩn dụ</span> xuất
                sắc nhất của điện ảnh châu Á thập niên 1990.
              </p>
            </div>
          </article>

          {/* Did-you-know card */}
          <article className="overflow-hidden rounded-md border border-[#c8d8e8] bg-white">
            <header className="flex items-center gap-2 border-b border-[#c8d8e8] bg-[#e7f0f7] px-3 py-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-wiki-blue text-[11px] font-bold text-white">
                ?
              </span>
              <h5 className="font-wiki text-[13px] font-bold text-[#202122]">Bạn có biết</h5>
            </header>
            <ul className="space-y-1 p-3 text-[12px] leading-relaxed text-[#202122]">
              <li>
                …<span className="wiki-link">Paul Wanner</span> là cầu thủ trẻ nhất giành chức vô địch{' '}
                <span className="wiki-link">Bundesliga</span>?
              </li>
              <li>
                …trên trang này, một vài từ tiếng Việt đã được thay bằng từ vựng{' '}
                <span className="hl-en animate-pulse-soft" style={{ animationDelay: '2.4s' }}>significant</span>?
              </li>
            </ul>
          </article>
        </div>
      </div>

      {/* Floating vocab popup */}
      <div
        className={`absolute -bottom-28 left-0 z-30 transition-all duration-500 sm:-left-16 ${
          popupVisible ? 'animate-pop-in' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
        style={{ animationDelay: popupVisible ? '0.45s' : '0s' }}
      >
        <div className="animate-float-slow" style={{ animationDelay: '1.5s' }}>
          <VocabPopupCard entry={VOCAB.elaborate} onClose={hidePopup} className="-rotate-1" />
        </div>
      </div>
    </div>
  )
}
