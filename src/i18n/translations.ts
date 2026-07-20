import type { TopicPresetId } from '../lib/datasetPrompt'
import type { FeedbackReason } from '../lib/feedback'

export type Lang = 'vi' | 'en'

/* Text fragments that render with inline styling (gold marks, bold). */
export interface Segment {
  text: string
  mark?: boolean
  strong?: boolean
}

export interface Strings {
  meta: {
    title: string
    tutorialTitle: string
    createDatasetTitle: string
    apiKeyGuideTitle: string
    welcomeTitle: string
    goodbyeTitle: string
    tryTitle: string
  }
  theme: { toDark: string; toLight: string; label: string }
  banner: { text: string; action: string }
  nav: { demo: string; features: string; how: string; tutorial: string; tryIt: string; createDataset: string; cta: string }
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
      googleButton: string
      orEmail: string
      errors: {
        badCredentials: string
        emailInUse: string
        weakPassword: string
        invalidEmail: string
        tooManyRequests: string
        network: string
        unknown: string
        notConfigured: string
        cancelled: string
        popupBlocked: string
        providerDisabled: string
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
    scrollCue: string
  }
  demo: {
    eyebrow: string
    title: string
    sub: string
    resizeHandle: string
    tryIt: string
    guiding: string
    ownTextTitle: string
    ownTextBody: string
    ownTextCta: string
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
    calc: {
      title: string
      minutesLabel: string
      minutesValue: (m: number) => string
      intensityLabel: string
      perDay: (n: number) => string
      perWeek: (n: number) => string
      perMonth: (n: number) => string
      note: string
    }
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
  footer: { tagline: string; demo: string; features: string; tutorial: string; createDataset: string; apiKeyGuide: string; faq: string; install: string; privacy: string }
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
    scrolly: {
      browserTitle: string
      articleNote: string
      deckChip: (n: number) => string
      panelHint: string
      modeLabel: string
      yourTurn: string
      watching: string
      finaleTitleSaved: (n: number) => string
      finaleTitleNone: string
      finaleBodySaved: string
      finaleBodyNone: string
    }
  }
  createDataset: {
    eyebrow: string
    title: string
    sub: string
    chooseTitle: string
    levelLabel: string
    levelHint: string
    topicLabel: string
    topicPlaceholder: string
    presetLabels: Record<TopicPresetId, string>
    countLabel: string
    countHint: string
    copyTitle: string
    copyIntro: string
    promptLabel: string
    copy: string
    copied: string
    pasteTitle: string
    pasteIntro: string
    accuracyNote: string
    saveTitle: string
    saveIntro: string
    saveOptions: { term: string; text: string }[]
    templateButton: string
    templateHint: string
    uploadTitle: string
    uploadIntro: string
    uploadSteps: string[]
    schemaTitle: string
    schemaIntro: string
    schemaColHeaders: [string, string, string]
    schemaRequired: string
    schemaOptional: string
    columns: { name: string; required: boolean; desc: string }[]
    exampleTitle: string
    errorsTitle: string
    errors: string[]
    limitsNote: string
    privacyNote: string
    outroTitle: string
    outroSub: string
    ctaTutorial: string
    ctaInstall: string
  }
  apiKeyGuide: {
    eyebrow: string
    title: string
    sub: string
    whatTitle: string
    whatIntro: string
    whatBullets: { term: string; text: string }[]
    getTitle: string
    getIntro: string
    getSteps: string[]
    getCta: string
    getNote: string
    openTitle: string
    openIntro: string
    openSteps: string[]
    pasteTitle: string
    pasteIntro: string
    pasteSteps: string[]
    pasteNote: string
    privacyTitle: string
    privacyBullets: string[]
    troubleTitle: string
    troubles: { term: string; text: string }[]
    sim: {
      title: string
      intro: string
      step1Hint: string
      step2Hint: string
      step3Hint: string
      done: string
      replay: string
    }
    beforeAfter: {
      title: string
      intro: string
      wrongNote: string
      fixedNote: string
    }
    outroTitle: string
    outroSub: string
    ctaTutorial: string
    ctaInstall: string
  }
  welcome: {
    eyebrow: string
    title: string
    sub: string
    checklist: {
      title: string
      progress: (done: number, total: number) => string
      installed: string
      pinned: string
      hovered: string
      saved: string
      signedIn: string
      signedInAs: (email: string) => string
      signInCta: string
      allDone: string
    }
    practice: {
      title: string
      intro: string
      hint: string
      savedNote: (n: number) => string
    }
    pin: {
      title: string
      intro: string
      watch: string
      yourTurn: string
      menuTitle: string
      pinnedNote: string
      replay: string
    }
    mission: {
      title: string
      body: string
      sitesLabel: string
    }
    extrasTitle: string
    extras: { term: string; text: string; to: string; cta: string }[]
    outroTitle: string
    outroSub: string
    ctaDemo: string
    ctaTutorial: string
  }
  try: {
    eyebrow: string
    title: string
    sub: string
    inputLabel: string
    placeholder: string
    sampleBtn: string
    clearBtn: string
    datasetLabel: string
    intensityLabel: string
    modeLabel: string
    loading: string
    loadError: string
    outputLabel: string
    emptyOutput: string
    matches: (n: number) => string
    hoverHint: string
    privacyNote: string
  }
  goodbye: {
    eyebrow: string
    title: string
    sub: string
    surveyTitle: string
    surveyIntro: string
    reasons: { id: FeedbackReason; label: string }[]
    commentLabel: string
    commentPlaceholder: string
    submit: string
    submitting: string
    pickOne: string
    thanksTitle: string
    thanksBody: string
    error: string
    tipsTitle: string
    tips: { term: string; text: string }[]
    rescue: {
      tryLabel: string
      tooMany: { title: string; body: string }
      wrongSites: { title: string; body: string; siteBtn: string; siteBtnOff: string }
      notUseful: { title: string; body: string; cta: string }
    }
    reinstallTitle: string
    reinstallBody: string
    ctaReinstall: string
  }
}

const vi: Strings = {
  meta: {
    title: 'Merid: Học từ vựng tiếng Anh ngay khi đọc web tiếng Việt',
    tutorialTitle: 'Hướng dẫn: Cách dùng Merid',
    createDatasetTitle: 'Tạo bộ từ vựng riêng với AI - Merid',
    apiKeyGuideTitle: 'Dán API key của bạn để dùng Merid tốt nhất - Merid',
    welcomeTitle: 'Merid đã sẵn sàng: bắt đầu trong 2 phút',
    goodbyeTitle: 'Tạm biệt - góp ý giúp Merid tốt hơn',
    tryTitle: 'Thử Merid với văn bản của bạn - Merid',
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
      googleButton: 'Đăng nhập với Google',
      orEmail: 'hoặc dùng email',
      errors: {
        badCredentials: 'Email hoặc mật khẩu không đúng.',
        emailInUse: 'Email này đã được đăng ký. Hãy đăng nhập.',
        weakPassword: 'Mật khẩu phải có ít nhất 8 ký tự.',
        invalidEmail: 'Email không hợp lệ.',
        tooManyRequests: 'Bạn đã thử quá nhiều lần. Hãy thử lại sau ít phút.',
        network: 'Mất kết nối mạng. Kiểm tra internet rồi thử lại.',
        unknown: 'Có lỗi xảy ra. Vui lòng thử lại.',
        notConfigured: 'Tài khoản chưa khả dụng trên bản triển khai này.',
        cancelled: 'Bạn đã huỷ đăng nhập.',
        popupBlocked: 'Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép popup cho merid.site rồi thử lại.',
        providerDisabled: 'Đăng nhập Google chưa được bật cho dự án này.',
      },
    },
  },
  nav: {
    demo: 'Demo',
    features: 'Tính năng',
    how: 'Cách hoạt động',
    tutorial: 'Hướng dẫn',
    tryIt: 'Thử văn bản',
    createDataset: 'Tạo bộ từ',
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
    scrollCue: 'Cuộn xuống thử demo trực tiếp',
  },
  demo: {
    eyebrow: 'Demo tương tác',
    title: 'Xem Merid hoạt động ngay tại đây',
    sub: 'Đây chính là panel thật của extension. Đổi bộ từ, chỉnh cường độ, rồi cuộn trang Wikipedia hoặc mở tab Facebook bên dưới và di chuột lên bất kỳ từ nào được tô sáng.',
    resizeHandle: 'Kéo để chỉnh độ rộng trang demo. Nhấp đúp để trở về kích thước đầy đủ.',
    tryIt: 'Tới lượt bạn! Tự mình thử ngay nhé.',
    guiding: 'Merid đang hướng dẫn cho bạn',
    ownTextTitle: 'Muốn thử với văn bản của riêng bạn?',
    ownTextBody: 'Dán một đoạn email, bài báo hay bài đọc trên lớp và xem Merid xử lý bằng bộ từ vựng thật, hơn 3.300 từ.',
    ownTextCta: 'Thử với văn bản của bạn',
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
        body: 'SAT, C1 và C2 có sẵn trong tiện ích - và giờ bạn có thể tự tạo bộ từ theo trình độ, chủ đề riêng bằng AI tại trang "Tạo bộ từ" rồi tải lên trong Cài đặt. Bạn chọn mục tiêu, Merid chọn từ đáng học.',
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
    calc: {
      title: 'Bạn sẽ gặp bao nhiêu từ mới?',
      minutesLabel: 'Mỗi ngày bạn lướt web khoảng',
      minutesValue: (m: number) => `${m} phút`,
      intensityLabel: 'Cường độ',
      perDay: (n: number) => `≈ ${n} lượt gặp từ vựng mỗi ngày`,
      perWeek: (n: number) => `≈ ${n} từ mới mỗi tuần`,
      perMonth: (n: number) => `≈ ${n} từ mới mỗi tháng`,
      note: 'Ước tính dựa trên tốc độ đọc trung bình và mật độ thay từ của Merid. Con số thật phụ thuộc trang bạn đọc.',
    },
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
        a: 'Có sẵn SAT, C1 và C2 (hoặc "All" để gộp cả ba). Bạn cũng có thể tự tạo bộ từ theo chủ đề riêng: mở trang "Tạo bộ từ" trên merid.site, dùng AI tạo file CSV rồi tải lên trong phần Cài đặt của tiện ích.',
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
    createDataset: 'Tạo bộ từ',
    apiKeyGuide: 'Hướng dẫn API key',
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
    scrolly: {
      browserTitle: 'Bài đọc mẫu - baomau.vn',
      articleNote: 'Trang mẫu thu nhỏ - mọi từ vàng đều bấm được',
      deckChip: (n: number) => `Deck: ${n} từ`,
      panelHint: 'Chọn bộ từ ngay tại đây',
      modeLabel: 'Display mode',
      yourTurn: 'Tới lượt bạn! Di chuột lên một từ vàng.',
      watching: 'Merid đang chỉ cho bạn',
      finaleTitleSaved: (n: number) => `Bạn vừa lưu ${n} từ 🎉`,
      finaleTitleNone: 'Deck của bạn đang chờ',
      finaleBodySaved: 'Đây chính là cách deck của bạn lớn lên mỗi ngày: đọc, di chuột, lưu lại. Lật thử thẻ đầu tiên xem sao.',
      finaleBodyNone: 'Cuộn lại lên, di chuột lên một từ vàng trong bài đọc và bấm "Save to Deck" - từ đó sẽ xuất hiện ở đây thành flashcard.',
    },
  },
  createDataset: {
    eyebrow: 'Bộ từ tự tạo',
    title: 'Tạo bộ từ vựng của riêng bạn',
    sub: 'Chọn trình độ và chủ đề, sao chép câu lệnh được tạo sẵn, dán vào một AI như ChatGPT, Claude hay Gemini, rồi tải file CSV nhận được lên tiện ích Merid. Không cần biết kỹ thuật.',
    chooseTitle: 'Chọn bộ từ của bạn',
    levelLabel: 'Trình độ tiếng Anh (CEFR)',
    levelHint: 'B2: nền tảng vững · C1: nâng cao · C2: thành thạo',
    topicLabel: 'Chủ đề',
    topicPlaceholder: 'Nhập chủ đề của bạn, ví dụ: bóng đá, marketing…',
    presetLabels: {
      business: 'Kinh doanh & tài chính',
      technology: 'Công nghệ',
      science: 'Khoa học',
      environment: 'Môi trường',
      academic: 'Viết học thuật',
      economics: 'Kinh tế học',
      medicine: 'Y tế & sức khỏe',
      travel: 'Du lịch',
      everyday: 'Giao tiếp hằng ngày',
      custom: 'Chủ đề khác…',
    },
    countLabel: 'Số lượng từ',
    countHint: '100 từ là lựa chọn cân bằng: đủ phong phú mà trang web vẫn mượt.',
    copyTitle: 'Sao chép câu lệnh',
    copyIntro: 'Câu lệnh dưới đây được tạo theo lựa chọn của bạn ở bước 1. Nó yêu cầu AI trả về đúng định dạng CSV mà Merid đọc được.',
    promptLabel: 'Câu lệnh cho AI',
    copy: 'Sao chép câu lệnh',
    copied: 'Đã sao chép ✓',
    pasteTitle: 'Dán vào một AI',
    pasteIntro: 'Mở ChatGPT, Claude, Gemini hoặc một AI khác mà bạn tin dùng, dán toàn bộ câu lệnh rồi gửi. AI sẽ trả về nội dung CSV, hoặc một file .csv tải về được.',
    accuracyNote: 'Lưu ý: từ vựng do AI tạo ra không phải lúc nào cũng chính xác. Hãy đọc lướt lại nghĩa tiếng Việt trước khi dùng và xóa những dòng bạn thấy sai.',
    saveTitle: 'Lưu kết quả thành file .csv',
    saveIntro: 'Bạn cần một file .csv (mã hóa UTF-8) để tải lên Merid. Chọn một trong hai cách:',
    saveOptions: [
      { term: 'Cách dễ nhất.', text: 'Nhờ AI "xuất kết quả thành file .csv tải về". Nhiều AI có thể đính kèm file trực tiếp trong câu trả lời.' },
      { term: 'Tự lưu.', text: 'Sao chép toàn bộ CSV vào một trình soạn thảo văn bản thuần (Notepad trên Windows, TextEdit ở chế độ plain text trên Mac…), rồi lưu file với đuôi .csv.' },
    ],
    templateButton: 'Tải file CSV mẫu (trống)',
    templateHint: 'File mẫu chỉ chứa dòng tiêu đề đúng chuẩn - hữu ích nếu bạn muốn tự điền từ vựng bằng tay.',
    uploadTitle: 'Tải lên Merid',
    uploadIntro: 'Bước cuối diễn ra ngay trong tiện ích:',
    uploadSteps: [
      'Mở tiện ích Merid trên thanh công cụ Chrome.',
      'Bấm "Settings" để mở trang cài đặt.',
      'Tìm mục "My datasets" trong thẻ Vocabulary dataset.',
      'Chọn file .csv vừa lưu ở ô "Upload a CSV file".',
      'Xem kết quả kiểm tra: bao nhiêu từ hợp lệ, dòng nào bị bỏ qua và vì sao.',
      'Bấm "Save dataset", rồi bấm "Use" để bắt đầu học với bộ từ của bạn.',
    ],
    schemaTitle: 'Định dạng file CSV',
    schemaIntro: 'Dòng đầu tiên phải là dòng tiêu đề với đúng các cột sau. Chỉ word và vietnamese là bắt buộc, các cột khác có thể để trống.',
    schemaColHeaders: ['Cột', 'Bắt buộc?', 'Ý nghĩa'],
    schemaRequired: 'Bắt buộc',
    schemaOptional: 'Tùy chọn',
    columns: [
      { name: 'word', required: true, desc: 'Từ tiếng Anh (mỗi từ chỉ xuất hiện một lần)' },
      { name: 'type', required: false, desc: 'Từ loại: n, v, adj, adv…' },
      { name: 'phon_br', required: false, desc: 'Phiên âm IPA giọng Anh, ví dụ /kənˈsɪd.ər/' },
      { name: 'phon_n_am', required: false, desc: 'Phiên âm IPA giọng Mỹ' },
      { name: 'definition', required: false, desc: 'Định nghĩa tiếng Anh ngắn gọn' },
      { name: 'example', required: false, desc: 'Một câu ví dụ tự nhiên' },
      { name: 'vietnamese', required: true, desc: 'Nghĩa tiếng Việt; nhiều nghĩa cách nhau bằng dấu phẩy, đặt cả ô trong ngoặc kép' },
      { name: 'synonyms', required: false, desc: 'Từ đồng nghĩa, cách nhau bằng dấu phẩy' },
      { name: 'antonyms', required: false, desc: 'Từ trái nghĩa, cách nhau bằng dấu phẩy' },
    ],
    exampleTitle: 'Một dòng hợp lệ trông như sau',
    errorsTitle: 'Lỗi thường gặp',
    errors: [
      'Thiếu dòng tiêu đề, hoặc thiếu cột word / vietnamese.',
      'Ô chứa dấu phẩy nhưng không được đặt trong ngoặc kép.',
      'AI trả về bảng Markdown hoặc kèm lời giải thích thay vì CSV thuần.',
      'Lưu bằng Excel thành .xlsx thay vì .csv - Merid chỉ đọc file .csv.',
      'Trùng từ tiếng Anh: Merid giữ dòng xuất hiện trước và bỏ các dòng sau.',
    ],
    limitsNote: 'Giới hạn: tối đa 2 MB mỗi file, 5.000 dòng mỗi bộ từ và 10 bộ từ. Nếu vượt quá, Merid sẽ báo lỗi rõ ràng thay vì tự cắt bớt.',
    privacyNote: 'File của bạn được kiểm tra và lưu ngay trên máy bạn. Merid không tải bộ từ của bạn lên bất kỳ máy chủ nào.',
    outroTitle: 'Sẵn sàng học bằng bộ từ của bạn?',
    outroSub: 'Cài Merid, tải bộ từ vừa tạo lên và duyệt web như mọi ngày - từ vựng sẽ tự tìm đến bạn.',
    ctaTutorial: 'Xem hướng dẫn dùng Merid',
    ctaInstall: 'Thêm Merid vào Chrome',
  },
  apiKeyGuide: {
    eyebrow: 'AI Context Check',
    title: 'Dán API key của riêng bạn',
    sub: 'AI Context Check giúp Merid thông minh hơn hẳn: Google Gemini kiểm tra từng từ đã thay xem có hợp với câu không. Từ nào không hợp sẽ tự đổi lại như cũ. Tính năng chạy bằng API key Gemini miễn phí của riêng bạn. Trang này chỉ cách tạo và dán key - mất chưa đến hai phút.',
    whatTitle: 'Vì sao nên dán API key?',
    whatIntro: 'Bình thường Merid hoạt động hoàn toàn ngoại tuyến. Khi bật AI Context Check, sau khi Merid thay từ trên trang, Google Gemini (flash-lite) sẽ kiểm tra từng từ mới trong câu:',
    whatBullets: [
      { term: 'Ít từ sai hơn.', text: 'Từ mới nào không hợp với câu sẽ tự đổi lại thành từ gốc.' },
      { term: 'Miễn phí.', text: 'Google AI Studio cấp cho mỗi tài khoản Google một API key miễn phí. Hạn mức miễn phí quá đủ cho việc lướt web hằng ngày.' },
      { term: 'Của riêng bạn.', text: 'Key là của riêng bạn. Merid không dùng chung một key cho nhiều người, nhờ vậy tính năng luôn nhanh và miễn phí.' },
    ],
    getTitle: 'Tạo API key Gemini miễn phí',
    getIntro: 'Bạn tạo key trên Google AI Studio. Mất khoảng một phút:',
    getSteps: [
      'Mở aistudio.google.com/apikey trong thẻ mới.',
      'Đăng nhập bằng tài khoản Google bất kỳ.',
      'Bấm "Create API key" (chọn project bất kỳ nếu được hỏi).',
      'Sao chép key. Key là một đoạn chữ dài bắt đầu bằng "AIza…". Hãy giữ kín như mật khẩu.',
    ],
    getCta: 'Mở Google AI Studio',
    getNote: 'Giữ key thật kín: ai có key đều dùng được hạn mức của bạn. Bạn có thể xóa và tạo key mới bất cứ lúc nào ngay trên trang đó.',
    openTitle: 'Mở phần cài đặt AI trong Merid',
    openIntro: 'Quay lại Chrome:',
    openSteps: [
      'Bấm biểu tượng Merid trên thanh công cụ Chrome để mở popup.',
      'Bấm nút "AI Context Check" (hoặc "Settings") - trang cài đặt của Merid sẽ mở ra.',
      'Kéo xuống thẻ "AI context check (beta)".',
    ],
    pasteTitle: 'Dán key, lưu và bật lên',
    pasteIntro: 'Chỉ còn ba cú bấm:',
    pasteSteps: [
      'Dán key vào ô "Gemini API key".',
      'Bấm "Save key", rồi "Test key" để chắc chắn key hoạt động.',
      'Chuyển "Enable AI context check" sang On.',
    ],
    pasteNote: 'Xong - popup giờ hiển thị "AI Context Check: ON". Từ nay, từ nào không hợp với câu sẽ tự đổi lại như cũ trên trang bạn đọc.',
    privacyTitle: 'Key của bạn nằm ở đâu',
    privacyBullets: [
      'Key được lưu trên thiết bị của bạn. Nếu đăng nhập Merid, key còn được sao lưu riêng tư vào tài khoản của bạn (chỉ mình bạn đọc được) để dùng trên nhiều thiết bị.',
      'Merid chỉ gửi những đoạn câu ngắn quanh từ được thay tới Google Gemini. Không bao giờ gửi cả trang, và không gửi gì về máy chủ Merid.',
      'Bạn có thể tắt tính năng hoặc xóa key bất cứ lúc nào trong Settings.',
    ],
    troubleTitle: 'Nếu có gì đó không ổn',
    troubles: [
      { term: '"Test key" báo lỗi.', text: 'Sao chép lại key, không kèm khoảng trắng hay xuống dòng. Key phải là một đoạn chữ liền mạch bắt đầu bằng "AIza".' },
      { term: 'Dùng nhiều thì từ ngừng được kiểm tra.', text: 'Có thể bạn đã dùng hết hạn mức miễn phí trong ngày. Hạn mức sẽ tự đặt lại. Merid vẫn hoạt động bình thường khi không có bước kiểm tra.' },
      { term: 'Không thấy nút "Create API key".', text: 'Một số tài khoản Google của công ty/trường học chặn AI Studio. Hãy dùng tài khoản Google cá nhân.' },
    ],
    sim: {
      title: 'Tập trước tại đây, 30 giây',
      intro: 'Đây là mô phỏng đúng các bước bạn sắp làm trên Google AI Studio và trong Merid. Bấm thử cho quen tay - không có gì được tạo thật cả.',
      step1Hint: 'Bấm "Create API key"',
      step2Hint: 'Sao chép key vừa tạo',
      step3Hint: 'Dán vào Merid rồi bấm Save',
      done: 'Xong! Ngoài đời cũng đúng ba cú bấm như vậy.',
      replay: 'Làm lại từ đầu',
    },
    beforeAfter: {
      title: 'AI Context Check sửa được gì?',
      intro: 'Tiếng Việt nhiều từ đồng âm: "đá" trong "đá bóng" không phải viên đá. Gạt công tắc để xem AI phát hiện từ thay sai ngữ cảnh và tự trả lại như cũ.',
      wrongNote: 'Không có AI: "đá" (sút bóng) bị thay nhầm thành "rock" (hòn đá).',
      fixedNote: 'AI nhận ra "rock" không hợp câu này và tự trả lại "đá". Từ đúng ngữ cảnh vẫn giữ nguyên.',
    },
    outroTitle: 'Vậy là Merid đã chạy hết công suất',
    outroSub: 'Một chiếc key, dán một lần. Từ nay, mọi từ được thay đều được kiểm tra trong câu.',
    ctaTutorial: 'Xem hướng dẫn dùng Merid',
    ctaInstall: 'Thêm Merid vào Chrome',
  },
  welcome: {
    eyebrow: 'Cài đặt thành công',
    title: 'Merid đã sẵn sàng',
    sub: 'Đừng chỉ đọc hướng dẫn - làm thử ngay trên trang này. Mỗi việc bạn hoàn thành sẽ tự được đánh dấu ở danh sách bên dưới.',
    checklist: {
      title: 'Khởi động cùng Merid',
      progress: (done: number, total: number) => `${done}/${total} bước`,
      installed: 'Cài Merid vào Chrome',
      pinned: 'Tập ghim Merid lên thanh công cụ',
      hovered: 'Mở thẻ học đầu tiên (di chuột lên từ vàng)',
      saved: 'Lưu từ đầu tiên vào deck',
      signedIn: 'Đăng nhập để đồng bộ deck (không bắt buộc)',
      signedInAs: (email: string) => `Đã đăng nhập: ${email}`,
      signInCta: 'Đăng nhập',
      allDone: 'Tuyệt vời! Giờ mở một trang báo thật và để Merid làm việc của nó.',
    },
    practice: {
      title: 'Đây chính là Merid',
      intro: 'Đoạn bài đọc dưới đây đang chạy Merid thật: vài từ tiếng Việt đã được thay bằng từ vựng tiếng Anh có gạch chân vàng.',
      hint: 'Di chuột (hoặc chạm) lên một từ vàng ngay bây giờ, rồi bấm "Save to Deck" thử xem.',
      savedNote: (n: number) => `Bạn đã lưu ${n} từ ở ngay trang chào mừng này 🎉`,
    },
    pin: {
      title: 'Tập ghim Merid, ngay tại đây',
      intro: 'Để mở Merid nhanh, bạn cần ghim nó lên thanh công cụ. Thanh công cụ giả bên dưới hoạt động y hệt Chrome thật - thử luôn cho quen tay:',
      watch: 'Xem Merid làm mẫu…',
      yourTurn: 'Tới lượt bạn: bấm biểu tượng mảnh ghép 🧩',
      menuTitle: 'Tiện ích',
      pinnedNote: 'Đẹp! Chữ M vàng đã nằm cạnh thanh địa chỉ. Trong Chrome thật, hãy làm đúng như vậy.',
      replay: 'Xem lại hướng dẫn',
    },
    mission: {
      title: 'Nhiệm vụ đầu tiên của bạn',
      body: 'Mở một trang báo tiếng Việt, tìm 3 từ vàng và lưu ít nhất 1 từ vào deck. Merid đang bật sẵn - chỉ cần đọc như bình thường.',
      sitesLabel: 'Chọn một trang để bắt đầu:',
    },
    extrasTitle: 'Khi đã quen, mở khóa thêm',
    extras: [
      {
        term: 'Đồng bộ bộ thẻ',
        text: 'Đăng nhập để từ đã lưu theo bạn trên mọi máy và ôn tập ngay trên merid.site.',
        to: '/login',
        cta: 'Đăng nhập',
      },
      {
        term: 'AI kiểm tra ngữ cảnh',
        text: 'Dán API key Gemini miễn phí của riêng bạn để mọi từ được thay đều được kiểm tra trong câu.',
        to: '/api-key-guide',
        cta: 'Xem hướng dẫn',
      },
      {
        term: 'Bộ từ của riêng bạn',
        text: 'Tạo bộ từ vựng theo chủ đề bạn thích bằng AI rồi tải lên Merid.',
        to: '/create-dataset',
        cta: 'Tạo bộ từ',
      },
    ],
    outroTitle: 'Mẹo nhỏ trước khi bắt đầu',
    outroSub: 'Gặp trang không muốn thay từ, như ngân hàng hay công việc? Mở Merid và nhấn "Tắt trên trang này". Merid sẽ chừa riêng trang đó ra.',
    ctaDemo: 'Xem demo tương tác',
    ctaTutorial: 'Hướng dẫn chi tiết',
  },
  try: {
    eyebrow: 'Thử với văn bản của bạn',
    title: 'Dán bất kỳ đoạn tiếng Việt nào vào đây',
    sub: 'Một email, một bài báo, bài đọc trên lớp… Merid sẽ xử lý ngay trong trình duyệt của bạn bằng bộ từ vựng thật của extension - hơn 3.300 từ SAT, C1 và C2.',
    inputLabel: 'Văn bản của bạn',
    placeholder: 'Dán một đoạn văn tiếng Việt vào đây…',
    sampleBtn: 'Dùng đoạn văn mẫu',
    clearBtn: 'Xoá',
    datasetLabel: 'Bộ từ vựng',
    intensityLabel: 'Cường độ',
    modeLabel: 'Kiểu hiển thị',
    loading: 'Đang tải bộ từ vựng…',
    loadError: 'Không tải được bộ từ vựng. Kiểm tra kết nối mạng rồi thử lại nhé.',
    outputLabel: 'Kết quả - đúng như Merid hiển thị trên trang thật',
    emptyOutput: 'Chưa tìm thấy từ nào để thay trong đoạn này. Thử một đoạn dài hơn, tăng cường độ, hoặc chuyển bộ từ "All" xem sao.',
    matches: (n: number) => `${n} từ được thay`,
    hoverHint: 'Di chuột lên từ vàng để mở thẻ học, y như trên trang thật.',
    privacyNote: 'Văn bản của bạn được xử lý ngay trong trình duyệt và không được gửi đi đâu cả.',
  },
  goodbye: {
    eyebrow: 'Tạm biệt',
    title: 'Merid đã được gỡ khỏi trình duyệt',
    sub: 'Cảm ơn bạn đã dùng thử. Nếu bạn dành 30 giây cho biết lý do, bản sau sẽ tốt hơn cho những người học khác.',
    surveyTitle: 'Vì sao bạn gỡ Merid?',
    surveyIntro: 'Chọn mọi lý do đúng với bạn - khảo sát ẩn danh, không thu thập thông tin cá nhân.',
    reasons: [
      { id: 'too-many', label: 'Thay quá nhiều từ, gây rối trang' },
      { id: 'wrong-sites', label: 'Chạy ở trang tôi không muốn (ngân hàng, công việc…)' },
      { id: 'not-useful', label: 'Từ vựng chưa phù hợp hoặc chưa hữu ích với tôi' },
      { id: 'performance', label: 'Làm trang chậm hoặc vỡ giao diện' },
      { id: 'privacy', label: 'Lo ngại về quyền riêng tư' },
      { id: 'switched', label: 'Tôi chuyển sang công cụ khác' },
      { id: 'testing', label: 'Tôi chỉ cài dùng thử' },
      { id: 'other', label: 'Lý do khác' },
    ],
    commentLabel: 'Bạn muốn nhắn gì thêm? (không bắt buộc)',
    commentPlaceholder: 'Điều gì sẽ khiến bạn quay lại với Merid?',
    submit: 'Gửi góp ý',
    submitting: 'Đang gửi…',
    pickOne: 'Chọn ít nhất một lý do hoặc viết vài dòng góp ý nhé.',
    thanksTitle: 'Cảm ơn bạn! 💛',
    thanksBody: 'Góp ý đã được ghi nhận. Chúc bạn học tốt - và hẹn gặp lại ở một phiên bản Merid đáng cài hơn.',
    error: 'Không gửi được góp ý. Kiểm tra kết nối mạng rồi thử lại giúp mình nhé.',
    tipsTitle: 'Có thể bạn chưa biết',
    tips: [
      { term: '"Tắt trên trang này".', text: 'Mở Merid trên trang bạn không muốn thay từ và nhấn nút này - Merid sẽ bỏ qua riêng trang đó, kể cả tên miền phụ.' },
      { term: 'Kéo mật độ xuống "Nhẹ nhàng".', text: 'Ít từ được thay hơn hẳn, trang đọc thoải mái hơn nhiều.' },
      { term: 'Chế độ "Tô sáng".', text: 'Giữ nguyên chữ tiếng Việt, chỉ tô sáng - di chuột mới hiện nghĩa tiếng Anh.' },
    ],
    rescue: {
      tryLabel: 'Thử ngay tại đây:',
      tooMany: {
        title: 'Cái này sửa được trong 5 giây',
        body: 'Kéo thanh cường độ xuống và xem cùng một đoạn văn thay đổi. Ở mức Nhẹ nhàng, Merid chỉ chạm vào 2-3 từ mỗi trang.',
      },
      wrongSites: {
        title: 'Merid có nút dành riêng cho việc này',
        body: 'Trên trang bạn không muốn thay từ (ngân hàng, công việc…), mở popup Merid và bấm nút này - trang đó sẽ được chừa ra vĩnh viễn:',
        siteBtn: 'Tắt trên trang này',
        siteBtnOff: 'Đã tắt trên trang này ✓',
      },
      notUseful: {
        title: 'Từ vựng chưa đúng thứ bạn cần?',
        body: 'Ngoài SAT/C1/C2, bạn có thể tự tạo bộ từ theo đúng chủ đề mình quan tâm (marketing, y khoa, bóng đá…) bằng AI rồi tải lên Merid.',
        cta: 'Tạo bộ từ của riêng bạn',
      },
    },
    reinstallTitle: 'Đổi ý rồi?',
    reinstallBody: 'Cài lại chỉ mất vài giây - bộ thẻ đã đồng bộ của bạn vẫn còn nguyên trong tài khoản.',
    ctaReinstall: 'Cài lại Merid',
  },
}

const en: Strings = {
  meta: {
    title: 'Merid: Learn English while browsing Vietnamese websites',
    tutorialTitle: 'Tutorial: How to use Merid',
    createDatasetTitle: 'Create your own vocabulary dataset with AI - Merid',
    apiKeyGuideTitle: 'Paste your own API key for the best Merid - Merid',
    welcomeTitle: 'Merid is ready: start in 2 minutes',
    goodbyeTitle: 'Goodbye - help make Merid better',
    tryTitle: 'Try Merid on your own text - Merid',
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
      googleButton: 'Sign in with Google',
      orEmail: 'or use your email',
      errors: {
        badCredentials: 'Email or password is incorrect.',
        emailInUse: 'This email is already registered. Try logging in.',
        weakPassword: 'Password must be at least 8 characters.',
        invalidEmail: 'Please enter a valid email address.',
        tooManyRequests: 'Too many attempts. Try again in a few minutes.',
        network: 'No connection. Check your internet and try again.',
        unknown: 'Something went wrong. Please try again.',
        notConfigured: 'Accounts are not available on this deployment.',
        cancelled: 'Sign-in was cancelled.',
        popupBlocked: 'Your browser blocked the sign-in window. Allow popups for merid.site and try again.',
        providerDisabled: 'Google sign-in is not enabled for this project.',
      },
    },
  },
  nav: {
    demo: 'Demo',
    features: 'Features',
    how: 'How it works',
    tutorial: 'Tutorial',
    tryIt: 'Try your text',
    createDataset: 'Create dataset',
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
    scrollCue: 'Scroll down to try the live demo',
  },
  demo: {
    eyebrow: 'Interactive demo',
    title: 'See it work in real time',
    sub: "This is the extension's real panel. Pick a dataset, tune the intensity, then scroll the Wikipedia page or the Facebook tab below and hover any highlighted word.",
    resizeHandle: 'Drag to resize the demo page. Double-click to restore the full width.',
    tryIt: 'Your turn! Try it yourself.',
    guiding: 'Merid is showing you around',
    ownTextTitle: 'Want to try it on your own text?',
    ownTextBody: "Paste an email, a news article, or your class reading and watch Merid work through it with the extension's real datasets - 3,300+ words.",
    ownTextCta: 'Try it on your text',
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
        body: 'SAT, C1, and C2 are built in - and you can now create your own dataset for any level and topic with AI on the "Create dataset" page, then upload it in Settings. Pick your goal, and Merid picks the words worth learning.',
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
    calc: {
      title: 'How many new words would you meet?',
      minutesLabel: 'You browse about',
      minutesValue: (m: number) => `${m} minutes a day`,
      intensityLabel: 'Intensity',
      perDay: (n: number) => `≈ ${n} vocabulary encounters per day`,
      perWeek: (n: number) => `≈ ${n} new words per week`,
      perMonth: (n: number) => `≈ ${n} new words per month`,
      note: "An estimate based on average reading speed and Merid's replacement density. Real numbers depend on what you read.",
    },
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
        a: 'SAT, C1, and C2 are built in (or "All" to combine them). You can also create your own topic dataset: open the "Create dataset" page on merid.site, generate a CSV with AI, and upload it in the extension Settings.',
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
    createDataset: 'Create dataset',
    apiKeyGuide: 'API key guide',
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
    scrolly: {
      browserTitle: 'Sample article - baomau.vn',
      articleNote: 'A miniature sample page - every gold word is clickable',
      deckChip: (n: number) => `Deck: ${n} ${n === 1 ? 'word' : 'words'}`,
      panelHint: 'Pick a dataset right here',
      modeLabel: 'Display mode',
      yourTurn: 'Your turn! Hover a gold word.',
      watching: 'Merid is showing you',
      finaleTitleSaved: (n: number) => `You just saved ${n} ${n === 1 ? 'word' : 'words'} 🎉`,
      finaleTitleNone: 'Your deck is waiting',
      finaleBodySaved: 'This is exactly how your deck grows every day: read, hover, save. Flip your first card below.',
      finaleBodyNone: 'Scroll back up, hover a gold word in the article and press "Save to Deck" - it will appear here as a flashcard.',
    },
  },
  createDataset: {
    eyebrow: 'Custom datasets',
    title: 'Create your own vocabulary dataset',
    sub: 'Pick a level and a topic, copy the generated prompt, paste it into an AI like ChatGPT, Claude or Gemini, then upload the resulting CSV into the Merid extension. No technical skills needed.',
    chooseTitle: 'Choose your dataset',
    levelLabel: 'English level (CEFR)',
    levelHint: 'B2: solid foundation · C1: advanced · C2: mastery',
    topicLabel: 'Topic',
    topicPlaceholder: 'Type your own topic, e.g. football, marketing…',
    presetLabels: {
      business: 'Business & finance',
      technology: 'Technology',
      science: 'Science',
      environment: 'Environment',
      academic: 'Academic writing',
      economics: 'Economics',
      medicine: 'Medicine & health',
      travel: 'Travel',
      everyday: 'Everyday conversation',
      custom: 'Custom topic…',
    },
    countLabel: 'Number of words',
    countHint: '100 words is the sweet spot: plenty of variety while pages stay fast.',
    copyTitle: 'Copy the prompt',
    copyIntro: 'The prompt below is generated from your choices in step 1. It instructs the AI to return exactly the CSV format Merid understands.',
    promptLabel: 'Prompt for the AI',
    copy: 'Copy prompt',
    copied: 'Copied ✓',
    pasteTitle: 'Paste it into an AI',
    pasteIntro: 'Open ChatGPT, Claude, Gemini or another capable AI, paste the complete prompt and send it. The AI will reply with CSV content, or a downloadable .csv file.',
    accuracyNote: 'Note: AI-generated vocabulary is not always correct. Skim the Vietnamese meanings before using the dataset and delete any rows that look wrong.',
    saveTitle: 'Save the result as a .csv file',
    saveIntro: 'You need a .csv file (UTF-8) to upload into Merid. Pick whichever way is easier:',
    saveOptions: [
      { term: 'Easiest.', text: 'Ask the AI to "provide the result as a downloadable .csv file". Many AIs can attach the file directly in their reply.' },
      { term: 'Do it yourself.', text: 'Copy the whole CSV into a plain-text editor (Notepad on Windows, TextEdit in plain-text mode on Mac…) and save the file with a .csv extension.' },
    ],
    templateButton: 'Download blank CSV template',
    templateHint: 'The template contains just the correct header row - handy if you want to fill in words by hand.',
    uploadTitle: 'Upload it to Merid',
    uploadIntro: 'The last step happens right inside the extension:',
    uploadSteps: [
      'Open the Merid extension from the Chrome toolbar.',
      'Click "Settings" to open the settings page.',
      'Find "My datasets" inside the Vocabulary dataset card.',
      'Choose your saved .csv in "Upload a CSV file".',
      'Review the validation result: how many words are valid, which rows were skipped and why.',
      'Click "Save dataset", then "Use" to start learning with your own words.',
    ],
    schemaTitle: 'CSV file format',
    schemaIntro: 'The first line must be a header row with these columns. Only word and vietnamese are required; every other column may be empty.',
    schemaColHeaders: ['Column', 'Required?', 'Meaning'],
    schemaRequired: 'Required',
    schemaOptional: 'Optional',
    columns: [
      { name: 'word', required: true, desc: 'The English headword (each word may appear only once)' },
      { name: 'type', required: false, desc: 'Part of speech: n, v, adj, adv…' },
      { name: 'phon_br', required: false, desc: 'British IPA, e.g. /kənˈsɪd.ər/' },
      { name: 'phon_n_am', required: false, desc: 'North American IPA' },
      { name: 'definition', required: false, desc: 'A concise English definition' },
      { name: 'example', required: false, desc: 'One natural example sentence' },
      { name: 'vietnamese', required: true, desc: 'Vietnamese meaning(s); separate several with commas inside one quoted field' },
      { name: 'synonyms', required: false, desc: 'Comma-separated synonyms' },
      { name: 'antonyms', required: false, desc: 'Comma-separated antonyms' },
    ],
    exampleTitle: 'A valid row looks like this',
    errorsTitle: 'Common mistakes',
    errors: [
      'Missing the header row, or missing the word / vietnamese columns.',
      'A field contains a comma but is not wrapped in double quotes.',
      'The AI returned a Markdown table or added explanations instead of raw CSV.',
      'Saving from Excel as .xlsx instead of .csv - Merid only reads .csv files.',
      'Duplicate English headwords: Merid keeps the first row and skips the rest.',
    ],
    limitsNote: 'Limits: at most 2 MB per file, 5,000 rows per dataset and 10 datasets. Beyond that, Merid shows a clear error instead of silently truncating.',
    privacyNote: 'Your file is validated and stored on your device only. Merid never uploads your dataset to any server.',
    outroTitle: 'Ready to learn from your own words?',
    outroSub: 'Install Merid, upload the dataset you just created, and browse like you always do - the vocabulary will find you.',
    ctaTutorial: 'See how to use Merid',
    ctaInstall: 'Add Merid to Chrome',
  },
  apiKeyGuide: {
    eyebrow: 'AI Context Check',
    title: 'Paste your own API key',
    sub: 'AI Context Check makes Merid much smarter: Google Gemini checks every replaced word in its sentence and changes back the ones that do not fit. It runs on your own free Gemini API key. This page shows how to create the key and paste it in - it takes under two minutes.',
    whatTitle: 'Why paste an API key?',
    whatIntro: 'Normally Merid works fully offline. With AI Context Check on, after Merid replaces words on a page, Google Gemini (flash-lite) checks each new word in its sentence:',
    whatBullets: [
      { term: 'Fewer wrong words.', text: 'If a new word does not fit its sentence, Merid changes it back to the original text on its own.' },
      { term: 'Free.', text: 'Google AI Studio gives every Google account a free API key. The free limit is more than enough for everyday browsing.' },
      { term: 'Yours.', text: 'The key belongs to you alone. Merid never shares one key between users, so the feature stays fast and free.' },
    ],
    getTitle: 'Create your free Gemini API key',
    getIntro: 'You create the key on Google AI Studio. It takes about one minute:',
    getSteps: [
      'Open aistudio.google.com/apikey in a new tab.',
      'Sign in with any Google account.',
      'Click "Create API key" (pick any project if asked).',
      'Copy the key. It is a long piece of text that starts with "AIza…". Keep it safe like a password.',
    ],
    getCta: 'Open Google AI Studio',
    getNote: 'Keep the key private: anyone who has it can use up your free limit. You can delete it and make a new one at any time on the same page.',
    openTitle: 'Open the AI settings in Merid',
    openIntro: 'Back in Chrome:',
    openSteps: [
      'Click the Merid icon in the Chrome toolbar to open the popup.',
      'Click the "AI Context Check" button (or "Settings") - the Merid settings page opens.',
      'Scroll down to the "AI context check (beta)" card.',
    ],
    pasteTitle: 'Paste the key, save it, turn it on',
    pasteIntro: 'Three clicks left:',
    pasteSteps: [
      'Paste your key into the "Gemini API key" field.',
      'Press "Save key", then "Test key" to make sure it works.',
      'Switch "Enable AI context check" to On.',
    ],
    pasteNote: 'Done - the popup now shows "AI Context Check: ON". From now on, words that do not fit are quietly changed back on the pages you read.',
    privacyTitle: 'Where your key lives',
    privacyBullets: [
      'Your key is stored on your device. If you sign in to Merid, it is also backed up privately to your account (only you can read it), so it works on all your devices.',
      'Merid only sends short pieces of the sentence around each replaced word to Google Gemini. It never sends whole pages, and it never sends anything to Merid servers.',
      'You can turn the feature off or delete the key at any time in Settings.',
    ],
    troubleTitle: 'If something does not work',
    troubles: [
      { term: '"Test key" fails.', text: 'Copy the key again with no spaces or line breaks. It must be one single piece of text that starts with "AIza".' },
      { term: 'Checking stops after heavy use.', text: 'You may have reached the free daily limit. It resets on its own. Merid keeps working normally without the check.' },
      { term: 'No "Create API key" button.', text: 'Some work or school Google accounts block AI Studio. Use a personal Google account instead.' },
    ],
    sim: {
      title: 'Practice here first, 30 seconds',
      intro: 'This is a simulation of the exact steps you are about to do on Google AI Studio and inside Merid. Click through it - nothing real is created.',
      step1Hint: 'Click "Create API key"',
      step2Hint: 'Copy the new key',
      step3Hint: 'Paste it into Merid and press Save',
      done: 'Done! The real thing is the same three clicks.',
      replay: 'Start over',
    },
    beforeAfter: {
      title: 'What does the AI Context Check fix?',
      intro: 'Vietnamese is full of homonyms: the "đá" in "đá bóng" (kick a ball) is not a rock. Flip the switch and watch the AI catch an out-of-context replacement and quietly undo it.',
      wrongNote: 'Without AI: "đá" (to kick) is wrongly replaced with "rock" (a stone).',
      fixedNote: 'The AI notices "rock" does not fit this sentence and restores "đá". The correct replacement stays.',
    },
    outroTitle: 'That is Merid at full strength',
    outroSub: 'One key, pasted once. From now on, every replaced word is checked in its sentence.',
    ctaTutorial: 'See how to use Merid',
    ctaInstall: 'Add Merid to Chrome',
  },
  welcome: {
    eyebrow: 'Installed successfully',
    title: 'Merid is ready',
    sub: 'Don\'t just read the instructions - do them, right on this page. Everything you complete ticks itself off in the checklist below.',
    checklist: {
      title: 'Getting started with Merid',
      progress: (done: number, total: number) => `${done}/${total} steps`,
      installed: 'Install Merid in Chrome',
      pinned: 'Practice pinning Merid to the toolbar',
      hovered: 'Open your first learning card (hover a gold word)',
      saved: 'Save your first word to the deck',
      signedIn: 'Sign in to sync your deck (optional)',
      signedInAs: (email: string) => `Signed in as ${email}`,
      signInCta: 'Sign in',
      allDone: 'Beautiful! Now open a real news site and let Merid do its thing.',
    },
    practice: {
      title: 'This is Merid',
      intro: 'The passage below is running the real thing: a few Vietnamese words have been swapped for English vocabulary with a gold underline.',
      hint: 'Hover (or tap) a gold word right now, then try pressing "Save to Deck".',
      savedNote: (n: number) => `You already saved ${n} ${n === 1 ? 'word' : 'words'} on this welcome page 🎉`,
    },
    pin: {
      title: 'Practice pinning Merid, right here',
      intro: 'To open Merid quickly you will want it pinned to the toolbar. The fake toolbar below works exactly like real Chrome - try it now:',
      watch: 'Watch Merid demonstrate…',
      yourTurn: 'Your turn: click the puzzle icon 🧩',
      menuTitle: 'Extensions',
      pinnedNote: 'Nice! The gold M now sits next to the address bar. Do exactly this in your real Chrome.',
      replay: 'Replay the demo',
    },
    mission: {
      title: 'Your first mission',
      body: 'Open a Vietnamese news site, find 3 gold words, and save at least 1 to your deck. Merid is already on - just read like you always do.',
      sitesLabel: 'Pick a site to start:',
    },
    extrasTitle: 'When you are settled in, unlock more',
    extras: [
      {
        term: 'Deck sync',
        text: 'Sign in and your saved words follow you across devices, ready to study on merid.site.',
        to: '/login',
        cta: 'Sign in',
      },
      {
        term: 'AI context check',
        text: 'Paste your own free Gemini API key and Merid checks every replaced word against its sentence.',
        to: '/api-key-guide',
        cta: 'Read the guide',
      },
      {
        term: 'Your own dataset',
        text: 'Use AI to build a vocabulary set for any topic you like, then upload it to Merid.',
        to: '/create-dataset',
        cta: 'Create a dataset',
      },
    ],
    outroTitle: 'One tip before you start',
    outroSub: 'On a site where you don\'t want replacements, like banking or work tools, open Merid and press "Turn off on this site." Merid then leaves that site alone.',
    ctaDemo: 'Try the interactive demo',
    ctaTutorial: 'Full tutorial',
  },
  try: {
    eyebrow: 'Try it on your text',
    title: 'Paste any Vietnamese text here',
    sub: "An email, a news story, your class reading… Merid processes it right in your browser using the extension's real datasets - 3,300+ SAT, C1 and C2 words.",
    inputLabel: 'Your text',
    placeholder: 'Paste a Vietnamese passage here…',
    sampleBtn: 'Use a sample passage',
    clearBtn: 'Clear',
    datasetLabel: 'Dataset',
    intensityLabel: 'Intensity',
    modeLabel: 'Display mode',
    loading: 'Loading the dataset…',
    loadError: 'Could not load the dataset. Check your connection and try again.',
    outputLabel: 'Result - exactly what Merid shows on a real page',
    emptyOutput: 'No replaceable words found in this passage. Try a longer text, raise the intensity, or switch to the "All" dataset.',
    matches: (n: number) => `${n} ${n === 1 ? 'word' : 'words'} replaced`,
    hoverHint: 'Hover a gold word to open the learning card, just like on a real page.',
    privacyNote: 'Your text is processed in your browser and never sent anywhere.',
  },
  goodbye: {
    eyebrow: 'Goodbye',
    title: 'Merid has been uninstalled',
    sub: 'Thanks for giving it a try. If you can spare 30 seconds, telling us why makes the next version better for other learners.',
    surveyTitle: 'Why did you remove Merid?',
    surveyIntro: 'Tick everything that applies - the survey is anonymous and collects no personal information.',
    reasons: [
      { id: 'too-many', label: 'Too many replacements, pages felt cluttered' },
      { id: 'wrong-sites', label: 'It ran on sites where I didn\'t want it (banking, work…)' },
      { id: 'not-useful', label: 'The vocabulary wasn\'t right or useful for me' },
      { id: 'performance', label: 'It slowed pages down or broke layouts' },
      { id: 'privacy', label: 'Privacy concerns' },
      { id: 'switched', label: 'I switched to another tool' },
      { id: 'testing', label: 'I was just trying it out' },
      { id: 'other', label: 'Something else' },
    ],
    commentLabel: 'Anything else you want to tell us? (optional)',
    commentPlaceholder: 'What would bring you back to Merid?',
    submit: 'Send feedback',
    submitting: 'Sending…',
    pickOne: 'Pick at least one reason or write a short note first.',
    thanksTitle: 'Thank you! 💛',
    thanksBody: 'Your feedback has been recorded. Happy studying - and see you in a version of Merid worth reinstalling.',
    error: 'Could not send your feedback. Please check your connection and try again.',
    tipsTitle: 'In case you missed it',
    tips: [
      { term: '"Turn off on this site".', text: 'Open Merid on any site where replacements are unwelcome and press this - Merid skips that site (subdomains included) from then on.' },
      { term: 'Drop the intensity to "Casual".', text: 'Far fewer words get replaced and pages read much more comfortably.' },
      { term: '"Highlight" mode.', text: 'Keeps the Vietnamese text untouched and only highlights - the English appears when you hover.' },
    ],
    rescue: {
      tryLabel: 'Try it right here:',
      tooMany: {
        title: 'This one is a 5-second fix',
        body: 'Drag the intensity down and watch the same passage change. On Casual, Merid touches only 2-3 words per page.',
      },
      wrongSites: {
        title: 'Merid has a button exactly for this',
        body: 'On any site where replacements are unwelcome (banking, work…), open the Merid popup and press this - that site is skipped for good:',
        siteBtn: 'Turn off on this site',
        siteBtnOff: 'Turned off on this site ✓',
      },
      notUseful: {
        title: 'Vocabulary not quite right for you?',
        body: 'Beyond SAT/C1/C2, you can build a dataset for exactly the topics you care about (marketing, medicine, football…) with AI and upload it to Merid.',
        cta: 'Create your own dataset',
      },
    },
    reinstallTitle: 'Changed your mind?',
    reinstallBody: 'Reinstalling takes seconds - your synced deck is still safe in your account.',
    ctaReinstall: 'Reinstall Merid',
  },
}

export const STRINGS: Record<Lang, Strings> = { vi, en }
