export type Lang = 'vi' | 'en'

/* Text fragments that render with inline styling (gold marks, bold). */
export interface Segment {
  text: string
  mark?: boolean
  strong?: boolean
}

export interface Strings {
  meta: { title: string; tutorialTitle: string }
  theme: { toDark: string; toLight: string; label: string }
  banner: { text: string; action: string }
  nav: { demo: string; features: string; how: string; tutorial: string; cta: string }
  deck: {
    title: string
    backHome: string
    greeting: string
    greetingSub: string
    statTotal: string
    emptyTitle: string
    tabs: { words: string; puzzle: string; flashcards: string }
    loading: string
    empty: string
    remove: string
    confirmRemove: string
    markKnown: string
    markSaved: string
    savedLabel: string
    knownLabel: string
    wordCount: (n: number) => string
    puzzle: {
      prompt: string
      promptMeaning: string
      needMore: string
      correct: string
      wrong: (answer: string) => string
      next: string
      score: (right: number, total: number) => string
      restart: string
    }
    flash: { flipHint: string; prev: string; next: string; counter: (i: number, n: number) => string }
    menu: { deck: string; login: string; signup: string; logout: string; open: string }
    auth: {
      loginTitle: string
      signupTitle: string
      email: string
      password: string
      submitLogin: string
      submitSignup: string
      switchToSignup: string
      switchToLogin: string
      errors: {
        badCredentials: string
        emailInUse: string
        weakPassword: string
        invalidEmail: string
        tooManyRequests: string
        network: string
        unknown: string
        notConfigured: string
      }
    }
  }
  hero: {
    eyebrow: string
    title1: string
    titleAccent: string
    title2: string
    sub: string
    ctaInstall: string
    ctaDemo: string
    privacy: string
    tagNote: string
  }
  demo: {
    eyebrow: string
    title: string
    sub: string
    resizeHandle: string
  }
  features: {
    eyebrow: string
    title: string
    sub: string
    cards: { title: string; body: string }[]
  }
  panel: {
    eyebrow: string
    title: string
    body: string
    notes: { term: string; body: string }[]
    mockupNote: string
  }
  how: { eyebrow: string; title: string; steps: { title: string; body: string }[] }
  benefits: {
    title1: string
    title2: string
    lead: Segment[]
    support: Segment[]
  }
  faq: { eyebrow: string; title: string; sub: string; items: { q: string; a: string }[] }
  finalCta: {
    title1: string
    titleAccent: string
    title2: string
    description: string
    ctaInstall: string
    ctaDemo: string
    privacy: string
  }
  footer: { tagline: string; demo: string; features: string; tutorial: string; faq: string; install: string; privacy: string }
  tutorial: {
    eyebrow: string
    title: string
    sub: string
    steps: {
      title: string
      intro: string
      bullets: { term: string; text: string }[]
      outro?: string
      caption?: string
    }[]
    toolbarCaption: string
    intensityLabel: string
    intensityNotes: [string, string, string]
    progressLabel: string
    progressUnit: string
    progressTail: string
    outroTitle: string
    outroSub: string
    ctaDemo: string
    ctaInstall: string
  }
}

const vi: Strings = {
  meta: {
    title: 'Merid: Học từ vựng tiếng Anh ngay khi đọc web tiếng Việt',
    tutorialTitle: 'Hướng dẫn: Cách dùng Merid',
  },
  theme: {
    toDark: 'Chuyển sang chế độ tối',
    toLight: 'Chuyển sang chế độ sáng',
    label: 'Giao diện',
  },
  banner: {
    text: 'Merid đã có mặt trên Chrome Web Store.',
    action: 'Cài ngay',
  },
  deck: {
    title: 'Deck của tôi',
    backHome: 'Về trang chủ',
    greeting: 'Chào mừng bạn trở lại!',
    greetingSub: 'Ôn lại những từ bạn đã lưu trong lúc lướt web nhé.',
    statTotal: 'Tổng số từ',
    emptyTitle: 'Deck của bạn còn trống',
    tabs: { words: 'Từ vựng', puzzle: 'Puzzle', flashcards: 'Flashcard' },
    loading: 'Đang tải deck…',
    empty: 'Chưa có từ nào. Cài extension Merid và lưu từ trong lúc đọc web nhé.',
    remove: 'Xoá',
    confirmRemove: 'Xoá từ này khỏi deck?',
    markKnown: 'Đã thuộc',
    markSaved: 'Học lại',
    savedLabel: 'Đang học',
    knownLabel: 'Đã thuộc',
    wordCount: (n: number) => `${n} từ`,
    puzzle: {
      prompt: 'Chọn từ đúng để điền vào chỗ trống:',
      promptMeaning: 'Từ nào mang nghĩa sau đây?',
      needMore: 'Cần ít nhất 4 từ đang học để chơi Puzzle. Hãy lưu thêm từ nhé!',
      correct: 'Chính xác! 🎉',
      wrong: (answer: string) => `Chưa đúng. Đáp án là “${answer}”.`,
      next: 'Câu tiếp theo',
      score: (right: number, total: number) => `Đúng ${right}/${total} câu`,
      restart: 'Chơi lại',
    },
    flash: {
      flipHint: 'Nhấn để lật thẻ',
      prev: 'Trước',
      next: 'Sau',
      counter: (i: number, n: number) => `Thẻ ${i}/${n}`,
    },
    menu: {
      deck: 'Deck của tôi',
      login: 'Đăng nhập',
      signup: 'Đăng ký',
      logout: 'Đăng xuất',
      open: 'Mở menu',
    },
    auth: {
      loginTitle: 'Đăng nhập',
      signupTitle: 'Tạo tài khoản',
      email: 'Email',
      password: 'Mật khẩu (tối thiểu 8 ký tự)',
      submitLogin: 'Đăng nhập',
      submitSignup: 'Đăng ký',
      switchToSignup: 'Chưa có tài khoản? Đăng ký',
      switchToLogin: 'Đã có tài khoản? Đăng nhập',
      errors: {
        badCredentials: 'Email hoặc mật khẩu không đúng.',
        emailInUse: 'Email này đã được đăng ký. Hãy đăng nhập.',
        weakPassword: 'Mật khẩu phải có ít nhất 8 ký tự.',
        invalidEmail: 'Email không hợp lệ.',
        tooManyRequests: 'Bạn đã thử quá nhiều lần. Hãy thử lại sau ít phút.',
        network: 'Mất kết nối mạng. Kiểm tra internet rồi thử lại.',
        unknown: 'Có lỗi xảy ra. Vui lòng thử lại.',
        notConfigured: 'Tài khoản chưa khả dụng trên bản triển khai này.',
      },
    },
  },
  nav: {
    demo: 'Demo',
    features: 'Tính năng',
    how: 'Cách hoạt động',
    tutorial: 'Hướng dẫn',
    cta: 'Thêm vào Chrome',
  },
  hero: {
    eyebrow: 'Tiện ích Chrome cho người Việt học tiếng Anh',
    title1: 'Học ',
    titleAccent: 'tiếng Anh',
    title2: ' ngay khi lướt web tiếng Việt.',
    sub: 'Học từ vựng tiếng Anh một cách tự nhiên ngay khi đọc những trang web tiếng Việt bạn vẫn dùng mỗi ngày.',
    ctaInstall: 'Thêm Merid vào Chrome',
    ctaDemo: 'Thử demo ngay',
    privacy: 'Riêng tư từ trong thiết kế. Merid chạy ngay trên máy bạn, không cần tài khoản và không gửi dữ liệu trang web lên máy chủ.',
    tagNote: 'Học theo ngữ cảnh · Miễn phí',
  },
  demo: {
    eyebrow: 'Demo tương tác',
    title: 'Xem Merid hoạt động ngay tại đây',
    sub: 'Đây chính là panel thật của extension. Đổi bộ từ, chỉnh cường độ, rồi cuộn trang Wikipedia hoặc mở tab Facebook bên dưới và di chuột lên bất kỳ từ nào được tô sáng.',
    resizeHandle: 'Kéo để chỉnh độ rộng trang demo. Nhấp đúp để trở về kích thước đầy đủ.',
  },
  features: {
    eyebrow: 'Tính năng',
    title: 'Extension nhỏ. Cỗ máy từ vựng nghiêm túc.',
    sub: 'Tất cả xoay quanh một ý tưởng: bạn cứ đọc như bình thường, từ vựng sẽ tự tìm đến bạn.',
    cards: [
      {
        title: 'Thay từ theo ngữ cảnh',
        body: 'Merid đọc trang web như cách bạn đọc và chỉ thay những từ thật sự có nghĩa trong câu đó. Không nhiễu, không vỡ ngữ pháp.',
      },
      {
        title: 'Nhiều bộ từ vựng',
        body: 'SAT, B2, C1 và C2 đã sẵn sàng, các bộ từ theo chủ đề và tự tạo đang trong kế hoạch. Bạn chọn mục tiêu, Merid chọn từ đáng học.',
      },
      {
        title: 'Tần suất tùy chỉnh',
        body: 'Casual, Focused hoặc Locked-in. Bạn quyết định mỗi trang "nặng" đến đâu, từ nhỏ giọt nhẹ nhàng tới cường độ tối đa.',
      },
      {
        title: 'Lưu từ vào deck',
        body: 'Một chạm "Save to Deck" để giữ lại từ hay. Ôn lại deck của bạn bất cứ khi nào rảnh 5 phút.',
      },
      {
        title: '"I know this"',
        body: 'Đánh dấu đã thuộc và từ đó biến mất khỏi mọi trang. Merid chỉ dành sự chú ý của bạn cho những từ chưa thuộc.',
      },
      {
        title: 'Chế độ Vie-Eng và Eng-Eng',
        body: 'Bắt đầu bằng cách nối tiếng Việt với tiếng Anh. Khi đã cứng, chuyển sang giải nghĩa hoàn toàn bằng tiếng Anh để tư duy trực tiếp.',
      },
    ],
  },
  panel: {
    eyebrow: 'Bảng điều khiển',
    title: 'Toàn bộ việc học, gói gọn trong một cú click.',
    body: 'Mở bảng điều khiển ngay trên thanh công cụ trình duyệt và chỉnh cách Merid hoạt động trên mọi trang. Không dashboard rườm rà, không menu cài đặt ẩn sâu ba tầng.',
    notes: [
      { term: 'Hai chiều quét.', body: 'VIE → ENG thay từ tiếng Việt; ENG → ENG đổi từ tiếng Anh sang synonym khó hơn.' },
      { term: 'Đổi bộ từ.', body: 'Chuyển giữa SAT, C1, C2 hoặc tất cả, tùy từng phiên lướt web.' },
      { term: 'Thanh tần suất.', body: 'Casual cho ngày đọc chill, Locked-in cho mùa thi.' },
      { term: 'Chế độ học.', body: 'Thay từ trực tiếp, hoặc giữ tiếng Việt và học khi di chuột.' },
    ],
    mockupNote: 'Mockup này bấm được thật. Thử xem!',
  },
  how: {
    eyebrow: 'Cách hoạt động',
    title: 'Ba bước. Không cần thói quen mới.',
    steps: [
      {
        title: 'Lướt web như bình thường',
        body: 'Đọc web tiếng Việt như mọi ngày: Wikipedia, báo, blog, tài liệu học. Thói quen của bạn không đổi chút nào.',
      },
      {
        title: 'Merid highlight từ đáng học',
        body: 'Extension chọn từ trong bộ từ vựng bạn đã chọn rồi highlight hoặc thay thế ngay trong trang.',
      },
      {
        title: 'Học mà không đứt mạch đọc',
        body: 'Di chuột để xem nghĩa, lưu từ vào deck, hoặc đánh dấu đã thuộc. Rồi cứ thế đọc tiếp.',
      },
    ],
  },
  benefits: {
    title1: 'Không cần flashcard trước.',
    title2: 'Không còn list từ nhàm chán.',
    lead: [
      { text: 'Việc ' },
      { text: 'đọc mỗi ngày', mark: true },
      { text: ' chính là ' },
      { text: 'bài học', mark: true },
      { text: '.' },
    ],
    support: [
      { text: 'Dành cho người Việt đang nhắm tới ' },
      { text: 'SAT', strong: true },
      { text: ', ' },
      { text: 'IELTS', strong: true },
      { text: ', ' },
      { text: 'tiếng Anh nâng cao', strong: true },
      { text: ' và ' },
      { text: 'từ vựng học thuật', strong: true },
      { text: ', từng trang một.' },
    ],
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Câu hỏi thường gặp',
    sub: 'Vài câu trả lời nhanh trước khi bạn cài Merid.',
    items: [
      {
        q: 'Extension này hoạt động như thế nào?',
        a: 'Khi bạn đọc một trang web tiếng Việt, Merid chọn ra một vài từ thuộc bộ từ vựng bạn đã chọn rồi highlight hoặc thay bằng từ tiếng Anh tương ứng. Di chuột lên từ đó là thấy nghĩa, phát âm, từ đồng nghĩa và câu ví dụ, ngay tại chỗ.',
      },
      {
        q: 'Extension có thay đổi toàn bộ nội dung trang web không?',
        a: 'Không. Merid chỉ chạm vào một vài từ nằm trong bộ từ vựng bạn chọn, phần còn lại của trang giữ nguyên 100%. Bạn có thể giảm tần suất hoặc tắt extension bất cứ lúc nào chỉ với một công tắc.',
      },
      {
        q: 'Mình có thể chọn trình độ từ vựng không?',
        a: 'Có. Bạn chọn bộ từ theo mục tiêu của mình trong bảng điều khiển và đổi lúc nào cũng được. Thanh tần suất còn cho bạn quyết định học nhẹ nhàng hay cường độ cao.',
      },
      {
        q: 'Có những bộ từ vựng nào?',
        a: 'Hiện tại có SAT, B2, C1 và C2. Các bộ từ theo chủ đề và bộ từ tự tạo đang nằm trong kế hoạch, nhưng chưa ra mắt.',
      },
      {
        q: 'Extension có miễn phí không?',
        a: 'Merid hiện miễn phí. Nếu sau này có thay đổi về giá, chúng tôi sẽ thông báo trước.',
      },
      {
        q: 'Dữ liệu của mình có được bảo mật không?',
        a: 'Có. Merid chỉ xử lý văn bản trên trang để chọn từ cần thay, còn tiến trình học của bạn được lưu ngay trên trình duyệt. Merid không bán dữ liệu của bạn.',
      },
      {
        q: 'Làm sao để cài Merid?',
        a: 'Merid đã có trên Chrome Web Store. Mở trang Merid, bấm "Add to Chrome", rồi ghim icon để dùng ngay khi lướt web.',
      },
      {
        q: 'Merid dùng được trên trình duyệt nào?',
        a: 'Merid là extension cho Chrome. Các trình duyệt nhân Chromium hỗ trợ Chrome Web Store (như Edge hay Brave) thường cũng cài được từ cùng một trang.',
      },
    ],
  },
  finalCta: {
    title1: 'Học ngay ',
    titleAccent: 'khi bạn lướt web',
    title2: '.',
    description:
      'Cài Merid và biến những trang web tiếng Việt hằng ngày thành cơ hội học từ vựng tiếng Anh.',
    ctaInstall: 'Thêm Merid vào Chrome',
    ctaDemo: 'Thử demo ngay',
    privacy:
      'Riêng tư từ trong thiết kế. Merid chạy ngay trên máy bạn: không tài khoản, không dịch vụ AI, không gửi dữ liệu trang web lên máy chủ.',
  },
  footer: {
    tagline: 'Làm cho người Việt học tiếng Anh.',
    demo: 'Demo',
    features: 'Tính năng',
    tutorial: 'Hướng dẫn',
    faq: 'FAQ',
    install: 'Thêm vào Chrome',
    privacy: 'Chính sách bảo mật',
  },
  tutorial: {
    eyebrow: 'Hướng dẫn',
    title: 'Cách dùng Merid',
    sub: 'Năm phút từ cài đặt tới thuộc những từ đầu tiên. Mọi mockup trên trang đều tương tác được, cứ vừa đọc vừa thử nhé.',
    steps: [
      {
        title: 'Cài đặt và ghim Merid',
        intro: 'Merid có sẵn trên Chrome Web Store:',
        bullets: [
          { term: 'Thêm vào Chrome.', text: 'Mở trang Merid trên Chrome Web Store và bấm "Add to Chrome".' },
          {
            term: 'Ghim lại.',
            text: 'Bấm biểu tượng mảnh ghép ở góc trên bên phải của Chrome rồi ghim Merid.',
          },
        ],
        outro: 'Chữ M vàng giờ nằm ngay cạnh thanh địa chỉ. Một click mở tất cả.',
      },
      {
        title: 'Mở bảng điều khiển và chọn bộ từ',
        intro: 'Bấm chữ M vàng rồi chọn bộ từ vựng bạn muốn học:',
        bullets: [
          { term: 'SAT.', text: 'Từ vựng cho kỳ thi SAT và các bài thi tuyển sinh tương tự.' },
          { term: 'C1, C2.', text: 'Các cấp CEFR, từ nâng cao tới tiếng Anh học thuật gần bản xứ.' },
          { term: 'All.', text: 'Tất cả bộ từ cùng lúc, cho độ đa dạng tối đa.' },
        ],
        outro: 'Đổi bộ từ lúc nào cũng được. Từ đã thuộc luôn được ẩn.',
        caption: 'Đây là bảng điều khiển thật. Bấm thử đi.',
      },
      {
        title: 'Chỉnh cường độ học',
        intro: 'Thanh Highlight intensity quyết định Merid chạm vào bao nhiêu từ mỗi trang:',
        bullets: [
          { term: 'Casual.', text: 'Vài từ mỗi trang.' },
          { term: 'Focused.', text: 'Một dòng từ mới đều đặn trên mỗi bài viết.' },
          { term: 'Locked-in.', text: 'Mọi từ đủ điều kiện đều được highlight.' },
        ],
        outro: 'Bắt đầu với Casual, quen rồi thì tăng dần.',
        caption: 'Kéo thanh trượt hoặc chạm vào nhãn.',
      },
      {
        title: 'Chọn cách từ xuất hiện',
        intro: 'Display mode có ba lựa chọn cho cách từ mới hiện ra trong câu:',
        bullets: [
          {
            term: 'Replace.',
            text: 'Từ tiếng Anh thay chỗ từ tiếng Việt, để ngữ cảnh dạy bạn nghĩa của từ.',
          },
          {
            term: 'Highlight.',
            text: 'Từ tiếng Việt giữ nguyên và được highlight. Di chuột để xem từ tiếng Anh.',
          },
          {
            term: 'Beside.',
            text: 'Hiện cả hai cùng lúc, từ tiếng Anh nằm trong ngoặc.',
          },
        ],
        outro:
          'Ở mục Languages to scan, VIE → ENG thay từ tiếng Việt, còn ENG → ENG đổi từ tiếng Anh thành từ đồng nghĩa khó hơn. Rất đáng bật khi bạn chạm C1.',
        caption: 'Chạm một chế độ và xem câu thay đổi.',
      },
      {
        title: 'Đọc, di chuột, học',
        intro:
          'Cứ lướt web như mọi khi. Di chuột lên từ được highlight (hoặc chạm trên màn hình cảm ứng), popup sẽ mở ra:',
        bullets: [
          { term: 'Phần cốt lõi.', text: 'Từ loại, phát âm và định nghĩa tiếng Anh ngắn gọn.' },
          { term: 'Đồng nghĩa và trái nghĩa.', text: 'Chip vàng là từ gần nghĩa, chip nhạt là từ trái nghĩa.' },
          { term: 'Ngữ cảnh.', text: 'Câu ví dụ, nghĩa tiếng Việt và từ gốc đã được thay.' },
        ],
        caption: 'Thử ngay: di chuột lên từ được highlight.',
      },
      {
        title: 'Lưu lại hoặc gạt đi',
        intro: 'Hai nút cuối mỗi popup giúp việc học gọn gàng:',
        bullets: [
          { term: 'Save to Deck.', text: 'Thêm từ vào deck ôn tập để luyện lại sau.' },
          { term: 'I know this.', text: 'Đánh dấu đã thuộc. Merid sẽ không highlight từ đó nữa.' },
        ],
        outro:
          'Hãy thành thật với "I know this". Danh sách đã thuộc càng chuẩn, Merid càng tập trung vào từ bạn thật sự cần.',
        caption: 'Popup nào cũng kết thúc bằng hai nút này.',
      },
      {
        title: 'Theo dõi tiến độ',
        intro:
          'Biểu đồ tuần trong My Deck đếm số từ bạn thuộc mỗi ngày. Chuỗi ngày học tạo động lực bất ngờ.',
        bullets: [],
        outro: 'Khi một bộ từ bắt đầu thấy dễ, hãy tăng cường độ, đổi bộ từ khó hơn, hoặc bật ENG → ENG.',
      },
    ],
    toolbarCaption: 'Ghim cạnh thanh địa chỉ, luôn cách bạn đúng một cú click',
    intensityLabel: 'Cường độ highlight',
    intensityNotes: [
      'Nhỏ giọt nhẹ nhàng: khoảng 2 tới 3 từ mới mỗi trang.',
      'Một dòng từ mới đều đặn trên mọi bài viết.',
      'Cường độ tối đa. Rất hợp mùa ôn thi.',
    ],
    progressLabel: 'Số từ đã thuộc tuần này',
    progressUnit: 'từ',
    progressTail: 'đã thuộc trong tuần này. Giữ chuỗi học mỗi ngày nhé.',
    outroTitle: 'Toàn bộ quy trình chỉ có vậy.',
    outroSub: 'Đọc web là thói quen bạn đã có sẵn. Merid chỉ nâng cấp nó.',
    ctaDemo: 'Thử demo tương tác',
    ctaInstall: 'Thêm Merid vào Chrome',
  },
}

const en: Strings = {
  meta: {
    title: 'Merid: Learn English while browsing Vietnamese websites',
    tutorialTitle: 'Tutorial: How to use Merid',
  },
  theme: {
    toDark: 'Switch to dark mode',
    toLight: 'Switch to light mode',
    label: 'Theme',
  },
  banner: {
    text: 'Merid is now live on the Chrome Web Store.',
    action: 'Install now',
  },
  deck: {
    title: 'My Deck',
    backHome: 'Back to home',
    greeting: 'Welcome back!',
    greetingSub: 'Review the words you saved while browsing.',
    statTotal: 'Total words',
    emptyTitle: 'Your deck is empty',
    tabs: { words: 'Words', puzzle: 'Puzzle', flashcards: 'Flashcards' },
    loading: 'Loading your deck…',
    empty: 'No words yet. Install the Merid extension and save words while you browse.',
    remove: 'Remove',
    confirmRemove: 'Remove this word from your deck?',
    markKnown: 'I know this',
    markSaved: 'Study again',
    savedLabel: 'Learning',
    knownLabel: 'Known',
    wordCount: (n: number) => `${n} ${n === 1 ? 'word' : 'words'}`,
    puzzle: {
      prompt: 'Pick the word that completes the sentence:',
      promptMeaning: 'Which word matches this meaning?',
      needMore: 'You need at least 4 words in your learning list to play Puzzle. Save a few more!',
      correct: 'Correct! 🎉',
      wrong: (answer: string) => `Not quite. The answer is “${answer}”.`,
      next: 'Next question',
      score: (right: number, total: number) => `${right}/${total} correct`,
      restart: 'Play again',
    },
    flash: {
      flipHint: 'Click to flip',
      prev: 'Previous',
      next: 'Next',
      counter: (i: number, n: number) => `Card ${i}/${n}`,
    },
    menu: {
      deck: 'My Deck',
      login: 'Log in',
      signup: 'Sign up',
      logout: 'Sign out',
      open: 'Open menu',
    },
    auth: {
      loginTitle: 'Log in',
      signupTitle: 'Create account',
      email: 'Email',
      password: 'Password (min 8 characters)',
      submitLogin: 'Log in',
      submitSignup: 'Sign up',
      switchToSignup: "Don't have an account? Sign up",
      switchToLogin: 'Already have an account? Log in',
      errors: {
        badCredentials: 'Email or password is incorrect.',
        emailInUse: 'This email is already registered. Try logging in.',
        weakPassword: 'Password must be at least 8 characters.',
        invalidEmail: 'Please enter a valid email address.',
        tooManyRequests: 'Too many attempts. Try again in a few minutes.',
        network: 'No connection. Check your internet and try again.',
        unknown: 'Something went wrong. Please try again.',
        notConfigured: 'Accounts are not available on this deployment.',
      },
    },
  },
  nav: {
    demo: 'Demo',
    features: 'Features',
    how: 'How it works',
    tutorial: 'Tutorial',
    cta: 'Add to Chrome',
  },
  hero: {
    eyebrow: 'Chrome extension for Vietnamese learners',
    title1: 'Learn ',
    titleAccent: 'English',
    title2: ' while browsing Vietnamese websites.',
    sub: 'Learn English vocabulary naturally while reading the Vietnamese websites you already use.',
    ctaInstall: 'Add Merid to Chrome',
    ctaDemo: 'Try the Demo',
    privacy: 'Private by design. It runs locally on your device, with no account and no webpage data sent to a server.',
    tagNote: 'Context-aware learning · Free',
  },
  demo: {
    eyebrow: 'Interactive demo',
    title: 'See it work in real time',
    sub: "This is the extension's real panel. Pick a dataset, tune the intensity, then scroll the Wikipedia page or the Facebook tab below and hover any highlighted word.",
    resizeHandle: 'Drag to resize the demo page. Double-click to restore the full width.',
  },
  features: {
    eyebrow: 'Features',
    title: 'Small extension. Serious vocabulary engine.',
    sub: 'Everything is built around one idea: you keep reading what you already read, and the words come to you.',
    cards: [
      {
        title: 'Context-aware replacement',
        body: 'Merid reads the page the way you do and only swaps words that carry real meaning in that sentence. No random noise, no broken grammar.',
      },
      {
        title: 'Multiple vocab datasets',
        body: 'SAT, B2, C1, and C2 today, with themed and custom datasets on the roadmap. Pick your goal, and Merid picks the words worth learning.',
      },
      {
        title: 'Adjustable frequency',
        body: 'Casual, Focused, or Locked-in. You decide how intense each page gets, from a gentle drip of new words to full immersion.',
      },
      {
        title: 'Save words to deck',
        body: 'One tap on "Save to Deck" keeps any word for later. Review your personal deck whenever you have five spare minutes.',
      },
      {
        title: '"I know this"',
        body: 'Mark a word as mastered and it stops appearing everywhere. Merid only spends your attention on words you have not learned yet.',
      },
      {
        title: 'Vie-Eng and Eng-Eng modes',
        body: 'Start by mapping Vietnamese to English. When you are ready, switch to English-only explanations and think in English directly.',
      },
    ],
  },
  panel: {
    eyebrow: 'The extension panel',
    title: 'Your whole learning setup, one click away.',
    body: 'Open the panel from your browser toolbar and tune how Merid behaves on every site. No account dashboards, no settings pages buried three levels deep.',
    notes: [
      { term: 'Two scan directions.', body: 'VIE → ENG swaps Vietnamese words; ENG → ENG upgrades English words to harder synonyms.' },
      { term: 'Dataset switch.', body: 'Jump between SAT, C1, C2, or everything at once, per browsing session.' },
      { term: 'Frequency slider.', body: 'Casual for chill reading days, Locked-in for exam season.' },
      { term: 'Learning modes.', body: 'Replace words directly, or keep Vietnamese and learn on hover.' },
    ],
    mockupNote: 'This is a live mockup. Click around.',
  },
  how: {
    eyebrow: 'How it works',
    title: 'Three steps. Zero new habits.',
    steps: [
      {
        title: 'Browse normally',
        body: 'Read Vietnamese websites like you always do: Wikipedia, news, blogs, and school materials. Nothing about your routine changes.',
      },
      {
        title: 'Merid highlights useful words',
        body: 'The extension picks words from your selected vocabulary dataset and highlights or replaces them right inside the page.',
      },
      {
        title: 'Learn without breaking flow',
        body: 'Hover to see meanings, save words to your deck, or mark them as mastered. Then just keep reading.',
      },
    ],
  },
  benefits: {
    title1: 'No flashcards first.',
    title2: 'No boring word lists.',
    lead: [
      { text: 'Your normal ' },
      { text: 'reading', mark: true },
      { text: ' becomes the ' },
      { text: 'lesson', mark: true },
      { text: '.' },
    ],
    support: [
      { text: 'Built for Vietnamese learners aiming for ' },
      { text: 'SAT', strong: true },
      { text: ', ' },
      { text: 'IELTS', strong: true },
      { text: ', ' },
      { text: 'advanced English', strong: true },
      { text: ', and ' },
      { text: 'academic vocabulary', strong: true },
      { text: ', one page at a time.' },
    ],
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Frequently asked questions',
    sub: 'Quick answers before you install.',
    items: [
      {
        q: 'How does the extension work?',
        a: 'While you read a Vietnamese page, Merid picks a few words from your chosen vocabulary dataset and highlights them or swaps them for the matching English word. Hover any of them to see the meaning, pronunciation, synonyms, and an example sentence, right in place.',
      },
      {
        q: 'Does it replace the entire webpage?',
        a: 'No. Merid only touches a handful of words that belong to your selected dataset; the rest of the page stays 100% untouched. You can lower the frequency or switch the extension off any time with one toggle.',
      },
      {
        q: 'Can I choose my vocabulary level?',
        a: 'Yes. You pick the dataset that matches your goal in the panel and can change it whenever you like. The frequency slider also lets you decide between light exposure and full immersion.',
      },
      {
        q: 'What vocabulary sets are available?',
        a: 'SAT, B2, C1, and C2 today. Themed and custom datasets are on the roadmap, but not released yet.',
      },
      {
        q: 'Is the extension free?',
        a: 'Merid is free to use. If pricing ever changes in the future, we will announce it ahead of time.',
      },
      {
        q: 'Is my data private?',
        a: 'Yes. Merid only processes the text on the page to decide which words to replace, and your learning progress is stored in your own browser. Merid does not sell your data.',
      },
      {
        q: 'How do I install Merid?',
        a: 'Merid is on the Chrome Web Store. Open the Merid listing, click "Add to Chrome", then pin the icon to start learning as you browse.',
      },
      {
        q: 'Which browsers does Merid support?',
        a: 'Merid is a Chrome extension. Chromium-based browsers that support the Chrome Web Store (such as Edge or Brave) can usually install it from the same listing.',
      },
    ],
  },
  finalCta: {
    title1: 'Start learning ',
    titleAccent: 'while you browse',
    title2: '.',
    description:
      'Install Merid and turn everyday Vietnamese webpages into opportunities to learn English vocabulary.',
    ctaInstall: 'Add Merid to Chrome',
    ctaDemo: 'Try the Demo',
    privacy:
      'Private by design. Merid works locally on your device: no account, no AI service, and no webpage data sent to a server.',
  },
  footer: {
    tagline: 'Made for Vietnamese learners.',
    demo: 'Demo',
    features: 'Features',
    tutorial: 'Tutorial',
    faq: 'FAQ',
    install: 'Add to Chrome',
    privacy: 'Privacy Policy',
  },
  tutorial: {
    eyebrow: 'Tutorial',
    title: 'How to use Merid',
    sub: 'Five minutes from install to your first mastered words. Every mockup on this page is interactive, so try things as you read.',
    steps: [
      {
        title: 'Install and pin Merid',
        intro: 'Merid lives on the Chrome Web Store:',
        bullets: [
          { term: 'Add it.', text: 'Open the Merid listing and click "Add to Chrome".' },
          {
            term: 'Pin it.',
            text: 'Click the puzzle icon at the top right of Chrome and pin Merid.',
          },
        ],
        outro: 'The gold M now sits next to your address bar. One click opens everything.',
      },
      {
        title: 'Open the panel and choose your dataset',
        intro: 'Click the gold M, then pick the vocabulary dataset you want to learn from:',
        bullets: [
          { term: 'SAT.', text: 'Vocabulary for the SAT and similar admission tests.' },
          { term: 'C1, C2.', text: 'CEFR levels, from advanced up to near-native academic English.' },
          { term: 'All.', text: 'Every dataset at once, for maximum variety.' },
        ],
        outro: 'Switch any time. Mastered words stay hidden in every dataset.',
        caption: 'This is the real panel. Click around.',
      },
      {
        title: 'Set your intensity',
        intro: 'The Highlight intensity slider decides how many words Merid touches per page:',
        bullets: [
          { term: 'Casual.', text: 'A few words per page.' },
          { term: 'Focused.', text: 'A steady stream of new words on every article.' },
          { term: 'Locked-in.', text: 'Every eligible word gets highlighted.' },
        ],
        outro: 'Start on Casual, then move up once it feels natural.',
        caption: 'Drag the slider or tap a label.',
      },
      {
        title: 'Choose how words appear',
        intro: 'Display mode gives you three ways to meet a new word in the sentence:',
        bullets: [
          {
            term: 'Replace.',
            text: "The English word takes the Vietnamese word's place, so context teaches you the meaning.",
          },
          {
            term: 'Highlight.',
            text: 'The Vietnamese word stays and gets highlighted. Hover it to see the English.',
          },
          {
            term: 'Beside.',
            text: 'Shows both at once, with the English in parentheses.',
          },
        ],
        outro:
          'Under Languages to scan, VIE → ENG replaces Vietnamese words and ENG → ENG swaps English words for harder synonyms. Well worth turning on once you reach C1.',
        caption: 'Tap a mode and watch the sentence change.',
      },
      {
        title: 'Read, hover, learn',
        intro:
          'Browse like you always do. Hover a highlighted word (or tap it on a touchscreen) and a popup opens:',
        bullets: [
          { term: 'The essentials.', text: 'Part of speech, pronunciation, and a short English definition.' },
          { term: 'Synonyms and opposites.', text: 'Gold chips are similar words, pale chips are opposites.' },
          { term: 'Context.', text: 'An example sentence, the Vietnamese meaning, and the original word.' },
        ],
        caption: 'Try it: hover the highlighted word.',
      },
      {
        title: 'Save it or clear it',
        intro: 'Two buttons at the bottom of every popup keep things tidy:',
        bullets: [
          { term: 'Save to Deck.', text: 'Adds the word to your review deck for later practice.' },
          { term: 'I know this.', text: 'Marks it mastered. Merid never highlights it again.' },
        ],
        outro:
          'Be honest with "I know this". A clean mastered list keeps Merid focused on words you actually need.',
        caption: 'Every popup ends with these two buttons.',
      },
      {
        title: 'Watch your progress',
        intro:
          'The weekly chart in My Deck counts the words you master each day. Streaks are surprisingly motivating.',
        bullets: [],
        outro:
          'When a dataset starts feeling easy, raise the intensity, pick a harder dataset, or turn on ENG → ENG.',
      },
    ],
    toolbarCaption: 'Pinned next to the address bar, always one click away',
    intensityLabel: 'Highlight intensity',
    intensityNotes: [
      'A gentle drip: roughly 2 to 3 new words per page.',
      'A steady stream of new words on every article.',
      'Maximum exposure. Popular right before exams.',
    ],
    progressLabel: 'Words mastered this week',
    progressUnit: 'words',
    progressTail: 'mastered this week. Keep the streak alive.',
    outroTitle: 'That is the whole workflow.',
    outroSub: 'Reading is the habit you already have. Merid just upgrades it.',
    ctaDemo: 'Try the interactive demo',
    ctaInstall: 'Add Merid to Chrome',
  },
}

export const STRINGS: Record<Lang, Strings> = { vi, en }
