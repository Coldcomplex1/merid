// Content for the fake Facebook feed tab in the live demo. Posts are stored
// as inline segments (the same model wikiContent uses) so English vocabulary
// can be swapped into the middle of casual Vietnamese feed text, exactly the
// way the extension rewrites a real page.

import type { Seg } from './wikiContent'

const text = (s: string): Seg => ({ t: 'text', s })
const link = (s: string): Seg => ({ t: 'link', s })
const vocab = (id: string): Seg => ({ t: 'vocab', id })

export interface FbPost {
  id: string
  author: string
  initials: string
  /** Avatar background color. */
  color: string
  verified?: boolean
  /** Relative timestamp, Facebook style. */
  time: string
  /** Paragraphs of the post body. */
  body: Seg[][]
  /** Key of the inline SVG illustration rendered under the text, if any. */
  image?: 'cave' | 'coffee' | 'lanterns'
  likes: string
  comments: string
  shares: string
}

export interface FbStory {
  name: string
  initials: string
  from: string
  to: string
}

export const FB_STORIES: FbStory[] = [
  { name: 'Linh Chi', initials: 'LC', from: '#f78f5e', to: '#d6435c' },
  { name: 'Đức Huy', initials: 'ĐH', from: '#8f7be8', to: '#5b46c4' },
  { name: 'Mai Phương', initials: 'MP', from: '#57c785', to: '#2e8b57' },
  { name: 'Tuấn Kiệt', initials: 'TK', from: '#5ba8f5', to: '#2f6fd1' },
]

/** "Người liên hệ" list for the right-hand column on wide screens. */
export const FB_CONTACTS: { name: string; initials: string; color: string }[] = [
  { name: 'Ngọc Anh', initials: 'NA', color: '#8e6bbf' },
  { name: 'Thu Hà', initials: 'TH', color: '#00838f' },
  { name: 'Linh Chi', initials: 'LC', color: '#e4573d' },
  { name: 'Đức Huy', initials: 'ĐH', color: '#5b46c4' },
  { name: 'Mai Phương', initials: 'MP', color: '#2e8b57' },
  { name: 'Tuấn Kiệt', initials: 'TK', color: '#2f6fd1' },
]

export const FB_POSTS: FbPost[] = [
  {
    id: 'sondoong',
    author: 'Việt Nam Ơi',
    initials: 'VN',
    color: '#c0392b',
    verified: true,
    time: '3 giờ',
    body: [
      [
        text('Sáng nay đoàn thám hiểm đã '),
        vocab('discover'),
        text(' thêm một nhánh hang mới ngay trong lòng '),
        link('Sơn Đoòng'),
        text('. Trần hang cao tới mức mây có thể hình thành ngay bên trong, một '),
        vocab('phenomenon'),
        text(' mà cả thế giới chỉ ghi nhận được ở vài nơi.'),
      ],
      [
        text('Hệ thạch nhũ '),
        vocab('ancient'),
        text(' ở đây đã hơn 3 triệu năm tuổi. Ai từng ước một lần được đứng dưới "bức tường Việt Nam" huyền thoại thì để lại một like nhé! 🇻🇳'),
      ],
    ],
    image: 'cave',
    likes: '12K',
    comments: '1,4K',
    shares: '2,1K',
  },
  {
    id: 'coffee',
    author: 'Ngọc Anh',
    initials: 'NA',
    color: '#8e6bbf',
    time: '5 giờ',
    body: [
      [
        text('Cuối tuần tự thưởng cho mình một buổi sáng '),
        vocab('solitude'),
        text(' đúng nghĩa: một cuốn sách, một ly cà phê muối và không một tiếng thông báo điện thoại nào. 📵☕'),
      ],
      [
        text('Hoá ra cách nghỉ ngơi '),
        vocab('organic'),
        text(' nhất lại đơn giản vậy đó. Mọi người thử chưa?'),
      ],
    ],
    image: 'coffee',
    likes: '482',
    comments: '36',
    shares: '4',
  },
  {
    id: 'hoian',
    author: 'Tin Nhanh 24h',
    initials: 'T24',
    color: '#1565c0',
    verified: true,
    time: '7 giờ',
    body: [
      [
        text('NÓNG: '),
        link('Hội An'),
        text(' vừa được một tạp chí du lịch quốc tế bình chọn là điểm đến '),
        vocab('renowned'),
        text(' nhất châu Á năm nay.'),
      ],
      [
        text('Thành phố cho biết sẽ '),
        vocab('expand'),
        text(' khu phố đi bộ và dành toàn bộ nguồn thu từ vé tham quan để '),
        vocab('preserve'),
        text(' khu phố cổ, nơi được xem là '),
        vocab('heritage'),
        text(' sống của thương cảng miền Trung.'),
      ],
    ],
    image: 'lanterns',
    likes: '8,1K',
    comments: '923',
    shares: '1,2K',
  },
  {
    id: 'english-tip',
    author: 'Học Tiếng Anh Mỗi Ngày',
    initials: 'HT',
    color: '#2e7d32',
    verified: true,
    time: '1 ngày',
    body: [
      [
        text('Mẹo nhỏ hôm nay: đừng dịch từng chữ. Một '),
        vocab('metaphor'),
        text(' hay sẽ không thể '),
        vocab('interpret'),
        text(' theo nghĩa đen được đâu!'),
      ],
      [
        text('Ví dụ "break the ice" chẳng liên quan gì tới nước đá. Người bản xứ dùng nó để nói về việc mở đầu câu chuyện, và chính những cách diễn đạt '),
        vocab('elaborate'),
        text(' kiểu này làm tiếng Anh của bạn tự nhiên hơn. Lưu lại để học dần nha! 📚'),
      ],
    ],
    likes: '2,3K',
    comments: '154',
    shares: '310',
  },
  {
    id: 'school',
    author: 'Thu Hà',
    initials: 'TH',
    color: '#00838f',
    time: '2 ngày',
    body: [
      [
        text('Về thăm trường cũ nhân dịp kỷ niệm 100 năm '),
        vocab('establish'),
        text('. Ngôi trường nhỏ này có '),
        vocab('influence'),
        text(' lớn nhất tới con người mình hôm nay. Biết ơn thầy cô nhiều lắm! 🌼'),
      ],
    ],
    likes: '215',
    comments: '48',
    shares: '2',
  },
]
