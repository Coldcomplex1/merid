import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import { CHROME_STORE_URL } from '../config'
import { useLang, usePageTitle } from '../i18n/LanguageContext'
import type { Lang } from '../i18n/translations'

/*
 * Privacy Policy for merid.site and the Merid Chrome extension.
 *
 * This page is written to satisfy the Chrome Web Store's Developer Program
 * Policies and the User Data Privacy / Limited Use requirements: it discloses
 * every category of data the extension touches, where each category is
 * processed, what (if anything) leaves the device and only after which opt-in,
 * the exact permissions used and why, the third parties involved, and how a
 * user can inspect, control and delete their data.
 *
 * The content is bilingual (Vietnamese default, English) and kept in this file
 * on purpose: a legal document reads best as one continuous, reviewable
 * artefact rather than scattered across the shared translation catalog.
 *
 * If the extension's behaviour changes (new permission, new network call, new
 * third party), update BOTH language versions here and bump the "last updated"
 * date, then mirror the change in merid-extension-final/PRIVACY.md and the
 * Chrome Web Store listing so all three stay in sync.
 */

type Block =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'note'; text: string }

interface Section {
  id: string
  heading: string
  blocks: Block[]
}

interface Policy {
  updated: string
  title: string
  intro: string[]
  tocLabel: string
  sections: Section[]
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Vietnamese (default)
 * ───────────────────────────────────────────────────────────────────────── */

const POLICY_VI: Policy = {
  updated: 'Cập nhật lần cuối: ngày 22 tháng 7, 2026',
  title: 'Chính sách bảo mật',
  tocLabel: 'Nội dung',
  intro: [
    'Merid là một tiện ích mở rộng (extension) cho trình duyệt Chrome giúp người nói tiếng Việt học từ vựng tiếng Anh một cách tự nhiên: khi bạn đọc web, Merid thay một vài từ tiếng Việt bằng từ tiếng Anh tương ứng. Chính sách này giải thích chính xác Merid xử lý dữ liệu như thế nào — cả trên trang web merid.site lẫn trong tiện ích.',
    'Nguyên tắc cốt lõi: ở trạng thái mặc định, Merid xử lý mọi thứ ngay bên trong trình duyệt của bạn và không gửi bất cứ dữ liệu nào đi đâu cả. Chỉ có hai tính năng tùy chọn — đồng bộ bộ thẻ (deck sync) và kiểm tra ngữ cảnh bằng AI — mới gửi một lượng dữ liệu giới hạn ra khỏi thiết bị, và chỉ sau khi chính bạn bật chúng lên. Merid không vận hành máy chủ riêng nào cả.',
  ],
  sections: [
    {
      id: 'single-purpose',
      heading: '1. Mục đích duy nhất của tiện ích',
      blocks: [
        {
          type: 'p',
          text: 'Merid có một mục đích duy nhất: giúp người học tiếng Anh tiếp xúc với từ vựng mục tiêu ngay trong lúc đọc web, bằng cách thay thế một số từ trên trang và cung cấp thông tin từ điển, luyện tập cùng công cụ ôn tập. Tiện ích không phục vụ bất kỳ mục đích không liên quan nào (không quảng cáo, không theo dõi hành vi, không khai thác dữ liệu).',
        },
      ],
    },
    {
      id: 'local',
      heading: '2. Dữ liệu được xử lý cục bộ trên thiết bị',
      blocks: [
        {
          type: 'p',
          text: 'Những dữ liệu sau được xử lý và lưu trữ ngay trong trình duyệt của bạn. Trừ các trường hợp tùy chọn nêu ở Mục 3, chúng không bao giờ rời khỏi thiết bị:',
        },
        {
          type: 'ul',
          items: [
            'Nội dung trang web (page text). Để tìm từ vựng cần thay, tiện ích đọc phần văn bản hiển thị của trang bạn đang xem và so khớp với các danh sách từ đi kèm. Việc quét và thay thế này diễn ra hoàn toàn trong trình duyệt. Merid không lưu lại lịch sử duyệt web, không lưu URL, và không gửi nội dung trang đi đâu theo mặc định.',
            'Cài đặt của bạn. Các tùy chọn (bộ dữ liệu đã chọn, chế độ hiển thị, cường độ thay từ, hướng Việt→Anh / Anh→Anh, trạng thái bật/tắt, và danh sách các trang bạn đã tạm dừng Merid) được lưu trên thiết bị qua chrome.storage. Nếu bạn bật Chrome Sync, phần cài đặt này có thể được Google đồng bộ giữa các hồ sơ Chrome của chính bạn — bản thân Merid không có máy chủ tài khoản nào.',
            'Bộ thẻ (deck) của bạn. Những từ bạn lưu ("Save to Deck") và những từ bạn đánh dấu đã biết ("I know this") được lưu trên thiết bị. Chúng chỉ rời khỏi thiết bị thông qua tính năng đồng bộ tùy chọn ở Mục 3.',
            'Bộ dữ liệu tùy chỉnh bạn tải lên. Các tệp CSV từ vựng bạn nhập trong Cài đặt → "My datasets" được kiểm tra và lưu chỉ trên thiết bị (chrome.storage.local). Chúng không bao giờ được tải lên Merid, Firebase, dịch vụ AI hay bất kỳ nơi nào khác, và không nằm trong phần đồng bộ tùy chọn.',
          ],
        },
      ],
    },
    {
      id: 'off-device',
      heading: '3. Dữ liệu được gửi ra khỏi thiết bị',
      blocks: [
        {
          type: 'note',
          text: 'Theo mặc định: không có gì cả. Khi chưa đăng nhập và chưa nhập API key, tiện ích không thực hiện bất kỳ yêu cầu mạng nào và không bao giờ truyền nội dung trang, URL, lịch sử duyệt web, thông tin định danh cá nhân, cookie, hay nội dung biểu mẫu/ô nhập đi đâu cả.',
        },
        {
          type: 'p',
          text: 'A. Đồng bộ bộ thẻ tùy chọn (tắt trừ khi bạn đăng nhập). Bạn có thể đăng nhập (trên merid.site — phiên đăng nhập tự động chuyển sang tiện ích — hoặc từ trang Cài đặt) để sao lưu bộ thẻ và học trên merid.site. Khi đã đăng nhập, dữ liệu được đồng bộ gồm:',
        },
        {
          type: 'ul',
          items: [
            'Địa chỉ email của bạn (danh tính tài khoản);',
            'Bộ thẻ của bạn (các từ đã lưu kèm thông tin từ điển, và danh sách từ đã biết);',
            'Nếu bạn dùng kiểm tra ngữ cảnh AI, khóa API Gemini của riêng bạn (xem Mục 5).',
          ],
        },
        {
          type: 'p',
          text: 'Toàn bộ dữ liệu này được lưu trong Google Firestore dưới tài khoản của chính bạn và được bảo vệ bởi các quy tắc bảo mật phía máy chủ để chỉ bạn mới truy cập được. Nội dung trang web KHÔNG nằm trong phần đồng bộ này. Đăng xuất sẽ dừng mọi hoạt động đồng bộ ngay lập tức.',
        },
        {
          type: 'p',
          text: 'B. Kiểm tra ngữ cảnh bằng AI tùy chọn (tắt theo mặc định; cần khóa API của riêng bạn). Nếu bạn bật tính năng này trong Cài đặt và dán khóa API Google Gemini của mình, thì sau khi Merid thay từ trên một trang, tiện ích sẽ gửi tới Google Gemini API một đoạn ngắn nội dung trang cho mỗi từ được thay — gồm từ đã thay, từ gốc, và tối đa khoảng 180 ký tự câu xung quanh (tối đa 20 từ mỗi yêu cầu, tối đa 3 yêu cầu mỗi trang). Gemini trả lời liệu mỗi lần thay có hợp ngữ cảnh không; những từ không hợp sẽ được hoàn nguyên.',
        },
        {
          type: 'p',
          text: 'Các đoạn văn bản này được gửi trực tiếp từ trình duyệt của bạn tới Google bằng khóa của bạn, không được tiện ích lưu lại, và không đi qua bất kỳ máy chủ Merid nào (không hề có máy chủ như vậy). Việc Google xử lý dữ liệu qua Gemini API tuân theo các điều khoản riêng của Google. Tắt tính năng này trong Cài đặt để dừng mọi yêu cầu ngay lập tức.',
        },
      ],
    },
    {
      id: 'permissions',
      heading: '4. Quyền (permissions) và lý do sử dụng',
      blocks: [
        {
          type: 'p',
          text: 'Merid chỉ yêu cầu những quyền tối thiểu cần thiết cho mục đích trên:',
        },
        {
          type: 'ul',
          items: [
            'storage — lưu cài đặt, bộ thẻ và các bộ dữ liệu tùy chỉnh của bạn ngay trên thiết bị.',
            'activeTab — cho phép các thao tác từ popup (như hoàn nguyên trang hoặc tạm dừng trên trang hiện tại) áp dụng cho đúng tab bạn đang mở.',
            'Quyền truy cập trang (host permission <all_urls>, qua content script) — cần thiết vì Merid phải đọc và thay từ trên bất kỳ trang tiếng Việt nào bạn đọc; bạn không thể biết trước mình sẽ đọc trang nào. Việc quét diễn ra cục bộ và bạn có thể tạm dừng Merid trên từng trang.',
            'Content script trên merid.site — chỉ dùng để chuyển tiếp phiên đăng nhập giữa website merid.site và tiện ích, giúp bạn không phải đăng nhập hai lần. Nó không đọc nội dung của các trang khác.',
          ],
        },
        {
          type: 'p',
          text: 'Tiện ích KHÔNG dùng các quyền như "tabs" để theo dõi lịch sử, "webRequest" để chặn mạng, hay bất kỳ quyền theo dõi vị trí, cookie liên trang nào.',
        },
      ],
    },
    {
      id: 'api-keys',
      heading: '5. Khóa API',
      blocks: [
        {
          type: 'ul',
          items: [
            'Tiện ích không đi kèm khóa API nào và hoạt động đầy đủ khi không có khóa.',
            'Tính năng kiểm tra ngữ cảnh AI tùy chọn dùng khóa API Google Gemini của riêng bạn, do chính bạn tạo tại aistudio.google.com và dán vào Cài đặt. Khóa được lưu trên thiết bị (chrome.storage.local).',
            'Nếu bạn đăng nhập để đồng bộ, khóa còn được sao lưu vào tài liệu Firestore riêng tư của tài khoản bạn — được bảo vệ bởi quy tắc bảo mật phía máy chủ để chỉ bạn đọc được — chỉ nhằm giúp tính năng vẫn chạy khi bạn đăng nhập ở thiết bị khác. Khóa chỉ được gửi tới các endpoint của Google (Gemini, Firestore) qua TLS, và bị xóa khỏi cả hai nơi khi bạn xóa nó trong Cài đặt.',
            'Không có backend hay proxy nào của Merid; không có gì đi qua máy chủ do chúng tôi vận hành.',
          ],
        },
      ],
    },
    {
      id: 'third-parties',
      heading: '6. Dịch vụ của bên thứ ba',
      blocks: [
        {
          type: 'p',
          text: 'Merid chỉ sử dụng các dịch vụ sau, và chỉ khi bạn bật tính năng tùy chọn tương ứng:',
        },
        {
          type: 'ul',
          items: [
            'Google Firebase Authentication & Cloud Firestore — dùng cho đăng nhập và đồng bộ bộ thẻ tùy chọn. Dữ liệu được lưu trong dự án Firebase của Merid nhưng dưới tài khoản của bạn, được khóa bằng quy tắc bảo mật.',
            'Google Gemini API (Generative Language API) — dùng cho kiểm tra ngữ cảnh AI tùy chọn, chỉ khi bạn cung cấp khóa của mình.',
          ],
        },
        {
          type: 'p',
          text: 'Merid không dùng dịch vụ phân tích (analytics), mạng quảng cáo, pixel theo dõi, hay công cụ đo lường bên thứ ba nào của bên thứ ba trên website hoặc trong tiện ích.',
        },
      ],
    },
    {
      id: 'limited-use',
      heading: '7. Cam kết sử dụng dữ liệu có giới hạn (Limited Use)',
      blocks: [
        {
          type: 'p',
          text: 'Việc Merid sử dụng và chuyển giao thông tin nhận được từ các API của Google tuân thủ Chính sách Dữ liệu Người dùng của Chrome Web Store, bao gồm các yêu cầu Sử dụng Có Giới hạn (Limited Use). Cụ thể:',
        },
        {
          type: 'ul',
          items: [
            'Chúng tôi chỉ thu thập và dùng dữ liệu của bạn để cung cấp và cải thiện các tính năng người dùng nhìn thấy được nêu trong chính sách này.',
            'Chúng tôi không bán dữ liệu người dùng, và không chuyển giao dữ liệu đó cho bên thứ ba trừ khi cần để vận hành hoặc cải thiện tính năng bạn đang dùng, để tuân thủ luật hiện hành, hoặc như một phần của việc sáp nhập/mua lại được thông báo trước.',
            'Chúng tôi không dùng dữ liệu người dùng cho quảng cáo, tiếp thị hướng đối tượng, hay bất kỳ mục đích không liên quan nào.',
            'Chúng tôi không cho phép con người đọc dữ liệu của bạn, trừ khi bạn cho phép rõ ràng cho mục đích hỗ trợ cụ thể, khi luật yêu cầu, hoặc khi cần cho mục đích bảo mật (ví dụ điều tra lạm dụng).',
          ],
        },
      ],
    },
    {
      id: 'retention',
      heading: '8. Lưu giữ và xóa dữ liệu',
      blocks: [
        {
          type: 'p',
          text: 'Dữ liệu trên thiết bị được lưu cho đến khi bạn xóa hoặc gỡ cài đặt. Dữ liệu bộ thẻ đã đồng bộ vẫn nằm trong tài khoản Firebase của chính bạn cho đến khi bạn xóa nó hoặc yêu cầu xóa tài khoản.',
        },
        {
          type: 'p',
          text: 'Cách bạn kiểm soát và xóa dữ liệu:',
        },
        {
          type: 'ul',
          items: [
            'Tắt hoàn toàn tiện ích bằng nút gạt trên popup, hoặc tạm dừng trên một trang cụ thể bằng "Turn off on this site".',
            'Hoàn nguyên một trang về văn bản gốc từ popup.',
            'Tắt kiểm tra ngữ cảnh AI hoặc xóa khóa API của bạn trong Cài đặt bất kỳ lúc nào.',
            'Đăng xuất trong Cài đặt để dừng đồng bộ ngay lập tức.',
            'Xóa mọi thứ: Cài đặt → "Delete all stored data" xóa cài đặt, bộ thẻ và bộ dữ liệu khỏi thiết bị. Gỡ cài đặt tiện ích cũng xóa dữ liệu cục bộ. Để xóa cả dữ liệu đã đồng bộ, hãy xóa bộ thẻ khi đang đăng nhập, hoặc liên hệ chúng tôi (Mục 12) để yêu cầu xóa dữ liệu tài khoản.',
          ],
        },
      ],
    },
    {
      id: 'security',
      heading: '9. Bảo mật',
      blocks: [
        {
          type: 'p',
          text: 'Mọi liên lạc với các dịch vụ của Google (Firebase, Firestore, Gemini) đều qua kết nối mã hóa TLS. Dữ liệu đồng bộ được cô lập theo tài khoản bằng các quy tắc bảo mật phía máy chủ của Firestore để chỉ chủ tài khoản mới đọc/ghi được dữ liệu của mình. Vì Merid không vận hành máy chủ riêng, không có cơ sở dữ liệu do chúng tôi kiểm soát nào tập hợp dữ liệu người dùng.',
        },
      ],
    },
    {
      id: 'children',
      heading: '10. Quyền riêng tư của trẻ em',
      blocks: [
        {
          type: 'p',
          text: 'Merid là công cụ học tập cho mục đích chung và không cố ý thu thập thông tin cá nhân từ bất kỳ ai, kể cả trẻ em. Chúng tôi không hướng tiện ích tới trẻ em dưới 13 tuổi và không cố ý thu thập dữ liệu từ các em.',
        },
      ],
    },
    {
      id: 'changes',
      heading: '11. Thay đổi chính sách',
      blocks: [
        {
          type: 'p',
          text: 'Các thay đổi quan trọng đối với chính sách này sẽ được phản ánh trên trang này (kèm ngày cập nhật) cũng như trong tệp chính sách của tiện ích và trên listing tại Chrome Web Store.',
        },
      ],
    },
    {
      id: 'contact',
      heading: '12. Liên hệ',
      blocks: [
        {
          type: 'p',
          text: 'Nếu bạn có câu hỏi về quyền riêng tư hoặc muốn yêu cầu xóa dữ liệu tài khoản, hãy liên hệ qua email vqz0d@protonmail.com hoặc qua mục hỗ trợ trên trang Chrome Web Store của Merid.',
        },
      ],
    },
  ],
}

/* ─────────────────────────────────────────────────────────────────────────
 *  English
 * ───────────────────────────────────────────────────────────────────────── */

const POLICY_EN: Policy = {
  updated: 'Last updated: July 22, 2026',
  title: 'Privacy Policy',
  tocLabel: 'Contents',
  intro: [
    'Merid is a Chrome browser extension that helps Vietnamese speakers learn English vocabulary naturally: as you read the web, Merid swaps a few Vietnamese words for their English equivalents. This policy explains exactly what Merid does with data — both on the merid.site website and inside the extension.',
    'The core principle: in its default state Merid processes everything inside your browser and sends nothing anywhere. Only two optional features — deck sync and the AI context check — send limited data off your device, and only after you turn them on yourself. Merid runs no servers of its own.',
  ],
  sections: [
    {
      id: 'single-purpose',
      heading: '1. Single purpose of the extension',
      blocks: [
        {
          type: 'p',
          text: 'Merid has a single purpose: to expose English learners to target vocabulary while they read the web, by replacing selected words on the page and offering dictionary info, practice and review tools. The extension serves no unrelated purpose — no advertising, no behavioural tracking, no data mining.',
        },
      ],
    },
    {
      id: 'local',
      heading: '2. Data processed locally on your device',
      blocks: [
        {
          type: 'p',
          text: 'The following data is processed and stored right inside your browser. Except for the optional cases in Section 3, it never leaves your device:',
        },
        {
          type: 'ul',
          items: [
            'Page text (website content). To find vocabulary matches, the extension reads the visible text of pages you visit and compares it against bundled word lists. This scanning and replacement happens entirely in your browser. Merid keeps no browsing history, stores no URLs, and sends no page content anywhere by default.',
            'Your settings. Your preferences (selected dataset, display mode, intensity, Vietnamese→English / English→English direction, on/off state, and the list of sites you paused Merid on) are stored on your device using chrome.storage. If you enable Chrome Sync, these settings may sync across your own Chrome profiles via Google — Merid itself runs no account server.',
            'Your deck. Words you save ("Save to Deck") and words you mark known ("I know this") are stored on your device. They leave it only via the optional deck sync in Section 3.',
            'Custom datasets you upload. Vocabulary CSV files you import in Settings → "My datasets" are validated and stored only on your device (chrome.storage.local). They are never uploaded to Merid, Firebase, any AI service, or anywhere else, and are not included in the optional deck sync.',
          ],
        },
      ],
    },
    {
      id: 'off-device',
      heading: '3. Data sent off your device',
      blocks: [
        {
          type: 'note',
          text: 'By default, nothing. With no sign-in and no API key, the extension makes no network requests and never transmits page content, URLs, browsing history, personal identifiers, cookies, or form/input contents anywhere.',
        },
        {
          type: 'p',
          text: 'A. Optional deck sync (off unless you sign in). You can sign in (on merid.site — the login carries over to the extension automatically — or from the Settings page) to back up your deck and study it on merid.site. When signed in, the data synced is:',
        },
        {
          type: 'ul',
          items: [
            'your email address (your account identity);',
            'your deck (saved words with their dictionary info, and your known-words list);',
            'if you use the AI context check, your own Gemini API key (see Section 5).',
          ],
        },
        {
          type: 'p',
          text: 'All of it is stored in Google Firestore under your own account and protected by server-side security rules so that only you can access it. Page content is NOT part of deck sync. Signing out stops all syncing immediately.',
        },
        {
          type: 'p',
          text: 'B. Optional AI context check (off by default; requires your own key). If you turn this on in Settings and paste your own Google Gemini API key, then after Merid replaces words on a page it sends Google Gemini API a short snippet of page text for each replaced word — the replaced word, the original word, and up to ~180 characters of the surrounding sentence (at most 20 words per request, at most 3 requests per page). Gemini answers whether each replacement fits its sentence; words that do not fit are reverted.',
        },
        {
          type: 'p',
          text: 'These snippets are sent directly from your browser to Google using your key, are not stored by the extension, and pass through no Merid server (there are none). Google’s handling of Gemini API data is governed by Google’s own terms. Turn the feature off in Settings to stop all such requests instantly.',
        },
      ],
    },
    {
      id: 'permissions',
      heading: '4. Permissions and why they are used',
      blocks: [
        {
          type: 'p',
          text: 'Merid requests only the minimum permissions needed for the purpose above:',
        },
        {
          type: 'ul',
          items: [
            'storage — to save your settings, deck and custom datasets on the device.',
            'activeTab — so popup actions (such as reverting the page or pausing on the current site) apply to the exact tab you have open.',
            'Host access (<all_urls>, via a content script) — necessary because Merid must read and replace words on whatever Vietnamese page you read; which page cannot be known in advance. Scanning is local and you can pause Merid per site.',
            'Content script on merid.site — used only to carry your sign-in session between the merid.site website and the extension so you do not have to log in twice. It does not read the content of any other site.',
          ],
        },
        {
          type: 'p',
          text: 'The extension does NOT use permissions such as "tabs" to track history, "webRequest" to intercept the network, or any location or cross-site cookie tracking.',
        },
      ],
    },
    {
      id: 'api-keys',
      heading: '5. API keys',
      blocks: [
        {
          type: 'ul',
          items: [
            'The extension ships with no API keys and works fully without one.',
            'The optional AI context check uses your own Google Gemini API key, which you create yourself at aistudio.google.com and paste into Settings. The key is stored on your device (chrome.storage.local).',
            'If you sign in to the optional deck sync, the key is additionally backed up to your own account’s private Firestore document — protected by server-side security rules so only you can read it — purely so the feature keeps working when you sign in on another device. The key is only ever sent to Google endpoints (Gemini, Firestore) over TLS and is deleted from both places when you clear it in Settings.',
            'There is no Merid backend or proxy; nothing passes through servers we run.',
          ],
        },
      ],
    },
    {
      id: 'third-parties',
      heading: '6. Third-party services',
      blocks: [
        {
          type: 'p',
          text: 'Merid uses only the following services, and only when you enable the corresponding optional feature:',
        },
        {
          type: 'ul',
          items: [
            'Google Firebase Authentication & Cloud Firestore — for the optional sign-in and deck sync. Data lives in Merid’s Firebase project but under your own account, locked down by security rules.',
            'Google Gemini API (Generative Language API) — for the optional AI context check, only when you supply your own key.',
          ],
        },
        {
          type: 'p',
          text: 'Merid uses no analytics, no ad networks, no tracking pixels, and no third-party measurement tools on the website or in the extension.',
        },
      ],
    },
    {
      id: 'limited-use',
      heading: '7. Limited Use commitment',
      blocks: [
        {
          type: 'p',
          text: 'Merid’s use and transfer of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Specifically:',
        },
        {
          type: 'ul',
          items: [
            'We collect and use your data only to provide and improve the user-facing features described in this policy.',
            'We do not sell user data, and do not transfer it to third parties except as needed to operate or improve a feature you are using, to comply with applicable law, or as part of a merger/acquisition with prior notice.',
            'We do not use user data for advertising, ad targeting, or any unrelated purpose.',
            'We do not allow humans to read your data, except where you give explicit consent for a specific support purpose, where required by law, or where necessary for security purposes (for example, investigating abuse).',
          ],
        },
      ],
    },
    {
      id: 'retention',
      heading: '8. Data retention and deletion',
      blocks: [
        {
          type: 'p',
          text: 'On-device data is stored until you clear it or uninstall. Synced deck data remains in your own Firebase account until you delete it or request account deletion.',
        },
        {
          type: 'p',
          text: 'How you control and delete your data:',
        },
        {
          type: 'ul',
          items: [
            'Turn the extension off entirely with the popup toggle, or pause it on a single website with "Turn off on this site".',
            'Revert a page to its original text from the popup.',
            'Turn off the AI context check or clear your API key in Settings at any time.',
            'Sign out in Settings to stop deck sync immediately.',
            'Delete everything: Settings → "Delete all stored data" clears your settings, deck and datasets from the device. Uninstalling the extension also removes local data. To remove synced data as well, clear your deck while signed in, or contact us (Section 12) to request account-data deletion.',
          ],
        },
      ],
    },
    {
      id: 'security',
      heading: '9. Security',
      blocks: [
        {
          type: 'p',
          text: 'All communication with Google services (Firebase, Firestore, Gemini) uses encrypted TLS connections. Synced data is isolated per account by Firestore’s server-side security rules so only the account owner can read or write their own data. Because Merid runs no servers of its own, there is no database we control that pools user data.',
        },
      ],
    },
    {
      id: 'children',
      heading: '10. Children’s privacy',
      blocks: [
        {
          type: 'p',
          text: 'Merid is a general-purpose learning tool and does not knowingly collect personal information from anyone, including children. We do not direct the extension to children under 13 and do not knowingly collect data from them.',
        },
      ],
    },
    {
      id: 'changes',
      heading: '11. Changes to this policy',
      blocks: [
        {
          type: 'p',
          text: 'Material changes to this policy will be reflected on this page (with an updated date), as well as in the extension’s policy file and on the Chrome Web Store listing.',
        },
      ],
    },
    {
      id: 'contact',
      heading: '12. Contact',
      blocks: [
        {
          type: 'p',
          text: 'If you have questions about privacy, or want to request deletion of your account data, contact us at vqz0d@protonmail.com or via the support section of Merid’s Chrome Web Store page.',
        },
      ],
    },
  ],
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Rendering
 * ───────────────────────────────────────────────────────────────────────── */

function renderBlock(block: Block, i: number) {
  switch (block.type) {
    case 'p':
      return (
        <p key={i} className="text-[15px] leading-relaxed text-body">
          {block.text}
        </p>
      )
    case 'note':
      return (
        <p
          key={i}
          className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-[15px] font-semibold leading-relaxed text-heading"
        >
          {block.text}
        </p>
      )
    case 'ul':
      return (
        <ul key={i} className="space-y-3">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-body">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
  }
}

const POLICIES: Record<Lang, Policy> = { vi: POLICY_VI, en: POLICY_EN }

export default function PrivacyPolicy() {
  const { t, lang } = useLang()
  usePageTitle(t.meta.privacyPolicyTitle)
  const policy = POLICIES[lang]

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 50% 0%, rgb(245 197 66 / 0.08), transparent 62%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl px-5 py-20 sm:px-8">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">Merid</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance text-heading sm:text-5xl">
            {policy.title}
          </h1>
          <p className="mt-4 text-sm font-semibold text-muted">{policy.updated}</p>
        </div>

        {/* Intro */}
        <Reveal>
          <section className="mt-12 rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
            <div className="space-y-5">
              {policy.intro.map((p) => (
                <p key={p} className="text-[15px] leading-relaxed text-body">
                  {p}
                </p>
              ))}
            </div>

            {/* Table of contents */}
            <nav className="mt-8 border-t border-line pt-6" aria-label={policy.tocLabel}>
              <p className="text-xs font-extrabold tracking-[0.18em] text-muted uppercase">
                {policy.tocLabel}
              </p>
              <ol className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {policy.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm font-semibold text-body transition-colors hover:text-accent"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </section>
        </Reveal>

        {/* Sections */}
        <div className="mt-8 space-y-8">
          {policy.sections.map((section) => (
            <Reveal key={section.id}>
              <section
                id={section.id}
                className="scroll-mt-24 rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10"
              >
                <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                  {section.heading}
                </h2>
                <div className="mt-5 space-y-5">
                  {section.blocks.map((block, i) => renderBlock(block, i))}
                </div>
              </section>
            </Reveal>
          ))}
        </div>

        {/* Footer link back */}
        <div className="mt-12 text-center">
          <Link
            to="/"
            className="text-sm font-bold text-accent transition-colors hover:text-accent-hover"
          >
            ← merid.site
          </Link>
          <span className="mx-3 text-muted">·</span>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-accent transition-colors hover:text-accent-hover"
          >
            Chrome Web Store ↗
          </a>
        </div>
      </div>
    </div>
  )
}
