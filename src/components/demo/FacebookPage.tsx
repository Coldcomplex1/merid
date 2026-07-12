import type { ReactNode } from 'react'
import { FB_CONTACTS, FB_POSTS, FB_STORIES, type FbPost } from '../../data/fbContent'
import type { Seg } from '../../data/wikiContent'
import type { RenderVocab } from './WikiPage'

interface FacebookPageProps {
  renderVocab: RenderVocab
}

/* ── Inline segment renderer (Facebook-blue links) ─────────────────────── */

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
              <span key={key} className="cursor-pointer font-semibold text-[#216fdb] hover:underline">
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

function CaveImage() {
  return (
    <svg viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice" className="block h-44 w-full sm:h-56" aria-hidden="true">
      <rect width="480" height="220" fill="#0d1620" />
      <path d="M0 0h480v220H0Z" fill="#101c2a" />
      <path d="M0 0 C120 60 150 40 240 90 C330 140 380 120 480 180 L480 0 Z" fill="#0a121b" />
      <path d="M0 220 C140 170 220 200 480 150 L480 220 Z" fill="#1b2836" />
      <path d="M210 0 L280 0 L330 220 L160 220 Z" fill="#f4e9c8" opacity="0.14" />
      <path d="M228 0 L262 0 L300 220 L190 220 Z" fill="#f4e9c8" opacity="0.16" />
      <ellipse cx="245" cy="205" rx="85" ry="9" fill="#f4e9c8" opacity="0.18" />
      <path d="M60 0 q6 44 -4 78 M92 0 q4 30 -2 52 M410 0 q-6 50 4 84" stroke="#223349" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="238" cy="196" r="3" fill="#ffd98a" />
      <circle cx="256" cy="199" r="2.4" fill="#ffd98a" />
    </svg>
  )
}

function CoffeeImage() {
  return (
    <svg viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice" className="block h-44 w-full sm:h-56" aria-hidden="true">
      <rect width="480" height="220" fill="#f0e3d0" />
      <rect y="130" width="480" height="90" fill="#8a5a3b" />
      <rect y="130" width="480" height="8" fill="#734a30" />
      <rect x="70" y="96" width="120" height="44" rx="4" fill="#3f6252" />
      <rect x="82" y="104" width="96" height="6" rx="3" fill="#f0e3d0" opacity="0.5" />
      <rect x="82" y="116" width="72" height="6" rx="3" fill="#f0e3d0" opacity="0.35" />
      <path d="M290 88h74a8 8 0 0 1 8 8v28a26 26 0 0 1-26 26h-38a26 26 0 0 1-26-26V96a8 8 0 0 1 8-8Z" fill="#fdfbf7" />
      <path d="M372 96h14a16 16 0 0 1 0 32h-10" fill="none" stroke="#fdfbf7" strokeWidth="8" />
      <ellipse cx="327" cy="96" rx="37" ry="7" fill="#6b4a32" />
      <path d="M318 62 q6 10 0 20 M336 56 q6 12 0 24" stroke="#c9b8a4" strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx="327" cy="158" rx="58" ry="7" fill="#5e3d27" opacity="0.35" />
    </svg>
  )
}

function LanternsImage() {
  return (
    <svg viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice" className="block h-44 w-full sm:h-56" aria-hidden="true">
      <rect width="480" height="220" fill="#182339" />
      <rect y="150" width="480" height="70" fill="#0f1828" />
      <path d="M0 150 C140 138 340 138 480 150 L480 220 L0 220 Z" fill="#233754" />
      <rect x="30" y="70" width="90" height="80" fill="#2c3f5c" />
      <rect x="140" y="58" width="110" height="92" fill="#31465f" />
      <rect x="270" y="72" width="95" height="78" fill="#2c3f5c" />
      <rect x="385" y="62" width="75" height="88" fill="#31465f" />
      {[52, 96, 168, 214, 292, 336, 404, 438].map((x, i) => (
        <rect key={x} x={x} y={i % 2 ? 92 : 86} width="14" height="18" rx="2" fill="#f7c948" opacity="0.85" />
      ))}
      <path d="M0 34 Q240 66 480 30" stroke="#3a4f70" strokeWidth="2" fill="none" />
      {[60, 140, 225, 310, 395].map((x, i) => (
        <g key={x}>
          <ellipse cx={x} cy={i % 2 ? 52 : 46} rx="13" ry="16" fill={['#e4573d', '#f7c948', '#d6435c', '#57a15c', '#e4573d'][i]} />
          <rect x={x - 4} y={(i % 2 ? 52 : 46) + 14} width="8" height="5" fill="#9c2f22" />
        </g>
      ))}
      <ellipse cx="240" cy="185" rx="180" ry="14" fill="#f7c948" opacity="0.08" />
    </svg>
  )
}

const POST_IMAGES: Record<NonNullable<FbPost['image']>, () => ReactNode> = {
  cave: CaveImage,
  coffee: CoffeeImage,
  lanterns: LanternsImage,
}

/* ── Chrome-less Facebook UI pieces ────────────────────────────────────── */

function VerifiedBadge() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" className="ml-1 inline-block shrink-0 align-[-2px]" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1877f2" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
      <g fill="none" stroke="#65676b" strokeWidth="1.6">
        <circle cx="12" cy="12" r="10" />
        <ellipse cx="12" cy="12" rx="4.5" ry="10" />
        <path d="M2 12h20" />
      </g>
    </svg>
  )
}

function LikeChip() {
  return (
    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#1877f2] ring-2 ring-white">
      <svg viewBox="0 0 24 24" width="10" height="10" fill="#fff" aria-hidden="true">
        <path d="M2 10h3v11H2zM7 21h9.4a2 2 0 0 0 1.9-1.4l2.5-7A2 2 0 0 0 18.9 10H14V5a2.4 2.4 0 0 0-2.4-2.4L11 2 7 10z" />
      </svg>
    </span>
  )
}

function HeartChip() {
  return (
    <span className="-ml-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#f0284a] ring-2 ring-white">
      <svg viewBox="0 0 24 24" width="10" height="10" fill="#fff" aria-hidden="true">
        <path d="M12 21s-7.5-4.7-9.6-9A5.4 5.4 0 0 1 12 6.6 5.4 5.4 0 0 1 21.6 12c-2.1 4.3-9.6 9-9.6 9z" />
      </svg>
    </span>
  )
}

function ActionButton({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <button
      type="button"
      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-semibold text-[#65676b] transition-colors hover:bg-[#f2f2f2]"
    >
      {icon}
      {children}
    </button>
  )
}

function PostCard({ post, renderVocab }: { post: FbPost; renderVocab: RenderVocab }) {
  const Illustration = post.image ? POST_IMAGES[post.image] : null
  return (
    <article className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2.5 px-4 pt-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ backgroundColor: post.color }}
        >
          {post.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] leading-tight font-semibold text-[#050505]">
            {post.author}
            {post.verified && <VerifiedBadge />}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-[#65676b]">
            {post.time} · <GlobeIcon />
          </p>
        </div>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#65676b" aria-hidden="true" className="ml-auto shrink-0">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </div>

      <div className="space-y-2 px-4 py-3 text-[14.5px] leading-relaxed text-[#050505]" lang="vi">
        {post.body.map((para, i) => (
          <p key={i}>
            <Segs segs={para} prefix={`${post.id}-${i}`} renderVocab={renderVocab} />
          </p>
        ))}
      </div>

      {Illustration && <Illustration />}

      <div className="flex items-center justify-between px-4 py-2.5 text-[13px] text-[#65676b]">
        <span className="flex items-center gap-1.5">
          <span className="flex">
            <LikeChip />
            <HeartChip />
          </span>
          {post.likes}
        </span>
        <span>
          {post.comments} bình luận · {post.shares} lượt chia sẻ
        </span>
      </div>

      <div className="mx-4 border-t border-[#e4e6eb]" />

      <div className="flex px-2 py-1">
        <ActionButton
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10h3v11H3zM8 21h8.4a2 2 0 0 0 1.9-1.4l2.5-7A2 2 0 0 0 18.9 10H14V5a2.4 2.4 0 0 0-2.4-2.4L11 2 8 10z" />
            </svg>
          }
        >
          Thích
        </ActionButton>
        <ActionButton
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a8 8 0 0 1-8 8H4l1.6-3.2A8 8 0 1 1 21 12z" />
            </svg>
          }
        >
          Bình luận
        </ActionButton>
        <ActionButton
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 5l7 7-7 7v-4C7 15 4 17 3 20c0-6 3-10 11-11V5z" />
            </svg>
          }
        >
          Chia sẻ
        </ActionButton>
      </div>
    </article>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────── */

/** A recreation of the Facebook news feed. Layout only: highlight state and
 *  hover cards are injected through renderVocab, same contract as WikiPage. */
export default function FacebookPage({ renderVocab }: FacebookPageProps) {
  return (
    <div className="min-h-full bg-[#f0f2f5] pb-8" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      {/* Top navigation */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[#dddfe2] bg-white px-3 py-1.5 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1877f2] pb-0.5 text-[22px] font-bold text-white">
          f
        </span>
        <div className="hidden items-center gap-1.5 rounded-full bg-[#f0f2f5] px-3 py-1.5 text-[12px] text-[#65676b] sm:flex">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          Tìm kiếm trên Facebook
        </div>
        <div className="flex flex-1 items-center justify-center gap-1">
          <span className="relative flex h-9 w-14 items-center justify-center">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#1877f2" aria-hidden="true">
              <path d="M12 3l9 8h-2v9h-5v-6H10v6H5v-9H3z" />
            </svg>
            <span className="absolute inset-x-1 bottom-0 h-[3px] rounded-full bg-[#1877f2]" />
          </span>
          <span className="flex h-9 w-14 items-center justify-center">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#65676b" aria-hidden="true">
              <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm6 4v6l5-3z" />
            </svg>
          </span>
          <span className="flex h-9 w-14 items-center justify-center">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#65676b" aria-hidden="true">
              <path d="M4 9l8-6 8 6v11a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1zM2 9h20" stroke="#65676b" strokeWidth="0" />
              <path d="M12 3L2 10h3v10a1 1 0 0 0 1 1h5v-6h2v6h5a1 1 0 0 0 1-1V10h3z" />
            </svg>
          </span>
          <span className="flex h-9 w-14 items-center justify-center">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#65676b" aria-hidden="true">
              <circle cx="8" cy="8" r="3.2" />
              <circle cx="16.5" cy="9" r="2.6" />
              <path d="M2.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5zM13.6 18.6c.5-2.4 2-3.9 4-3.9 1.9 0 3.4 1.4 3.9 3.9z" />
            </svg>
          </span>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e4e6eb]">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="#050505" aria-hidden="true">
            <path d="M12 2a8 8 0 0 0-8 7.7c0 4.4 3.4 7.2 8 7.2 1 0 2-.1 2.9-.4l3 1.5-.3-3A7.6 7.6 0 0 0 20 9.7 8 8 0 0 0 12 2z" />
          </svg>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e4e6eb]">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="#050505" aria-hidden="true">
            <path d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22zm7-5.5v-1l-1.5-1.6V9.6A5.6 5.6 0 0 0 13 4V3a1 1 0 1 0-2 0v1a5.6 5.6 0 0 0-4.5 5.6v4.3L5 15.5v1z" />
          </svg>
        </span>
        <span className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#7fb3f5] to-[#2f6fd1]" />
      </div>

      <div className="mx-auto flex w-full max-w-[1120px] items-start justify-center gap-6 px-3 pt-4 sm:px-4">
        {/* Left menu (only when the browser mockup is wide enough) */}
        <aside className="sticky top-16 hidden w-52 shrink-0 space-y-1 xl:block">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/5">
            <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#7fb3f5] to-[#2f6fd1]" />
            <span className="text-[14px] font-semibold text-[#050505]">Hải Đăng</span>
          </div>
          {(
            [
              ['#1877f2', 'Bạn bè'],
              ['#2abba7', 'Kỷ niệm'],
              ['#a033ff', 'Đã lưu'],
              ['#f7b928', 'Nhóm'],
              ['#f0284a', 'Video'],
            ] as const
          ).map(([color, label]) => (
            <div
              key={label}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/5"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {label.charAt(0)}
              </span>
              <span className="text-[14px] font-medium text-[#050505]">{label}</span>
            </div>
          ))}
        </aside>

        <div className="w-full max-w-[600px] min-w-0 space-y-4">
        {/* Stories */}
        <div className="flex gap-2 overflow-hidden">
          <div className="relative h-40 w-24 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="h-[104px] bg-gradient-to-br from-[#cfd8e6] to-[#9fb1c9]" />
            <span className="absolute left-1/2 top-[88px] flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-[#1877f2] text-lg leading-none font-bold text-white ring-4 ring-white">
              +
            </span>
            <p className="mt-4 text-center text-[11px] font-semibold text-[#050505]">Tạo tin</p>
          </div>
          {FB_STORIES.map((story) => (
            <div
              key={story.name}
              className="relative h-40 w-24 shrink-0 overflow-hidden rounded-xl shadow-sm"
              style={{ background: `linear-gradient(160deg, ${story.from}, ${story.to})` }}
            >
              <span className="absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-[11px] font-bold text-white ring-2 ring-[#1877f2]">
                {story.initials}
              </span>
              <p className="absolute bottom-2 left-2 right-2 text-[11px] leading-tight font-semibold text-white drop-shadow">
                {story.name}
              </p>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-[#7fb3f5] to-[#2f6fd1]" />
            <div className="flex-1 cursor-pointer rounded-full bg-[#f0f2f5] px-4 py-2 text-[14px] text-[#65676b] transition-colors hover:bg-[#e4e6eb]">
              Bạn đang nghĩ gì thế?
            </div>
          </div>
          <div className="mt-3 flex border-t border-[#e4e6eb] pt-2">
            {(
              [
                ['#f0284a', 'Video trực tiếp'],
                ['#45bd62', 'Ảnh/video'],
                ['#f7b928', 'Cảm xúc'],
              ] as const
            ).map(([dot, label]) => (
              <button
                key={label}
                type="button"
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-semibold text-[#65676b] transition-colors hover:bg-[#f2f2f2]"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Feed */}
        {FB_POSTS.map((post) => (
          <PostCard key={post.id} post={post} renderVocab={renderVocab} />
        ))}
        </div>

        {/* Contacts (only when the browser mockup is wide enough) */}
        <aside className="sticky top-16 hidden w-52 shrink-0 2xl:block">
          <p className="px-2 pb-1 text-[14px] font-semibold text-[#65676b]">Người liên hệ</p>
          {FB_CONTACTS.map((contact) => (
            <div
              key={contact.name}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/5"
            >
              <span className="relative shrink-0">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{ backgroundColor: contact.color }}
                >
                  {contact.initials}
                </span>
                <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-[#31a24c] ring-2 ring-[#f0f2f5]" />
              </span>
              <span className="text-[14px] font-medium text-[#050505]">{contact.name}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}
