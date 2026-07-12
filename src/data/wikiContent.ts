// Content for the interactive Trang Chính recreation in the live demo.
// Prose is stored as inline segments so English vocabulary can be swapped
// into the middle of realistic Vietnamese encyclopedia text, exactly the way
// the extension rewrites a real page.

export type Seg =
  | { t: 'text'; s: string }
  | { t: 'link'; s: string } // blue wiki link
  | { t: 'b'; s: string }
  | { t: 'i'; s: string }
  | { t: 'vocab'; id: string } // interactive word, keyed into VOCAB

const text = (s: string): Seg => ({ t: 'text', s })
const link = (s: string): Seg => ({ t: 'link', s })
const b = (s: string): Seg => ({ t: 'b', s })
const vocab = (id: string): Seg => ({ t: 'vocab', id })

/** "Bài viết chọn lọc": paragraphs of the featured article. */
export const FEATURED_ARTICLE: Seg[][] = [
  [
    b('Vịnh Hạ Long'),
    text(' là một vịnh nhỏ thuộc phần bờ tây '),
    link('vịnh Bắc Bộ'),
    text(' tại khu vực biển Đông Bắc '),
    link('Việt Nam'),
    text(', bao gồm vùng biển đảo thuộc thành phố '),
    link('Hạ Long'),
    text(' của tỉnh '),
    link('Quảng Ninh'),
    text('. Nơi đây có gần 2.000 hòn đảo đá vôi lớn nhỏ được hình thành qua quá trình karst '),
    vocab('ancient'),
    text(' kéo dài hơn 500 triệu năm, tạo nên một '),
    vocab('phenomenon'),
    text(' địa chất hiếm gặp trên thế giới.'),
  ],
  [
    text('Năm 1994, '),
    link('UNESCO'),
    text(' lần đầu công nhận vịnh Hạ Long là '),
    vocab('heritage'),
    text(' thiên nhiên thế giới nhờ giá trị cảnh quan '),
    vocab('organic'),
    text(' đặc sắc. Ngày nay, chính quyền địa phương đang triển khai nhiều chương trình nhằm '),
    vocab('preserve'),
    text(' hệ sinh thái '),
    vocab('significant'),
    text(' này song song với phát triển du lịch bền vững.'),
  ],
]

/** "Bạn có biết": each bullet is rendered after a leading ellipsis. */
export const DID_YOU_KNOW: Seg[][] = [
  [
    text('cầu '),
    link('Long Biên'),
    text(' do công ty Daydé & Pillé thiết kế và được '),
    vocab('construct'),
    text(' trong giai đoạn 1898–1902?'),
  ],
  [
    link('Văn Miếu – Quốc Tử Giám'),
    text(', trường đại học đầu tiên của Việt Nam, được '),
    vocab('establish'),
    text(' từ năm 1076?'),
  ],
  [
    text('hang '),
    link('Sơn Đoòng'),
    text(' chứa một hệ thống sông ngầm '),
    vocab('elaborate'),
    text(' cùng khu rừng nguyên sinh nằm ngay trong lòng hang?'),
  ],
  [
    text('trên trang này, một vài từ tiếng Việt đã được '),
    vocab('replace'),
    text(' bằng từ vựng tiếng Anh, và bạn có thể di chuột lên chúng để xem '),
    vocab('interpret'),
    text(' chi tiết?'),
  ],
]

/** "Tin tức" bullets. */
export const IN_THE_NEWS: Seg[][] = [
  [
    text('Các nhà thiên văn học '),
    vocab('discover'),
    text(' một sao chổi mới có thể quan sát bằng mắt thường từ Bắc bán cầu.'),
  ],
  [
    text('Hội nghị khí hậu khu vực bế mạc với cam kết '),
    vocab('expand'),
    text(' diện tích rừng ngập mặn tại '),
    link('Đông Nam Á'),
    text('.'),
  ],
  [
    text('Đội tuyển bóng đá quốc gia '),
    link('Việt Nam'),
    text(' giành chiến thắng '),
    vocab('significant'),
    text(' tại vòng loại '),
    link('Cúp bóng đá châu Á'),
    text('.'),
  ],
]

/** "Ngày này năm xưa": the snapshot date and its events. */
export const ON_THIS_DAY: { date: string; events: Seg[][] } = {
  date: '11 tháng 7',
  events: [
    [
      b('1405'),
      text(' – '),
      link('Trịnh Hòa'),
      text(' dẫn đầu hạm đội nhà '),
      link('Minh'),
      text(' khởi hành chuyến thám hiểm hàng hải đầu tiên đến Đông Nam Á và '),
      link('Ấn Độ Dương'),
      text('.'),
    ],
    [
      b('1962'),
      text(' – Vệ tinh '),
      link('Telstar'),
      text(' thực hiện buổi truyền hình trực tiếp xuyên '),
      link('Đại Tây Dương'),
      text(' đầu tiên, mở đầu kỷ nguyên truyền thông vệ tinh có '),
      vocab('influence'),
      text(' sâu rộng.'),
    ],
    [
      b('1987'),
      text(' – Dân số thế giới đạt mốc 5 tỷ người; ngày này về sau được chọn làm '),
      link('Ngày Dân số Thế giới'),
      text('.'),
    ],
    [
      b('1995'),
      text(' – '),
      link('Việt Nam'),
      text(' và '),
      link('Hoa Kỳ'),
      text(' tuyên bố bình thường hóa quan hệ ngoại giao.'),
    ],
  ],
}

/** Caption under "Hình ảnh chọn lọc". */
export const FEATURED_PICTURE_CAPTION: Seg[] = [
  text('Ruộng bậc thang '),
  link('Mù Cang Chải'),
  text(' (tỉnh '),
  link('Yên Bái'),
  text(') vào mùa lúa chín. Danh thắng này là điểm đến '),
  vocab('renowned'),
  text(' bậc nhất của vùng Tây Bắc và được xếp hạng di tích quốc gia đặc biệt.'),
]

/** "Dự án liên quan": sister projects with their Vietnamese taglines. */
export const SISTER_PROJECTS: { name: string; desc: string; glyph: string; color: string }[] = [
  { name: 'Commons', desc: 'Kho tư liệu chung', glyph: 'C', color: '#006699' },
  { name: 'Wiktionary', desc: 'Từ điển mở', glyph: 'W', color: '#575d63' },
  { name: 'Wikibooks', desc: 'Tủ sách mở', glyph: 'B', color: '#2e7d32' },
  { name: 'Wikinews', desc: 'Nguồn tin tức mở', glyph: 'N', color: '#546e7a' },
  { name: 'Wikiquote', desc: 'Bộ sưu tập danh ngôn', glyph: 'Q', color: '#8d6e63' },
  { name: 'Wikisource', desc: 'Văn thư lưu trữ mở', glyph: 'S', color: '#3f51b5' },
  { name: 'Wikivoyage', desc: 'Cẩm nang du lịch mở', glyph: 'V', color: '#00838f' },
  { name: 'Wikidata', desc: 'Cơ sở tri thức chung', glyph: 'D', color: '#990000' },
]

/** Bottom "Ngôn ngữ khác" row. */
export const OTHER_LANGUAGES = [
  'English',
  'Français',
  'Deutsch',
  'Español',
  '日本語',
  '한국어',
  '中文',
  'Русский',
  'Bahasa Indonesia',
  'ไทย',
] as const

/** Every vocab occurrence on the page, in reading order (repeats included). */
export const ALL_VOCAB_OCCURRENCES: string[] = [
  ...FEATURED_ARTICLE,
  ...DID_YOU_KNOW,
  ...IN_THE_NEWS,
  ...ON_THIS_DAY.events,
  FEATURED_PICTURE_CAPTION,
].flatMap((segs) => segs.filter((s): s is { t: 'vocab'; id: string } => s.t === 'vocab').map((s) => s.id))
