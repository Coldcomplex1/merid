import type { ReactNode } from 'react'
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
    <svg viewBox="0 0 480 160" preserveAspectRatio="xMidYMid slice" className="block h-40 w-full sm:h-48" aria-hidden="true">
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
  <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-gold-400 text-[11px] text-navy-900">★</span>
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

/* ── The page ──────────────────────────────────────────────────────────── */

/**
 * Hand-built recreation of vi.wikipedia.org "Trang Chính" (Vector 2022 skin).
 * All prose flows through `renderVocab`, which the demo uses to swap
 * Vietnamese words for interactive English vocabulary.
 */
export default function WikiPage({ renderVocab }: WikiPageProps) {
  return (
    <div lang="vi" className="bg-white font-sans text-[#202122]">
      {/* Site header */}
      <header className="flex items-center gap-3 border-b border-[#eaecf0] px-3 py-1.5 sm:px-4">
        <span className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-[#eaecf0]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="#54595d" aria-hidden="true">
            <path d="M2 4h16v1.6H2V4zm0 5.2h16v1.6H2V9.2zm0 5.2h16V16H2v-1.6z" />
          </svg>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <GlobeMark />
          <span className="hidden leading-none sm:block">
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
            className="hidden h-8 shrink-0 cursor-pointer rounded-r-sm border border-l-0 border-[#a2a9b1] bg-[#f8f9fa] px-3 text-[13px] font-semibold hover:bg-[#eaecf0] sm:block"
          >
            Tìm kiếm
          </button>
        </div>
        <nav className="hidden shrink-0 items-center gap-3 text-[13px] md:flex">
          <span className="wiki-link-plain">Quyên góp</span>
          <span className="wiki-link-plain">Tạo tài khoản</span>
          <span className="wiki-link-plain">Đăng nhập</span>
          <span className="cursor-pointer text-[#54595d]">⋯</span>
        </nav>
      </header>

      {/* Article tab bar */}
      <nav className="flex items-center justify-between border-b border-[#eaecf0] px-3 text-[13px] sm:px-4">
        <div className="flex">
          <span className="cursor-pointer border-b-2 border-[#36c] px-2.5 py-2 font-semibold">Trang Chính</span>
          <span className="wiki-link-plain px-2.5 py-2">Thảo luận</span>
        </div>
        <div className="flex items-center">
          <span className="cursor-pointer border-b-2 border-[#36c] px-2.5 py-2 font-semibold">Đọc</span>
          <span className="wiki-link-plain hidden px-2.5 py-2 sm:block">Xem mã nguồn</span>
          <span className="wiki-link-plain hidden px-2.5 py-2 sm:block">Xem lịch sử</span>
          <span className="wiki-link-plain px-2.5 py-2">Công cụ</span>
        </div>
      </nav>

      <main className="px-3 py-4 sm:px-4">
        {/* Welcome banner */}
        <div className="rounded-sm border border-[#a7d7f9] bg-gradient-to-b from-[#f0f6fa] to-white px-4 py-4 text-center">
          <h2 className="font-wiki text-[21px] leading-snug sm:text-[24px]">
            Chào mừng đến với <span className="wiki-link-plain font-bold">Wikipedia</span> tiếng Việt!
          </h2>
          <p className="mt-1 text-[13px] text-[#54595d]">
            Bách khoa toàn thư mở, nơi mọi người đều có thể đóng góp
          </p>
          <p className="mt-1.5 text-[13.5px]">
            Hiện có <b>1.298.542</b> bài viết bằng tiếng Việt
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed">
            {['Lịch sử', 'Địa lý', 'Khoa học', 'Công nghệ', 'Nghệ thuật', 'Văn hóa', 'Tôn giáo', 'Thể thao'].map(
              (portal, i) => (
                <span key={portal}>
                  {i > 0 && <span className="text-[#a2a9b1]"> · </span>}
                  <span className="wiki-link-plain">{portal}</span>
                </span>
              ),
            )}
          </p>
        </div>

        {/* Main two-column section grid */}
        <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
          <SectionBox title="Bài viết chọn lọc" icon={StarIcon} headerBg="#faf1d5" border="#e2d9b8">
            <div className="float-right mb-1 ml-3 w-[112px] sm:w-[132px]">
              <div className="border border-[#c8ccd1] bg-[#f8f9fa] p-[3px]">
                <div className="h-[80px] sm:h-[94px]">
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

          <SectionBox title="Bạn có biết" icon={QuestionIcon} headerBg="#e7f0f7" border="#c8d8e8">
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
                <div className="h-[64px]">
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
                — <span className="wiki-link-plain">Ngày Dân số Thế giới</span>
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
            <TerracesPicture />
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
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
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
            Văn bản được phát hành theo <span className="wiki-link-plain">Giấy phép Creative Commons Ghi công – Chia sẻ
            tương tự</span>; các điều khoản bổ sung có thể được áp dụng.
          </p>
        </footer>
      </main>
    </div>
  )
}
