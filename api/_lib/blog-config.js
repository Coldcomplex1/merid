// Everything the blog needs to know about itself, in one file.
//
// Plain ESM so the render function, the admin UI and the migration script all
// read the same values. Nothing here is a secret: the Firebase project id is
// public (see src/lib/firebase.ts) and the rest is URLs and display strings.

export const SITE_URL = 'https://merid.site'

export const CWS_URL =
  'https://chromewebstore.google.com/detail/merid/ggfpandbibalomfbappkblppmffncoeo'

export const LINKEDIN_URL = 'https://www.linkedin.com/in/vanquyetdoan/'

/** Public Firebase project id, used to build Firestore REST URLs. */
export const FIREBASE_PROJECT_ID = 'merid-49dd5'

/** URL path segments. 'vie' rather than 'vi' because that is the chosen URL shape. */
export const LANGS = ['vie', 'en']

/** The hand-written pages outside the blog that are worth indexing.
 *
 *  Read by the sitemap (api/blog-render.js) and by scripts/prerender-seo.mjs,
 *  which gives each of them a canonical of its own. Adding a public page means
 *  adding it here; forgetting is what left these four claiming to be duplicates
 *  of the homepage.
 *
 *  /welcome and /goodbye are deliberately absent: the extension opens them on
 *  install and uninstall, so they need a correct canonical but do not belong in
 *  a sitemap. Routes behind auth are absent too, and public/robots.txt
 *  disallows them. */
export const MARKETING_PATHS = [
  '/tutorial',
  '/create-dataset',
  '/api-key-guide',
  '/privacy-policy',
]

export const DEFAULT_AUTHOR = 'Van Quyet Doan'

/** Fallback social card, used when a post declares no cover image. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-card.jpg`

/** BCP 47 codes, for inLanguage and hreflang. */
export const LOCALE = { vie: 'vi-VN', en: 'en-US' }

/** og:locale wants the underscore form. */
export const OG_LOCALE = { vie: 'vi_VN', en: 'en_US' }

/** The blog index for a language. Vietnamese is the site default and lives at /blog. */
export function indexPath(lang) {
  return lang === 'vie' ? '/blog' : `/blog/${lang}`
}

/** A post's URL path. */
export function postPath(lang, slug) {
  return `/blog/${lang}/${slug}`
}

export function absolute(path) {
  return `${SITE_URL}${path}`
}

/** The author box, and the Person node in every post's JSON-LD. */
export const AUTHOR = {
  name: DEFAULT_AUTHOR,
  url: `${SITE_URL}/blog`,
  sameAs: [CWS_URL, LINKEDIN_URL],
  bio: {
    vie: 'Sinh viên ở TP.HCM. Mình làm Merid vì đã bỏ dở mọi app học từ vựng từng tải về.',
    en: 'Student in Ho Chi Minh City. I built Merid because I quit every vocabulary app I ever downloaded.',
  },
}

/** Chrome for the public blog pages, per language. */
export const STRINGS = {
  vie: {
    blog: 'Blog',
    indexTitle: 'Blog Merid, học từ vựng tiếng Anh khi lướt web',
    indexDescription:
      'Mình viết về cách học từ vựng tiếng Anh thụ động khi đọc web tiếng Việt, về extension Merid, và về những thứ mình học được khi tự làm sản phẩm.',
    indexHeading: 'Blog',
    indexSubheading:
      'Ghi chép về học từ vựng tiếng Anh khi đọc web tiếng Việt, và về chuyện tự làm Merid.',
    toc: 'Nội dung bài viết',
    faq: 'Câu hỏi thường gặp',
    aboutAuthor: 'Về tác giả',
    ctaHeading: 'Thử Merid trên trang bạn đang đọc',
    ctaBody:
      'Merid thay vài từ tiếng Việt bằng từ tiếng Anh ngay trên trang bạn mở hằng ngày. Miễn phí, chạy trên máy bạn.',
    ctaButton: 'Thêm Merid vào Chrome',
    ctaSecondary: 'Xem demo',
    publishedOn: 'Đăng ngày',
    updatedOn: 'Cập nhật',
    readingTime: (m) => `${m} phút đọc`,
    otherLanguageLabel: 'English',
    home: 'Trang chủ',
    empty: 'Chưa có bài nào. Bài đầu tiên sắp lên.',
    skipToContent: 'Tới nội dung chính',
    notFoundTitle: 'Không tìm thấy bài viết',
    notFoundBody: 'Bài này không tồn tại, hoặc chưa được đăng.',
  },
  en: {
    blog: 'Blog',
    indexTitle: 'Merid blog, learning English vocabulary while you browse',
    indexDescription:
      'Notes on passive English vocabulary learning, on building the Merid Chrome extension as a solo student, and on what actually stuck.',
    indexHeading: 'Blog',
    indexSubheading:
      'Notes on picking up English vocabulary while reading, and on building Merid on my own.',
    toc: 'On this page',
    faq: 'Frequently asked questions',
    aboutAuthor: 'About the author',
    ctaHeading: 'Try Merid on the page you are reading',
    ctaBody:
      'Merid swaps a few words on the pages you already open for English vocabulary worth knowing. Free, and it runs on your own machine.',
    ctaButton: 'Add Merid to Chrome',
    ctaSecondary: 'See the demo',
    publishedOn: 'Published',
    updatedOn: 'Updated',
    readingTime: (m) => `${m} min read`,
    otherLanguageLabel: 'Tiếng Việt',
    home: 'Home',
    empty: 'No posts yet. The first one is on its way.',
    skipToContent: 'Skip to main content',
    notFoundTitle: 'Post not found',
    notFoundBody: 'This post does not exist, or has not been published yet.',
  },
}

/** Dates the way each language actually writes them. */
export function formatDate(iso, lang) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (lang === 'vie') {
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
