import { useState, type ReactNode } from 'react'
import {
  DID_YOU_KNOW,
  FEATURED_ARTICLE,
  FEATURED_PICTURE_CAPTION,
  IN_THE_NEWS,
  ON_THIS_DAY,
  OTHER_LANGUAGES,
  SISTER_PROJECTS,
  type Seg,
} from '../../data/wikiContent'

export type RenderVocab = (id: string, key: string) => ReactNode

interface WikiPageProps {
  renderVocab: RenderVocab
}

/* ── Inline segment renderer ───────────────────────────────────────────── */

function Segs({ segs, prefix, renderVocab }: { segs: Seg[]; prefix: string; renderVocab: RenderVocab }) {
  return (
    <>
      {segs.map((seg, i) => {
        const key = `${prefix}-${i}`
        switch (seg.t) {
          case 'text':
            return <span key={key}>{seg.s}</span>
          case 'link':
            return (
              <span key={key} className="wiki-link-plain">
                {seg.s}
              </span>
            )
          case 'b':
            return (
              <b key={key} className="font-bold">
                {seg.s}
              </b>
            )
          case 'i':
            return <i key={key}>{seg.s}</i>
          case 'vocab':
            return renderVocab(seg.id, key)
        }
      })}
    </>
  )
}

/* ── Small illustrative SVGs (stand-ins for the photos we can't ship) ──── */

function GlobeMark() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
      <g fill="none" stroke="#54595d" strokeWidth="1">
        <circle cx="12" cy="12" r="10" />
        <ellipse cx="12" cy="12" rx="4.5" ry="10" />
        <path d="M2 12h20M3.8 6.6h16.4M3.8 17.4h16.4" />
      </g>
    </svg>
  )
}

/** Faded puzzle-globe watermark behind the right half of the main banner. */
function BannerGlobe() {
  return (
    <svg
      viewBox="0 0 220 220"
      aria-hidden="true"
      className="pointer-events-none absolute -top-12 right-0 h-[230px] w-[230px] opacity-[0.08] @2xl:right-12"
    >
      <g fill="none" stroke="#202122" strokeWidth="1.2">
        <circle cx="110" cy="110" r="96" />
        <ellipse cx="110" cy="110" rx="44" ry="96" />
        <ellipse cx="110" cy="110" rx="78" ry="96" />
        <path d="M14 110h192M25 62h170M25 158h170M52 26h116M52 194h116" />
      </g>
      <g fill="#202122" fontFamily="Georgia, 'Times New Roman', serif" fontSize="30">
        <text x="92" y="56">W</text>
        <text x="48" y="102">Ω</text>
        <text x="134" y="102">維</text>
        <text x="92" y="148">А</text>
      </g>
    </svg>
  )
}

function HaLongThumb() {
  return (
    <svg viewBox="0 0 140 100" className="block h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="wk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9ebf4" />
          <stop offset="1" stopColor="#f3f9fc" />
        </linearGradient>
        <linearGradient id="wk-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d93b5" />
          <stop offset="1" stopColor="#3d6e8c" />
        </linearGradient>
      </defs>
      <rect width="140" height="62" fill="url(#wk-sky)" />
      <rect y="62" width="140" height="38" fill="url(#wk-sea)" />
      <path d="M8 62 C12 30 30 26 36 40 C40 30 52 32 54 62 Z" fill="#3d5747" />
      <path d="M58 62 C66 18 88 16 94 44 C100 36 108 40 110 62 Z" fill="#2f4a3c" />
      <path d="M112 62 C116 44 128 42 134 62 Z" fill="#46614f" />
      <ellipse cx="78" cy="72" rx="30" ry="3" fill="#ffffff" opacity="0.16" />
      <path d="M30 80h14l-3 4h-8Z" fill="#22333f" />
      <path d="M37 72v8" stroke="#22333f" strokeWidth="1.4" />
      <path d="M37 71l6 7h-6Z" fill="#8a3d2a" />
    </svg>
  )
}

function FootballerThumb() {
  return (
    <svg viewBox="0 0 90 120" className="block h-full w-full" aria-hidden="true">
      {/* blurred stand */}
      <rect width="90" height="46" fill="#b6bcc7" />
      <rect y="8" width="90" height="7" fill="#a5acb8" opacity="0.75" />
      <rect y="22" width="90" height="6" fill="#c6cbd4" opacity="0.85" />
      <rect y="34" width="90" height="6" fill="#9aa1ae" opacity="0.6" />
      {/* pitch */}
      <rect y="46" width="90" height="74" fill="#7d9f6d" />
      <rect y="46" width="90" height="9" fill="#8aab79" />
      <rect y="72" width="90" height="11" fill="#87a776" />
      <rect y="100" width="90" height="10" fill="#8aab79" />
      {/* opponent behind, black-and-white stripes */}
      <g opacity="0.92">
        <circle cx="69" cy="38" r="5" fill="#c9a186" />
        <path d="M62 44h14l-1.5 17h-11z" fill="#f5f5f5" />
        <path d="M65 44h2.6v17h-2.6zM70.4 44h2.6v17H70.4z" fill="#2a2c30" />
        <path d="M63.5 61h11l-1 9h-9z" fill="#2a2c30" />
        <path d="M65 70l-1.5 14h3.4l1.2-13zM72 70l2 14h-3.4l-1.4-13z" fill="#c9a186" />
        <path d="M62.6 84l-.8 9h4l.7-8.6zM74.8 84l1.4 9h-4l-1-8.6z" fill="#f5f5f5" />
      </g>
      {/* main player, dark navy kit */}
      <g>
        <circle cx="40" cy="30" r="7" fill="#caa287" />
        <path d="M33.5 27c1.2-5.4 11.8-5.4 13 0l-1.6 2.6h-9.8z" fill="#3a2d24" />
        <path d="M31 40c4-3.4 14-3.4 18 0l2.6 21h-23.2z" fill="#20264a" />
        <path d="M31 40l-4 14 4.4 1.6 3-11zM49 40l4 14-4.4 1.6-3-11z" fill="#20264a" />
        <path d="M27 54l4.4 1.6-.8 2.6-4.4-1.4zM53 54l-4.4 1.6.8 2.6 4.4-1.4z" fill="#caa287" />
        <circle cx="36" cy="45" r="1.4" fill="#c8402f" />
        <path d="M32.5 61h15.4l-1.6 13.4H34z" fill="#20264a" />
        <path d="M34.6 74.4l-2.2 17.6h4.6l2.4-16.6zM46.6 74.4l3.6 17.2-4.6.8-3-17z" fill="#caa287" />
        <path d="M31.6 92l-1 14h5.4l.8-13.2zM50.8 91.2l2.6 14.2h-5.4l-2-13.6z" fill="#191f3d" />
        <path d="M29.6 106l-2 4.4 8 .4.4-4.4zM53.8 105.4l2.8 4.6-8 .6-.8-4.6z" fill="#e8e6e1" />
      </g>
    </svg>
  )
}

function CometThumb() {
  return (
    <svg viewBox="0 0 80 80" className="block h-full w-full" aria-hidden="true">
      <rect width="80" height="80" fill="#0e1c36" />
      <circle cx="14" cy="16" r="1" fill="#dfe8ff" />
      <circle cx="30" cy="60" r="1.2" fill="#dfe8ff" />
      <circle cx="66" cy="22" r="1" fill="#dfe8ff" />
      <circle cx="52" cy="70" r="0.9" fill="#dfe8ff" />
      <circle cx="70" cy="48" r="1.1" fill="#dfe8ff" />
      <path d="M10 64 L52 30" stroke="#9db8e8" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
      <path d="M22 55 L52 30" stroke="#c9d9f5" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <circle cx="54" cy="28" r="5" fill="#f4f7ff" />
    </svg>
  )
}

function TerracesPicture() {
  return (
    <svg viewBox="0 0 480 160" preserveAspectRatio="xMidYMid slice" className="block h-40 w-full @2xl:h-48" aria-hidden="true">
      <rect width="480" height="160" fill="#ecdfb4" />
      <circle cx="404" cy="30" r="15" fill="#f2c14e" />
      <path d="M0 70 C120 48 240 88 480 58 L480 160 L0 160 Z" fill="#c9b45a" />
      <path d="M0 94 C140 74 280 110 480 84 L480 160 L0 160 Z" fill="#a8bf5e" />
      <path d="M0 118 C160 100 310 132 480 108 L480 160 L0 160 Z" fill="#7fa64f" />
      <path d="M0 142 C180 126 330 154 480 132 L480 160 L0 160 Z" fill="#5c8a44" />
      <path d="M0 82 C130 62 250 98 480 70" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.25" />
      <path d="M0 106 C150 88 290 120 480 96" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.25" />
      <path d="M0 130 C170 114 320 142 480 120" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.25" />
    </svg>
  )
}

/* ── Section chrome ────────────────────────────────────────────────────── */

function SectionBox({
  title,
  icon,
  headerBg,
  border,
  className = '',
  children,
}: {
  title: string
  icon: ReactNode
  headerBg: string
  border: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`overflow-hidden rounded-sm border bg-white ${className}`} style={{ borderColor: border }}>
      <header
        className="flex items-center gap-2 border-b px-3 py-1.5"
        style={{ backgroundColor: headerBg, borderColor: border }}
      >
        {icon}
        <h3 className="font-wiki text-[15px] font-bold text-[#202122]">{title}</h3>
      </header>
      <div className="p-3 text-[13.5px] leading-[1.65] text-[#202122]">{children}</div>
    </section>
  )
}

const StarIcon = (
  <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#c9a34c] text-[11px] text-white">★</span>
)
const QuestionIcon = (
  <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-wiki-blue text-[11px] font-bold text-white">
    ?
  </span>
)
const NewsIcon = (
  <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#546e7a] text-white">
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M4 5h13v12.5A1.5 1.5 0 0 0 18.5 19H6a2 2 0 0 1-2-2V5zm15 3h1.5v9.5a1.5 1.5 0 0 1-3 0V8H19zM6 8h9v2H6V8zm0 4h9v1.5H6V12zm0 3h6v1.5H6V15z" />
    </svg>
  </span>
)
const CalendarIcon = (
  <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#4b7f52] text-white">
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M7 2v3M17 2v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 6h16v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6zm2 5h3v3H6v-3z" />
    </svg>
  </span>
)

/* ── "Giao diện" appearance sidebar (Vector 2022) ──────────────────────── */

type TextSize = 'small' | 'standard' | 'large'
type PageWidth = 'standard' | 'wide'
type ColorMode = 'auto' | 'light' | 'dark'

// MediaWiki's font-size setting only scales the content area, which the
// zoom property approximates without rewriting every hardcoded px size.
const TEXT_ZOOM: Record<TextSize, number> = { small: 0.875, standard: 1, large: 1.2 }

function AppearanceGroup<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string
  name: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="mt-3 border-t border-[#eaecf0] pt-3" role="radiogroup" aria-label={label}>
      <p className="text-[12.5px] font-bold text-[#54595d]">{label}</p>
      <div className="mt-1">
        {options.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 py-[3px] text-[13px] text-[#202122]">
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="h-[17px] w-[17px] shrink-0 cursor-pointer appearance-none rounded-full border border-[#72777d] bg-white checked:border-[5px] checked:border-[#36c]"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}

/* ── Reusable link rows ────────────────────────────────────────────────── */

function DotLinks({ label, links }: { label?: string; links: readonly string[] }) {
  return (
    <p className="text-[13px]">
      {label && <b>{label} </b>}
      {links.map((link, i) => (
        <span key={link}>
          {i > 0 && <span className="text-[#54595d]"> · </span>}
          <span className="wiki-link-plain">{link}</span>
        </span>
      ))}
    </p>
  )
}

/* ── The page ──────────────────────────────────────────────────────────── */

/**
 * Hand-built recreation of vi.wikipedia.org "Trang Chính" (Vector 2022 skin),
 * including the working "Giao diện" appearance sidebar. All prose flows
 * through `renderVocab`, which the demo uses to swap Vietnamese words for
 * interactive English vocabulary. Breakpoints are container queries, so the
 * layout responds to the fake browser being drag-resized, like a real page.
 */
export default function WikiPage({ renderVocab }: WikiPageProps) {
  const [textSize, setTextSize] = useState<TextSize>('standard')
  const [pageWidth, setPageWidth] = useState<PageWidth>('standard')
  const [colorMode, setColorMode] = useState<ColorMode>('light')
  const [appearanceHidden, setAppearanceHidden] = useState(false)

  const dark =
    colorMode === 'dark' ||
    (colorMode === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div lang="vi" className={`@container bg-white font-sans text-[#202122] ${dark ? 'wiki-dark' : ''}`}>
      {/* Site header */}
      <header className="flex items-center gap-3 border-b border-[#eaecf0] px-3 py-1.5 @xl:px-4">
        <span className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-[#eaecf0]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="#54595d" aria-hidden="true">
            <path d="M2 4h16v1.6H2V4zm0 5.2h16v1.6H2V9.2zm0 5.2h16V16H2v-1.6z" />
          </svg>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <GlobeMark />
          <span className="hidden leading-none @xl:block">
            <span className="font-wiki block text-[17px] font-bold tracking-wide">WIKIPEDIA</span>
            <span className="block text-[9px] text-[#54595d]">Bách khoa toàn thư mở</span>
          </span>
        </span>
        <div className="flex min-w-0 flex-1 items-center">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-l-sm border border-[#a2a9b1] px-2.5">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="#54595d" strokeWidth="1.8" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="M13 13l4.5 4.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Tìm kiếm trên Wikipedia"
              aria-label="Tìm kiếm trên Wikipedia"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#72777d]"
            />
          </div>
          <button
            type="button"
            className="hidden h-8 shrink-0 cursor-pointer rounded-r-sm border border-l-0 border-[#a2a9b1] bg-[#f8f9fa] px-3 text-[13px] font-semibold hover:bg-[#eaecf0] @2xl:block"
          >
            Tìm kiếm
          </button>
        </div>
        <nav className="hidden shrink-0 items-center gap-3 text-[13px] @3xl:flex">
          <span className="wiki-link-plain">Quyên góp</span>
          <span className="wiki-link-plain">Tạo tài khoản</span>
          <span className="wiki-link-plain">Đăng nhập</span>
          <span className="cursor-pointer text-[#54595d]">⋯</span>
        </nav>
      </header>

      {/* The aside must stretch to the content's full height so its sticky
          panel can travel with the scroll */}
      <div className="flex">
        <div className="min-w-0 flex-1">
          {/* Article tab bar */}
          <nav className="flex items-center justify-between border-b border-[#c8ccd1] px-3 text-[13px] @xl:px-4">
            <div className="flex">
              <span className="cursor-pointer border-b-2 border-[#36c] px-2.5 py-2 font-semibold">Trang Chính</span>
              <span className="wiki-link-plain px-2.5 py-2">Thảo luận</span>
            </div>
            <div className="flex items-center">
              <span className="cursor-pointer border-b-2 border-[#36c] px-2.5 py-2 font-semibold">Đọc</span>
              <span className="wiki-link-plain hidden px-2.5 py-2 @2xl:block">Xem mã nguồn</span>
              <span className="wiki-link-plain hidden px-2.5 py-2 @2xl:block">Xem lịch sử</span>
              {/* "Công cụ" collapses into this menu; it also restores a hidden appearance panel */}
              <button
                type="button"
                title="Công cụ"
                aria-label="Công cụ"
                onClick={() => setAppearanceHidden((v) => !v)}
                className="cursor-pointer rounded-sm px-1.5 py-2 text-[#54595d] hover:bg-[#eaecf0]"
              >
                <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor" aria-hidden="true">
                  <circle cx="10" cy="4" r="1.7" />
                  <circle cx="10" cy="10" r="1.7" />
                  <circle cx="10" cy="16" r="1.7" />
                </svg>
              </button>
            </div>
          </nav>

          <main className="px-3 py-4 @2xl:px-6" style={{ zoom: TEXT_ZOOM[textSize] }}>
            <div className={pageWidth === 'standard' ? 'mx-auto max-w-[1060px]' : ''}>
              {/* Main banner */}
              <div className="relative overflow-hidden rounded-sm border border-[#c8ccd1] bg-white">
                <BannerGlobe />
                <div className="relative flex flex-col gap-4 px-5 py-4 @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-8 @2xl:px-8">
                  <div>
                    <h2 className="font-wiki text-[24px] leading-tight @2xl:text-[27px]" style={{ fontVariantCaps: 'small-caps' }}>
                      Wikipedia tiếng Việt
                    </h2>
                    <p className="mt-1 text-[13.5px]">Bạn chính là tác giả của Wikipedia</p>
                  </div>
                  <div className="shrink-0 @2xl:pr-20 @2xl:text-center">
                    <p className="text-[13.5px]">
                      <span className="wiki-link-plain font-bold">1.303.327</span> bài viết và{' '}
                      <span className="wiki-link-plain font-bold">1.071.402</span> thành viên
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] font-bold @2xl:justify-center">
                      {['Tạo bài', 'Sửa bài', 'Tải hình', 'Quy tắc', 'Đặt câu hỏi'].map((link) => (
                        <span key={link} className="wiki-link-plain">
                          {link}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Article / help shortcut strip */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-10 gap-y-1 rounded-sm border border-[#c8ccd1] bg-white px-4 py-2">
                <DotLinks label="Bài viết:" links={['Tra cứu', 'Bài mới', 'Hỏi đáp', 'Thỉnh cầu', 'Thư viện']} />
                <DotLinks label="Trợ giúp:" links={['FAQ', 'Giúp đỡ', 'Hướng dẫn', 'Chỗ thử', 'Guestbook']} />
              </div>

              {/* Main two-column section grid */}
              <div className="mt-3 grid items-start gap-3 @3xl:grid-cols-2">
                <SectionBox title="Bài viết chọn lọc" icon={StarIcon} headerBg="#faf1d5" border="#e2d9b8">
                  <div className="float-right mb-1 ml-3 w-[112px] @2xl:w-[132px]">
                    <div className="border border-[#c8ccd1] bg-[#f8f9fa] p-[3px]">
                      <div className="wiki-photo h-[80px] @2xl:h-[94px]">
                        <HaLongThumb />
                      </div>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#54595d]">Đảo đá vôi trên vịnh Hạ Long</p>
                  </div>
                  {FEATURED_ARTICLE.map((para, i) => (
                    <p key={i} className={i > 0 ? 'mt-2.5' : ''}>
                      <Segs segs={para} prefix={`fa-${i}`} renderVocab={renderVocab} />
                    </p>
                  ))}
                  <p className="mt-2.5 text-right text-[12.5px]">
                    <span className="wiki-link-plain font-semibold">[ Đọc tiếp… ]</span>
                  </p>
                </SectionBox>

                <SectionBox title="Bạn có biết" icon={QuestionIcon} headerBg="#d5e6f5" border="#b8cfe5">
                  <div className="float-right mb-1 ml-3 w-[86px] @2xl:w-[98px]">
                    <div className="border border-[#c8ccd1] bg-[#f8f9fa] p-[3px]">
                      <div className="wiki-photo h-[110px] @2xl:h-[126px]">
                        <FootballerThumb />
                      </div>
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {DID_YOU_KNOW.map((item, i) => (
                      <li key={i} className="pl-1">
                        …&thinsp;
                        <Segs segs={item} prefix={`dyk-${i}`} renderVocab={renderVocab} />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 text-right text-[12.5px]">
                    <span className="wiki-link-plain">Xem thêm những nội dung mới…</span>
                  </p>
                </SectionBox>

                <SectionBox title="Tin tức" icon={NewsIcon} headerBg="#e9edf5" border="#c6cfe0">
                  <div className="float-right mb-1 ml-3 w-[72px]">
                    <div className="border border-[#c8ccd1] bg-[#f8f9fa] p-[3px]">
                      <div className="wiki-photo h-[64px]">
                        <CometThumb />
                      </div>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#54595d]">Sao chổi mới</p>
                  </div>
                  <ul className="space-y-1.5">
                    {IN_THE_NEWS.map((item, i) => (
                      <li key={i} className="pl-1">
                        <Segs segs={item} prefix={`news-${i}`} renderVocab={renderVocab} />
                      </li>
                    ))}
                  </ul>
                </SectionBox>

                <SectionBox title="Ngày này năm xưa" icon={CalendarIcon} headerBg="#e9f3e4" border="#c3d9b8">
                  <p className="font-semibold">
                    {ON_THIS_DAY.date}
                    <span className="ml-1.5 text-[12px] font-normal text-[#54595d]">
                      (<span className="wiki-link-plain">Ngày Dân số Thế giới</span>)
                    </span>
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {ON_THIS_DAY.events.map((event, i) => (
                      <li key={i} className="pl-1">
                        <Segs segs={event} prefix={`otd-${i}`} renderVocab={renderVocab} />
                      </li>
                    ))}
                  </ul>
                </SectionBox>
              </div>

              {/* Featured picture */}
              <SectionBox
                title="Hình ảnh chọn lọc"
                icon={StarIcon}
                headerBg="#f8f9fa"
                border="#c8ccd1"
                className="mt-3"
              >
                <div className="border border-[#c8ccd1] bg-[#f8f9fa] p-[3px]">
                  <div className="wiki-photo">
                    <TerracesPicture />
                  </div>
                </div>
                <p className="mt-1.5 text-[12.5px] text-[#54595d] italic">
                  <Segs segs={FEATURED_PICTURE_CAPTION} prefix="pic" renderVocab={renderVocab} />
                </p>
              </SectionBox>

              {/* Sister projects */}
              <section className="mt-3 rounded-sm border border-[#c8ccd1] bg-[#f8f9fa] p-3">
                <h3 className="font-wiki text-[15px] font-bold">Dự án liên quan</h3>
                <p className="mt-0.5 text-[12px] text-[#54595d]">
                  Wikipedia được vận hành bởi <span className="wiki-link-plain">Quỹ Wikimedia</span>, tổ chức cũng điều hành
                  nhiều dự án anh em khác:
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 @2xl:grid-cols-4">
                  {SISTER_PROJECTS.map((project) => (
                    <div key={project.name} className="flex cursor-pointer items-center gap-2">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[13px] font-bold text-white"
                        style={{ backgroundColor: project.color }}
                      >
                        {project.glyph}
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="wiki-link-plain block text-[12.5px] font-semibold">{project.name}</span>
                        <span className="block truncate text-[10.5px] text-[#54595d]">{project.desc}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Other languages */}
              <section className="mt-3 rounded-sm border border-[#c8ccd1] p-3">
                <h3 className="font-wiki text-[15px] font-bold">Wikipedia ngôn ngữ khác</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed">
                  {OTHER_LANGUAGES.map((lang, i) => (
                    <span key={lang}>
                      {i > 0 && <span className="text-[#a2a9b1]"> · </span>}
                      <span className="wiki-link-plain">{lang}</span>
                    </span>
                  ))}
                </p>
              </section>

              {/* Page footer */}
              <footer className="mt-4 border-t border-[#eaecf0] pt-3 pb-1 text-[11px] leading-relaxed text-[#54595d]">
                <p>Trang này được sửa đổi lần cuối vào ngày 11 tháng 7 năm 2026, lúc 09:14.</p>
                <p className="mt-1">
                  Văn bản được phát hành theo <span className="wiki-link-plain">Giấy phép Creative Commons Ghi công - Chia sẻ
                  tương tự</span>; các điều khoản bổ sung có thể được áp dụng.
                </p>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {[
                    'Quy định quyền riêng tư',
                    'Giới thiệu Wikipedia',
                    'Lời phủ nhận',
                    'Liên hệ',
                    'Quy tắc ứng xử',
                    'Lập trình viên',
                    'Thống kê',
                    'Tuyên bố về cookie',
                    'Phiên bản di động',
                  ].map((link) => (
                    <span key={link} className="wiki-link-plain">
                      {link}
                    </span>
                  ))}
                </p>
              </footer>
            </div>
          </main>
        </div>

        {/* "Giao diện" appearance sidebar, shown when the browser is wide enough */}
        {!appearanceHidden && (
          <aside className="hidden w-[200px] shrink-0 @4xl:block" aria-label="Giao diện">
            <div className="sticky top-0 py-3 pr-4 pl-1">
              <div className="flex items-center justify-between pb-1.5">
                <h2 className="text-[13px] font-bold text-[#202122]">Giao diện</h2>
                <button
                  type="button"
                  onClick={() => setAppearanceHidden(true)}
                  className="cursor-pointer rounded-sm bg-[#eaecf0] px-1.5 py-0.5 text-[12px] text-[#202122] hover:bg-[#dde0e5]"
                >
                  ẩn
                </button>
              </div>
              <AppearanceGroup
                label="Văn bản"
                name="wiki-appearance-text"
                value={textSize}
                onChange={setTextSize}
                options={[
                  { value: 'small', label: 'Nhỏ' },
                  { value: 'standard', label: 'Tiêu chuẩn' },
                  { value: 'large', label: 'Lớn' },
                ]}
              />
              <AppearanceGroup
                label="Chiều rộng"
                name="wiki-appearance-width"
                value={pageWidth}
                onChange={setPageWidth}
                options={[
                  { value: 'standard', label: 'Tiêu chuẩn' },
                  { value: 'wide', label: 'Rộng' },
                ]}
              />
              <AppearanceGroup
                label="Màu (thử nghiệm)"
                name="wiki-appearance-color"
                value={colorMode}
                onChange={setColorMode}
                options={[
                  { value: 'auto', label: 'Tự động' },
                  { value: 'light', label: 'Sáng' },
                  { value: 'dark', label: 'Tối' },
                ]}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
