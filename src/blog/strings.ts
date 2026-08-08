/**
 * UI copy for blog chrome, in both languages.
 *
 * Deliberately separate from src/i18n/translations.ts: that catalog is consumed
 * through React context and localStorage, neither of which exists during a
 * static render. Here the language is a property of the URL, so it can just be
 * an argument.
 */
import type { Lang } from '../content/publish.config'

export interface BlogStrings {
  blog: string
  indexTitle: string
  indexDescription: string
  indexHeading: string
  indexSubheading: string
  toc: string
  faq: string
  related: string
  aboutAuthor: string
  ctaHeading: string
  ctaBody: string
  ctaButton: string
  ctaSecondary: string
  backToBlog: string
  publishedOn: string
  updatedOn: string
  readingTime: (minutes: number) => string
  otherLanguage: string
  otherLanguageLabel: string
  home: string
  empty: string
  skipToContent: string
  menu: string
}

const vi: BlogStrings = {
  blog: 'Blog',
  indexTitle: 'Blog Merid, học từ vựng tiếng Anh khi lướt web',
  indexDescription:
    'Mình viết về cách học từ vựng tiếng Anh thụ động khi đọc web tiếng Việt, về extension Merid, và về những thứ mình học được khi tự làm sản phẩm.',
  indexHeading: 'Blog',
  indexSubheading:
    'Ghi chép về học từ vựng tiếng Anh khi đọc web tiếng Việt, và về chuyện tự làm Merid.',
  toc: 'Nội dung bài viết',
  faq: 'Câu hỏi thường gặp',
  related: 'Bài liên quan',
  aboutAuthor: 'Về tác giả',
  ctaHeading: 'Thử Merid trên trang bạn đang đọc',
  ctaBody:
    'Merid thay vài từ tiếng Việt bằng từ tiếng Anh ngay trên trang bạn mở hằng ngày. Miễn phí, chạy trên máy bạn.',
  ctaButton: 'Thêm Merid vào Chrome',
  ctaSecondary: 'Xem demo',
  backToBlog: 'Quay lại blog',
  publishedOn: 'Đăng ngày',
  updatedOn: 'Cập nhật',
  readingTime: (m) => `${m} phút đọc`,
  otherLanguage: '/en/blog',
  otherLanguageLabel: 'English',
  home: 'Trang chủ',
  empty: 'Chưa có bài nào. Bài đầu tiên sắp lên.',
  skipToContent: 'Tới nội dung chính',
  menu: 'Menu',
}

const en: BlogStrings = {
  blog: 'Blog',
  indexTitle: 'Merid blog, learning English vocabulary while you browse',
  indexDescription:
    'Notes on passive English vocabulary learning, on building the Merid Chrome extension as a solo student, and on what actually stuck.',
  indexHeading: 'Blog',
  indexSubheading:
    'Notes on picking up English vocabulary while reading, and on building Merid on my own.',
  toc: 'On this page',
  faq: 'Frequently asked questions',
  related: 'Related posts',
  aboutAuthor: 'About the author',
  ctaHeading: 'Try Merid on the page you are reading',
  ctaBody:
    'Merid swaps a few words on the pages you already open for English vocabulary worth knowing. Free, and it runs on your own machine.',
  ctaButton: 'Add Merid to Chrome',
  ctaSecondary: 'See the demo',
  backToBlog: 'Back to the blog',
  publishedOn: 'Published',
  updatedOn: 'Updated',
  readingTime: (m) => `${m} min read`,
  otherLanguage: '/blog',
  otherLanguageLabel: 'Tiếng Việt',
  home: 'Home',
  empty: 'No posts yet. The first one is on its way.',
  skipToContent: 'Skip to main content',
  menu: 'Menu',
}

export const BLOG_STRINGS: Record<Lang, BlogStrings> = { vi, en }

/** Date formatting that matches how each language actually writes dates. */
export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (lang === 'vi') {
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
