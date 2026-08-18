import { Link } from 'react-router'
import Reveal from '../components/ui/Reveal'
import { CHROME_STORE_URL } from '../config'
import { trackInstallClick } from '../lib/analytics'
import { useLang, usePageMeta } from '../i18n/LanguageContext'
import type { Lang } from '../i18n/translations'

/*
 * Privacy Policy for merid.site and the Merid Chrome extension.
 *
 * This page is written to satisfy the Chrome Web Store's Developer Program
 * Policies and the User Data Privacy / Limited Use requirements: it discloses
 * every category of data the extension touches, where each category is
 * processed, what leaves the device and under which setting, the exact
 * permissions used and why, the third parties involved, and how a user can
 * inspect, control and delete their data.
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
  updated: 'Cập nhật lần cuối: ngày 18 tháng 8, 2026',
  title: 'Chính sách bảo mật',
  tocLabel: 'Nội dung',
  intro: [
    'Merid là một tiện ích mở rộng (extension) cho trình duyệt Chrome giúp người nói tiếng Việt học từ vựng tiếng Anh một cách tự nhiên: khi bạn đọc web, Merid thay một vài từ tiếng Việt bằng từ tiếng Anh tương ứng. Chính sách này giải thích chính xác Merid xử lý dữ liệu như thế nào — cả trên trang web merid.site lẫn trong tiện ích.',
    'Việc tìm từ và thay từ diễn ra hoàn toàn bên trong trình duyệt của bạn: Merid không lưu lịch sử duyệt web, không lưu URL và không gửi nội dung trang cho ai để làm việc đó.',
    'Có một ngoại lệ, và nó được bật sẵn: tính năng kiểm tra ngữ cảnh bằng AI. Trước khi một từ đã thay được hiện ra, Merid gửi đoạn câu ngắn quanh từ đó (tối đa 180 ký tự) tới điểm cuối merid.site/api/check của chúng tôi, và từ đó tới một mô hình ngôn ngữ, để hỏi xem từ ấy có hợp ngữ cảnh không. Mục 4 mô tả đầy đủ những gì được gửi, gửi đi đâu và được giữ lại bao lâu. Tắt tính năng này trong Cài đặt là mọi yêu cầu dừng lại ngay.',
    'Trước đây tính năng này tắt sẵn và cần khóa API riêng của bạn. Nay Merid tự lo khóa và đếm hạn mức phía máy chủ, nên tính năng chạy được mà bạn không phải thiết lập gì — đổi lại, có một máy chủ của Merid nằm giữa, điều mà các phiên bản trước của chính sách này nói là không có.',
    'Merid không bao giờ đọc các trang riêng tư: tin nhắn, email, ngân hàng và thanh toán, màn hình đăng nhập, trình quản lý mật khẩu, y tế, thuế/bảo hiểm/định danh, và các trang thi có giám sát (Mục 3). Merid cũng không dùng dịch vụ phân tích của bên thứ ba, không quảng cáo, không pixel theo dõi, và không bán dữ liệu.',
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
          text: 'Những dữ liệu sau được xử lý và lưu trữ ngay trong trình duyệt của bạn. Trừ những trường hợp nêu ở Mục 4 và Mục 6, chúng không rời khỏi thiết bị:',
        },
        {
          type: 'ul',
          items: [
            'Nội dung trang web (page text). Để tìm từ vựng cần thay, tiện ích đọc phần văn bản hiển thị của trang bạn đang xem và so khớp với các danh sách từ đi kèm. Việc quét và thay thế này diễn ra hoàn toàn trong trình duyệt. Merid không lưu lại lịch sử duyệt web, không lưu URL, và không gửi nội dung trang đi đâu — ngoài các đoạn câu ngắn của tính năng kiểm tra ngữ cảnh AI mô tả ở Mục 4.',
            'Cài đặt của bạn. Các tùy chọn (bộ dữ liệu đã chọn, chế độ hiển thị, cường độ thay từ, hướng Việt→Anh, trạng thái bật/tắt, ngôn ngữ giao diện, danh sách các trang bạn đã tạm dừng và danh sách các trang bạn đã bật lại) được lưu trên thiết bị qua chrome.storage. Nếu bạn bật Chrome Sync, phần cài đặt này có thể được Google đồng bộ giữa các hồ sơ Chrome của chính bạn.',
            'Bộ thẻ (deck) của bạn. Những từ bạn lưu ("Save to Deck") và những từ bạn đánh dấu đã biết ("I know this") được lưu trên thiết bị. Chúng chỉ rời khỏi thiết bị thông qua đồng bộ tùy chọn ở Mục 6.',
            'Hồ sơ cá nhân hoá. Các con số thống kê về việc bạn tương tác với từ nào, ở mức độ nào — xem Mục 5.',
            'Bộ dữ liệu tùy chỉnh bạn tải lên. Các tệp CSV từ vựng bạn nhập trong Cài đặt → "My datasets" được kiểm tra và lưu chỉ trên thiết bị (chrome.storage.local). Chúng không bao giờ được tải lên Merid, Firebase, dịch vụ AI hay bất kỳ nơi nào khác, và không nằm trong phần đồng bộ tùy chọn.',
            'Bộ nhớ đệm câu trả lời của AI. Kết quả kiểm tra ngữ cảnh được lưu trên máy trong 30 ngày, để đọc lại một trang không tốn thêm yêu cầu nào. Bộ nhớ đệm này nằm trong chrome.storage.local và không được đồng bộ đi đâu.',
            'Danh tính thiết bị cho hạn mức AI. Một mã tài khoản ẩn danh và mã làm mới phiên (refresh token) được lưu trên máy để đếm hạn mức hằng ngày — xem Mục 4.',
          ],
        },
      ],
    },
    {
      id: 'blocked-pages',
      heading: '3. Những trang Merid không bao giờ đọc',
      blocks: [
        {
          type: 'note',
          text: 'Vì kiểm tra ngữ cảnh AI được bật sẵn và nó gửi đoạn câu ra khỏi thiết bị, có những trang Merid không đọc chút nào — thay vì tin vào một cái công tắc nào đó đang tắt. Trên các trang này, không có gì được quét, được lưu hay được gửi đi, bất kể các cài đặt khác của bạn là gì.',
        },
        {
          type: 'p',
          text: 'Danh sách chặn cứng (bạn không thể bật lại) gồm các nhóm sau:',
        },
        {
          type: 'ul',
          items: [
            'Nhắn tin: Messenger, WhatsApp, Telegram, Zalo, Discord, Slack, Teams, Google Chat/Meet, Signal, Line, Viber, Skype, WeChat, KakaoTalk…',
            'Email: Gmail, Outlook, Yahoo Mail, Proton Mail, iCloud, Fastmail, Zoho, QQ Mail…',
            'Ngân hàng và thanh toán: PayPal, Stripe, Wise, các sàn tiền mã hoá, và các ngân hàng/ví Việt Nam như Vietcombank, Techcombank, BIDV, MoMo, ZaloPay, VNPay…',
            'Đăng nhập và quản lý mật khẩu: accounts.google.com, login.microsoftonline.com, Apple ID, Okta, 1Password, Bitwarden, LastPass…',
            'Y tế, thuế, bảo hiểm và định danh công dân: NHS, Medicare, IRS, dichvucong.gov.vn, thuedientu.gdt.gov.vn, baohiemxahoi.gov.vn, VNeID…',
            'Thi cử có giám sát: Proctorio, Honorlock, Examity, Respondus, ETS.',
            'Chính merid.site — không phải vì riêng tư, mà vì đọc trang giới thiệu trong lúc tiện ích đang thay chữ trên đó thì rất khó chịu.',
          ],
        },
        {
          type: 'p',
          text: 'Với những nơi vừa có nội dung công khai vừa có tin nhắn riêng trên cùng một tên miền — Facebook, Instagram, X, LinkedIn, TikTok, Reddit — các trang tin nhắn bị loại riêng (ví dụ /messages, /direct, /messaging), nên bảng tin vẫn dùng được còn tin nhắn thì không bị đọc. Các cửa sổ chat nổi ở góc màn hình (nơi địa chỉ trang không đổi) cũng được nhận diện và bỏ qua. Khi bạn mở hộp thư mà trang không tải lại, Merid dừng lại và hoàn nguyên những gì đã thay.',
        },
        {
          type: 'p',
          text: 'Ngoài ra có một danh sách tắt sẵn nhưng bạn có thể bật lại cho từng trang, ở những nơi mà một từ bị thay đơn giản là sai chỗ: trình soạn thảo và sandbox lập trình (Google Docs, Office, Notion, Figma, CodePen…), từ điển và công cụ dịch, các trang học/làm bài tập, và các trang chính phủ nói chung. Popup của Merid có nút "Bật cho trang này".',
        },
        {
          type: 'p',
          text: 'Không danh sách nào là đầy đủ — một trang webmail công ty hay cổng bệnh nhân trên tên miền riêng thì Merid không thể biết trước. Với những nơi đó, hãy dùng "Tắt trên trang này" trong popup; lựa chọn được ghi nhớ.',
        },
      ],
    },
    {
      id: 'ai-check',
      heading: '4. Kiểm tra ngữ cảnh bằng AI (bật sẵn)',
      blocks: [
        {
          type: 'note',
          text: 'Đây là dữ liệu duy nhất rời khỏi thiết bị khi bạn chưa đăng nhập. Tính năng được BẬT SẴN. Tắt nó trong Cài đặt → "AI context check" là không còn yêu cầu nào được gửi đi nữa.',
        },
        {
          type: 'p',
          text: 'Một từ đúng nghĩa trong từ điển vẫn có thể sai trong câu. Trước khi hiện một từ đã thay, Merid hỏi một mô hình ngôn ngữ xem từ đó có hợp câu không; từ không hợp sẽ không được hiện ra, và mô hình có thể đề xuất một từ khác phù hợp hơn.',
        },
        {
          type: 'p',
          text: 'Với mỗi từ được kiểm tra, những thứ sau được gửi đi:',
        },
        {
          type: 'ul',
          items: [
            'từ tiếng Anh đã thay;',
            'từ/cụm từ tiếng Việt bị thay;',
            'tối đa khoảng 180 ký tự câu chứa nó;',
            'một bản tóm tắt sở thích ngắn của bạn (tối đa 300 ký tự), dựng từ chính các đánh giá của bạn — ví dụ "prefers C1-level words; reads mostly business". Xem Mục 5.',
          ],
        },
        {
          type: 'p',
          text: 'Giới hạn kỹ thuật: tối đa 20 từ mỗi yêu cầu và tối đa 3 yêu cầu cho mỗi trang. Câu trả lời được lưu đệm trên máy 30 ngày, nên đọc lại cùng một trang không tốn yêu cầu nào.',
        },
        {
          type: 'note',
          text: 'Những thứ KHÔNG được gửi: địa chỉ trang (URL), tiêu đề trang, lịch sử duyệt web, nội dung biểu mẫu hay ô nhập, cookie, và bất kỳ phần nào khác của trang ngoài các đoạn câu nói trên.',
        },
        {
          type: 'p',
          text: 'Đường đi của yêu cầu. Trình duyệt của bạn gửi tới https://merid.site/api/check — một hàm serverless do Merid vận hành trên Vercel. Hàm này giữ khóa API và chuyển câu hỏi tới nhà cung cấp mô hình: Qwen (Alibaba Cloud Model Studio) trả lời trước, Google Gemini là phương án dự phòng khi Qwen không phục vụ được. Nhà cung cấp chỉ nhận phần văn bản của câu hỏi; họ không nhận mã tài khoản của bạn, không nhận email của bạn và không có cách nào biết yêu cầu đến từ ai.',
        },
        {
          type: 'p',
          text: 'Danh tính và hạn mức. Để đếm hạn mức mà không bắt bạn tạo tài khoản, lần đầu chạy kiểm tra ngữ cảnh, Merid tạo một tài khoản Firebase ẩn danh cho thiết bị này. Tài khoản đó chỉ là một mã ngẫu nhiên, không chứa thông tin cá nhân, không gắn với email hay số điện thoại nào. Nếu bạn đã đăng nhập bằng tài khoản thật, phiên đó được dùng thay cho tài khoản ẩn danh.',
        },
        {
          type: 'p',
          text: 'Máy chủ của Merid giữ lại gì. Chỉ một con số: số lượt yêu cầu trong ngày, đếm theo mã tài khoản nói trên, lưu trong Upstash Redis và tự hết hạn vào lúc nửa đêm giờ UTC. Các đoạn câu không được ghi log, không được lưu vào cơ sở dữ liệu nào và không được dùng để huấn luyện bất cứ thứ gì; chúng chỉ tồn tại trong bộ nhớ đủ lâu để chuyển tiếp câu hỏi và trả lời về. Việc các nhà cung cấp mô hình xử lý dữ liệu ra sao tuân theo điều khoản riêng của họ.',
        },
        {
          type: 'p',
          text: 'Nếu bạn muốn không có máy chủ nào của Merid ở giữa, xem tùy chọn khóa API riêng ở Mục 7. Và nếu bạn tắt tính năng này, tiện ích vẫn hoạt động đầy đủ — chỉ là không còn bước kiểm tra ngữ cảnh.',
        },
      ],
    },
    {
      id: 'profile',
      heading: '5. Hồ sơ cá nhân hoá',
      blocks: [
        {
          type: 'p',
          text: 'Merid ghi lại cách bạn phản ứng với những từ nó đưa ra, để hiện nhiều hơn thứ hợp với bạn và ít đi thứ không hợp. Hồ sơ này bật sẵn và nằm trên thiết bị (chrome.storage.local). Nội dung của nó gồm:',
        },
        {
          type: 'ul',
          items: [
            'số lần một từ được hiện, được mở thẻ nghĩa, được đánh giá 👍/👎, được lưu vào deck, hay được đánh dấu "I know this";',
            'trình độ CEFR của các từ bạn tiếp nhận hoặc từ chối;',
            'một chủ đề thô suy ra từ địa chỉ trang (ví dụ "business", "tech"). Chỉ nhãn chủ đề được lưu — không phải địa chỉ trang.',
          ],
        },
        {
          type: 'note',
          text: 'Hồ sơ này chỉ chứa các con số về từ vựng. Nó không lưu văn bản trang, tiêu đề trang, URL đầy đủ, lịch sử duyệt web, hay bất cứ thứ gì định danh bạn.',
        },
        {
          type: 'p',
          text: 'Bạn xem được toàn bộ những gì nó nắm giữ, và xoá riêng nó mà không đụng tới deck, trong Cài đặt → "What Merid has learned about you" → "Forget what Merid learned". Khi tính năng kiểm tra ngữ cảnh đang bật, một bản tóm tắt ngắn của hồ sơ này (Mục 4) đi kèm mỗi yêu cầu; bản tóm tắt chỉ nói về sở thích, không kèm nội dung trang hay mã định danh nào. Nếu bạn đăng nhập, hồ sơ cũng được sao lưu vào tài khoản của chính bạn để theo bạn sang máy khác.',
        },
      ],
    },
    {
      id: 'sync',
      heading: '6. Đồng bộ khi đăng nhập (tùy chọn)',
      blocks: [
        {
          type: 'p',
          text: 'Bạn có thể đăng nhập — trên merid.site (phiên đăng nhập tự động chuyển sang tiện ích) hoặc từ trang Cài đặt — để sao lưu bộ thẻ và học trên merid.site. Khi đã đăng nhập, dữ liệu được đồng bộ gồm:',
        },
        {
          type: 'ul',
          items: [
            'Địa chỉ email của bạn (danh tính tài khoản);',
            'Bộ thẻ của bạn (các từ đã lưu kèm thông tin từ điển, và danh sách từ đã biết);',
            'Hồ sơ cá nhân hoá ở Mục 5, dưới dạng một bản sao lưu;',
            'Khóa API Gemini của riêng bạn, nếu bạn có lưu một khóa (xem Mục 7).',
          ],
        },
        {
          type: 'p',
          text: 'Toàn bộ dữ liệu này được lưu trong Google Firestore dưới tài khoản của chính bạn và được bảo vệ bởi các quy tắc bảo mật phía máy chủ để chỉ bạn mới truy cập được. Nội dung trang web KHÔNG nằm trong phần đồng bộ này. Đăng xuất sẽ dừng mọi hoạt động đồng bộ ngay lập tức.',
        },
        {
          type: 'p',
          text: 'Đăng nhập cũng thay tài khoản ẩn danh ở Mục 4 bằng tài khoản thật của bạn, và hạn mức hằng ngày của tính năng AI được tính theo tài khoản đó.',
        },
      ],
    },
    {
      id: 'api-keys',
      heading: '7. Khóa API',
      blocks: [
        {
          type: 'ul',
          items: [
            'Tiện ích không đi kèm khóa API nào. Khóa của Merid nằm trong biến môi trường trên máy chủ và không bao giờ được gửi xuống trình duyệt — một khóa nằm trong tệp cài đặt của tiện ích là một khóa ai cũng đọc được.',
            'Bạn vẫn có thể dùng khóa Google Gemini của riêng mình. Khi có khóa riêng, yêu cầu đi thẳng từ trình duyệt của bạn tới Google, không qua máy chủ nào của Merid và không bị tính vào hạn mức của chúng tôi. Hiện ô nhập khóa được ẩn khỏi trang Cài đặt vì gần như không ai còn cần tới nó; khóa đã lưu từ phiên bản trước vẫn tiếp tục được dùng và vẫn xoá được.',
            'Khóa riêng của bạn được lưu trên thiết bị (chrome.storage.local). Nếu bạn đăng nhập để đồng bộ, khóa còn được sao lưu vào tài liệu Firestore riêng tư của tài khoản bạn — được bảo vệ bởi quy tắc bảo mật phía máy chủ để chỉ bạn đọc được — chỉ nhằm giúp tính năng vẫn chạy khi bạn đăng nhập ở thiết bị khác. Khóa chỉ được gửi tới các endpoint của Google (Gemini, Firestore) qua TLS, và bị xóa khỏi cả hai nơi khi bạn xóa nó trong Cài đặt.',
          ],
        },
      ],
    },
    {
      id: 'permissions',
      heading: '8. Quyền (permissions) và lý do sử dụng',
      blocks: [
        {
          type: 'p',
          text: 'Merid chỉ yêu cầu những quyền tối thiểu cần thiết cho mục đích trên:',
        },
        {
          type: 'ul',
          items: [
            'storage — lưu cài đặt, bộ thẻ, hồ sơ cá nhân hoá và các bộ dữ liệu tùy chỉnh của bạn ngay trên thiết bị.',
            'activeTab — cho phép các thao tác từ popup (như hoàn nguyên trang hoặc tạm dừng trên trang hiện tại) áp dụng cho đúng tab bạn đang mở.',
            'Quyền truy cập trang (host permission <all_urls>, qua content script) — cần thiết vì Merid phải đọc và thay từ trên bất kỳ trang tiếng Việt nào bạn đọc; bạn không thể biết trước mình sẽ đọc trang nào. Việc quét diễn ra cục bộ, các trang ở Mục 3 bị loại trừ, và bạn có thể tạm dừng Merid trên từng trang.',
            'Content script trên merid.site — chỉ dùng để chuyển tiếp phiên đăng nhập và lựa chọn ngôn ngữ giữa website merid.site và tiện ích, giúp bạn không phải đăng nhập hai lần. Nó không đọc nội dung của các trang khác.',
          ],
        },
        {
          type: 'p',
          text: 'Tiện ích chỉ được phép kết nối tới bốn nơi (khai báo trong Content Security Policy của chính nó): merid.site (kiểm tra ngữ cảnh), và ba endpoint của Google cho đăng nhập, Firestore và Gemini. Tiện ích KHÔNG dùng các quyền như "tabs" để theo dõi lịch sử, "webRequest" để chặn mạng, hay bất kỳ quyền theo dõi vị trí, cookie liên trang nào.',
        },
      ],
    },
    {
      id: 'third-parties',
      heading: '9. Dịch vụ của bên thứ ba',
      blocks: [
        {
          type: 'p',
          text: 'Merid chỉ sử dụng các dịch vụ sau:',
        },
        {
          type: 'ul',
          items: [
            'Vercel — nơi merid.site và endpoint /api/check được chạy. Như mọi máy chủ web, hạ tầng của Vercel nhìn thấy địa chỉ IP của yêu cầu ở tầng mạng; Merid không ghi lại địa chỉ đó.',
            'Alibaba Cloud Model Studio (Qwen) — nhà cung cấp mô hình trả lời kiểm tra ngữ cảnh theo mặc định. Mặc định dùng endpoint quốc tế (Singapore).',
            'Google Gemini API (Generative Language API) — phương án dự phòng cho kiểm tra ngữ cảnh, và là nơi khóa riêng của bạn gửi tới nếu bạn dùng khóa riêng.',
            'Google Firebase Authentication & Cloud Firestore — dùng cho tài khoản ẩn danh của hạn mức AI, cho đăng nhập, và cho đồng bộ tùy chọn.',
            'Upstash Redis — nơi lưu bộ đếm hạn mức hằng ngày (theo mã tài khoản) và các con số đếm của website merid.site (Mục 10).',
            'Cloudinary — nơi lưu ảnh của các bài viết trên blog merid.site. Khi bạn đọc một bài blog, trình duyệt tải ảnh trực tiếp từ Cloudinary, nên Cloudinary thấy yêu cầu ảnh đó.',
          ],
        },
        {
          type: 'p',
          text: 'Merid không dùng dịch vụ phân tích (analytics) của bên thứ ba, mạng quảng cáo, pixel theo dõi, hay công cụ đo lường bên thứ ba nào — trên website lẫn trong tiện ích. Không có mã JavaScript của bên thứ ba nào chạy trên merid.site. Website có bộ đếm lượt truy cập của riêng mình, được mô tả ngay dưới đây.',
        },
      ],
    },
    {
      id: 'website',
      heading: '10. Bộ đếm và khảo sát trên merid.site',
      blocks: [
        {
          type: 'p',
          text: 'Để biết trang web có đang giúp được ai hay không, merid.site tự đếm một vài con số. Bộ đếm này do chúng tôi tự vận hành, không đặt cookie, không cấp cho bạn mã định danh nào, và không thể nhận ra bạn là ai.',
        },
        {
          type: 'p',
          text: 'Những gì được đếm — chỉ là các con số tổng, không gắn với người nào:',
        },
        {
          type: 'ul',
          items: [
            'Số lượt xem mỗi trang (ví dụ trang chủ, trang hướng dẫn, blog), bài blog nào được đọc, và ngôn ngữ hiển thị (Việt hay Anh).',
            'Số lần nút "Thêm vào Chrome" được bấm, và nút đó nằm ở vị trí nào trên trang.',
            'Số lượt truy cập đầu tiên vào /welcome (trang tiện ích mở sau khi cài) và /goodbye (trang mở sau khi gỡ), tức số lượt cài và gỡ.',
            'Lý do gỡ cài đặt bạn chọn trong bảng khảo sát ở trang /goodbye, nếu bạn có gửi.',
            'Tên miền của trang đã dẫn bạn tới đây (ví dụ "google.com") — chỉ tên miền, không bao giờ là đường dẫn đầy đủ hay tham số truy vấn.',
          ],
        },
        {
          type: 'p',
          text: 'Những gì KHÔNG được lưu: địa chỉ IP, chuỗi nhận dạng trình duyệt, cookie, mã định danh xuyên trang, và lịch sử duyệt web của từng người. Không có hồ sơ cá nhân nào được tạo ra. Trình duyệt của bạn có lưu vài dấu mốc nhỏ trong localStorage (ngôn ngữ bạn chọn, và ngày bạn đã được đếm ở /welcome hay /goodbye) để cùng một lượt cài không bị đếm hai lần; chúng nằm trên máy bạn và không được gửi đi.',
        },
        {
          type: 'note',
          text: 'Để một người quay lại trong cùng một ngày chỉ được đếm một lần, máy chủ trộn địa chỉ IP và chuỗi trình duyệt của bạn với một chuỗi bí mật và ngày hôm đó, rồi băm một chiều. Kết quả được đưa thẳng vào một bộ đếm xác suất (HyperLogLog) — thứ chỉ giữ lại thống kê chứ không giữ lại thành viên — rồi bị bỏ đi. Chuỗi băm đó và các dữ liệu đầu vào của nó không được ghi ra bất kỳ đâu, và vì ngày là một phần đầu vào nên giá trị này đổi mỗi nửa đêm, không thể dùng để theo dõi bạn qua nhiều ngày.',
        },
        {
          type: 'p',
          text: 'Nếu trình duyệt của bạn gửi tín hiệu Do Not Track hoặc Global Privacy Control, chúng tôi không đếm gì cả. Lượt truy cập của trình thu thập dữ liệu và bot cũng bị loại.',
        },
        {
          type: 'p',
          text: 'Khảo sát khi gỡ cài đặt. Trang /goodbye có một bảng khảo sát tự nguyện: bạn chọn lý do và có thể viết thêm một ghi chú (tối đa 500 ký tự). Nội dung này được ghi vào một bộ sưu tập Firestore chỉ-ghi mà chỉ chủ dự án đọc được; quy tắc bảo mật cấm mọi thao tác đọc, sửa hay xoá từ phía trình duyệt. Vì đây là ô văn bản tự do, xin đừng viết vào đó thông tin cá nhân. Riêng các lý do bạn tick còn được cộng vào bộ đếm tổng nói trên.',
        },
        {
          type: 'note',
          text: 'Quan trọng: tất cả những điều trong mục này chỉ diễn ra trên website merid.site. Tiện ích không gửi bất cứ thứ gì tới bộ đếm này.',
        },
      ],
    },
    {
      id: 'limited-use',
      heading: '11. Cam kết sử dụng dữ liệu có giới hạn (Limited Use)',
      blocks: [
        {
          type: 'p',
          text: 'Việc Merid sử dụng và chuyển giao thông tin nhận được từ các API của Google tuân thủ Chính sách Dữ liệu Người dùng của Chrome Web Store, bao gồm các yêu cầu Sử dụng Có Giới hạn (Limited Use). Cụ thể:',
        },
        {
          type: 'ul',
          items: [
            'Chúng tôi chỉ thu thập và dùng dữ liệu của bạn để cung cấp và cải thiện các tính năng người dùng nhìn thấy được nêu trong chính sách này.',
            'Chúng tôi không bán dữ liệu người dùng, và không chuyển giao dữ liệu đó cho bên thứ ba trừ khi cần để vận hành hoặc cải thiện tính năng bạn đang dùng (ví dụ gửi đoạn câu tới nhà cung cấp mô hình để trả lời câu hỏi ngữ cảnh), để tuân thủ luật hiện hành, hoặc như một phần của việc sáp nhập/mua lại được thông báo trước.',
            'Chúng tôi không dùng dữ liệu người dùng cho quảng cáo, tiếp thị hướng đối tượng, hay bất kỳ mục đích không liên quan nào, và không dùng nội dung của bạn để huấn luyện mô hình.',
            'Chúng tôi không cho phép con người đọc dữ liệu của bạn, trừ khi bạn cho phép rõ ràng cho mục đích hỗ trợ cụ thể, khi luật yêu cầu, hoặc khi cần cho mục đích bảo mật (ví dụ điều tra lạm dụng).',
          ],
        },
      ],
    },
    {
      id: 'retention',
      heading: '12. Lưu giữ và xóa dữ liệu',
      blocks: [
        {
          type: 'ul',
          items: [
            'Dữ liệu trên thiết bị (cài đặt, deck, hồ sơ cá nhân hoá, bộ dữ liệu tùy chỉnh) được lưu cho đến khi bạn xóa hoặc gỡ cài đặt.',
            'Bộ nhớ đệm câu trả lời AI tự hết hạn sau 30 ngày.',
            'Bộ đếm hạn mức AI hằng ngày tự hết hạn vào nửa đêm giờ UTC.',
            'Các con số đếm của website tự hết hạn sau khoảng 400 ngày.',
            'Dữ liệu đã đồng bộ vẫn nằm trong tài khoản Firebase của chính bạn cho đến khi bạn xóa nó hoặc yêu cầu xóa tài khoản.',
            'Phản hồi khảo sát khi gỡ cài đặt được giữ cho đến khi chúng tôi tự xoá.',
          ],
        },
        {
          type: 'p',
          text: 'Cách bạn kiểm soát và xóa dữ liệu:',
        },
        {
          type: 'ul',
          items: [
            'Tắt hoàn toàn tiện ích bằng nút gạt trên popup, hoặc tạm dừng trên một trang cụ thể bằng "Tắt trên trang này".',
            'Hoàn nguyên một trang về văn bản gốc từ popup.',
            'Tắt kiểm tra ngữ cảnh AI trong Cài đặt bất kỳ lúc nào — không còn gì rời khỏi thiết bị nữa (trừ đồng bộ nếu bạn đang đăng nhập).',
            'Xoá riêng hồ sơ cá nhân hoá bằng "Forget what Merid learned" trong Cài đặt.',
            'Đăng xuất trong Cài đặt để dừng đồng bộ ngay lập tức.',
            'Xóa mọi thứ: Cài đặt → "Delete all stored data" xóa cài đặt, bộ thẻ, hồ sơ và bộ dữ liệu khỏi thiết bị. Gỡ cài đặt tiện ích cũng xóa dữ liệu cục bộ. Để xóa cả dữ liệu đã đồng bộ, hãy xóa bộ thẻ khi đang đăng nhập, hoặc liên hệ chúng tôi (Mục 16) để yêu cầu xóa dữ liệu tài khoản.',
          ],
        },
      ],
    },
    {
      id: 'security',
      heading: '13. Bảo mật',
      blocks: [
        {
          type: 'p',
          text: 'Mọi liên lạc với máy chủ của Merid và với các dịch vụ bên ngoài (Firebase, Firestore, Qwen, Gemini) đều qua kết nối mã hóa TLS. Khóa API của các nhà cung cấp mô hình chỉ tồn tại trong biến môi trường phía máy chủ. Endpoint /api/check chỉ trả lời khi có token đăng nhập hợp lệ, nên nó không mở cho bất kỳ ai trên internet.',
        },
        {
          type: 'p',
          text: 'Dữ liệu đồng bộ được cô lập theo tài khoản bằng các quy tắc bảo mật phía máy chủ của Firestore để chỉ chủ tài khoản mới đọc/ghi được dữ liệu của mình. Hai kho duy nhất do Merid tự vận hành là bộ đếm hạn mức (chỉ chứa "mã tài khoản → số lượt trong ngày") và bộ đếm của website (chỉ chứa các con số tổng). Các đoạn câu của kiểm tra ngữ cảnh không được ghi log và không được lưu ở đâu cả.',
        },
      ],
    },
    {
      id: 'children',
      heading: '14. Quyền riêng tư của trẻ em',
      blocks: [
        {
          type: 'p',
          text: 'Merid là công cụ học tập cho mục đích chung và không cố ý thu thập thông tin cá nhân từ bất kỳ ai, kể cả trẻ em. Chúng tôi không hướng tiện ích tới trẻ em dưới 13 tuổi và không cố ý thu thập dữ liệu từ các em.',
        },
      ],
    },
    {
      id: 'changes',
      heading: '15. Thay đổi chính sách',
      blocks: [
        {
          type: 'p',
          text: 'Các thay đổi quan trọng đối với chính sách này sẽ được phản ánh trên trang này (kèm ngày cập nhật) cũng như trong tệp chính sách của tiện ích và trên listing tại Chrome Web Store. Thay đổi lớn nhất của bản cập nhật này: kiểm tra ngữ cảnh bằng AI nay bật sẵn và chạy qua máy chủ của Merid, thay vì tắt sẵn và cần khóa API của riêng bạn.',
        },
      ],
    },
    {
      id: 'contact',
      heading: '16. Liên hệ',
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
  updated: 'Last updated: August 18, 2026',
  title: 'Privacy Policy',
  tocLabel: 'Contents',
  intro: [
    'Merid is a Chrome browser extension that helps Vietnamese speakers learn English vocabulary naturally: as you read the web, Merid swaps a few Vietnamese words for their English equivalents. This policy explains exactly what Merid does with data — both on the merid.site website and inside the extension.',
    'Finding and replacing words happens entirely inside your browser: Merid keeps no browsing history, stores no URLs, and sends nobody the page in order to do it.',
    'There is one exception, and it is on by default: the AI context check. Before a replaced word is shown to you, Merid sends the short sentence around it (up to 180 characters) to our own endpoint at merid.site/api/check, and from there to a language model, to ask whether the word actually fits. Section 4 sets out in full what is sent, where it goes and what is kept. Turning the feature off in Settings stops every request instantly.',
    'This used to be off by default and required an API key of your own. Merid now supplies the keys and counts usage server-side, so the feature works with no setup from you — the trade is that a Merid server now sits in the middle, which earlier versions of this policy said there was not.',
    'Merid never reads private pages: messaging, email, banking and payments, sign-in screens, password managers, health, tax/benefits/identity services and proctored exams (Section 3). Merid also uses no third-party analytics, no advertising, no tracking pixels, and sells no data.',
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
          text: 'The following data is processed and stored right inside your browser. Except for the cases in Sections 4 and 6, it does not leave your device:',
        },
        {
          type: 'ul',
          items: [
            'Page text (website content). To find vocabulary matches, the extension reads the visible text of pages you visit and compares it against bundled word lists. This scanning and replacement happens entirely in your browser. Merid keeps no browsing history, stores no URLs, and sends no page content anywhere — beyond the short sentence fragments used by the AI context check described in Section 4.',
            'Your settings. Your preferences (selected dataset, display mode, intensity, Vietnamese→English direction, on/off state, interface language, the list of sites you paused Merid on and the list you turned back on) are stored on your device using chrome.storage. If you enable Chrome Sync, these settings may sync across your own Chrome profiles via Google.',
            'Your deck. Words you save ("Save to Deck") and words you mark known ("I know this") are stored on your device. They leave it only via the optional sync in Section 6.',
            'Your personalization profile. Counts describing which words you engage with and how — see Section 5.',
            'Custom datasets you upload. Vocabulary CSV files you import in Settings → "My datasets" are validated and stored only on your device (chrome.storage.local). They are never uploaded to Merid, Firebase, any AI service, or anywhere else, and are not included in the optional sync.',
            'The AI answer cache. Context-check results are kept on your device for 30 days so re-reading a page costs no further requests. The cache lives in chrome.storage.local and is never synced anywhere.',
            'A device identity for the AI allowance. An anonymous account id and a refresh token are stored locally so the daily allowance can be counted — see Section 4.',
          ],
        },
      ],
    },
    {
      id: 'blocked-pages',
      heading: '3. Pages Merid never reads',
      blocks: [
        {
          type: 'note',
          text: 'Because the AI context check is on by default and sends sentence fragments off the device, some pages are not read at all — rather than trusting a setting to be off. On these pages nothing is scanned, stored or sent, whatever your other settings say.',
        },
        {
          type: 'p',
          text: 'The hard exclusion list (which you cannot switch back on) covers:',
        },
        {
          type: 'ul',
          items: [
            'Messaging: Messenger, WhatsApp, Telegram, Zalo, Discord, Slack, Teams, Google Chat/Meet, Signal, Line, Viber, Skype, WeChat, KakaoTalk and the like.',
            'Email: Gmail, Outlook, Yahoo Mail, Proton Mail, iCloud, Fastmail, Zoho, QQ Mail and the like.',
            'Banking and payments: PayPal, Stripe, Wise, crypto exchanges, and Vietnamese banks and wallets such as Vietcombank, Techcombank, BIDV, MoMo, ZaloPay, VNPay.',
            'Sign-in screens and password managers: accounts.google.com, login.microsoftonline.com, Apple ID, Okta, 1Password, Bitwarden, LastPass and the like.',
            'Health, tax, benefits and identity services: NHS, Medicare, IRS, dichvucong.gov.vn, thuedientu.gdt.gov.vn, baohiemxahoi.gov.vn, VNeID and the like.',
            'Proctored exams: Proctorio, Honorlock, Examity, Respondus, ETS.',
            'merid.site itself — not for privacy, but because reading about the extension while it rewrites the page is genuinely unpleasant.',
          ],
        },
        {
          type: 'p',
          text: 'Where a site serves private messages from the same domain as public content — Facebook, Instagram, X, LinkedIn, TikTok, Reddit — the message pages are excluded on their own (/messages, /direct, /messaging and so on), so the feed still works and direct messages are never read. The chat windows pinned to the corner of a feed, where the address never changes, are recognised and skipped too. If you open an inbox without the page reloading, Merid stops and restores what it had replaced.',
        },
        {
          type: 'p',
          text: 'There is also a default-off list you can turn back on per site, covering places where a swapped word is simply wrong: editors and code sandboxes (Google Docs, Office, Notion, Figma, CodePen…), dictionaries and translators, coursework sites, and government sites in general. The popup offers "Turn on for this site".',
        },
        {
          type: 'p',
          text: 'No list can be complete — a company webmail or a hospital portal on its own domain is not something Merid can know about in advance. For those, use "Turn off on this site" in the popup; the choice is remembered.',
        },
      ],
    },
    {
      id: 'ai-check',
      heading: '4. The AI context check (on by default)',
      blocks: [
        {
          type: 'note',
          text: 'This is the only data that leaves your device when you are not signed in, and it is ON by default. Turn it off in Settings → "AI context check" and no request is sent at all.',
        },
        {
          type: 'p',
          text: 'A word that is right in the dictionary can still be wrong in the sentence. Before showing a replaced word, Merid asks a language model whether it fits; words that do not fit are never shown, and the model may suggest a better one.',
        },
        {
          type: 'p',
          text: 'For each checked word, what is sent is:',
        },
        {
          type: 'ul',
          items: [
            'the English word that was substituted;',
            'the Vietnamese word or phrase it replaced;',
            'up to ~180 characters of the sentence around it;',
            'a short summary of your preferences (at most 300 characters), built on your device from your own ratings — for example "prefers C1-level words; reads mostly business". See Section 5.',
          ],
        },
        {
          type: 'p',
          text: 'The technical limits: at most 20 words per request, and at most 3 requests per page. Answers are cached on your device for 30 days, so re-reading a page costs nothing.',
        },
        {
          type: 'note',
          text: 'What is NOT sent: the page address (URL), the page title, your browsing history, form or input contents, cookies, or any part of the page beyond those sentence fragments.',
        },
        {
          type: 'p',
          text: 'Where the request goes. Your browser sends it to https://merid.site/api/check — a serverless function Merid runs on Vercel. That function holds the API keys and forwards the question to a model provider: Qwen (Alibaba Cloud Model Studio) answers first, with Google Gemini as the fallback when Qwen cannot serve it. The provider receives the text of the question only; it does not receive your account id or your email, and has no way of knowing who the request came from.',
        },
        {
          type: 'p',
          text: 'Identity and the daily allowance. So the allowance can be counted without making you create an account, Merid creates an anonymous Firebase account for this device the first time the check runs. That account is a random id: no personal information, no email, no phone number attached. If you have signed in with a real account, that session is used instead.',
        },
        {
          type: 'p',
          text: 'What Merid’s server keeps. One number: how many requests were made today, counted against that account id, stored in Upstash Redis and expiring at midnight UTC. The sentence fragments are not logged, not written to any database and not used to train anything; they exist in memory only long enough to forward the question and return the answer. How the model providers handle data on their side is governed by their own terms.',
        },
        {
          type: 'p',
          text: 'If you would rather have no Merid server in the middle, see the personal API key option in Section 7. And if you turn the check off, the extension keeps working in full — it simply skips the context step.',
        },
      ],
    },
    {
      id: 'profile',
      heading: '5. The personalization profile',
      blocks: [
        {
          type: 'p',
          text: 'Merid records how you react to the words it shows, so it can offer more of what suits you and less of what does not. This profile is on by default and lives on your device (chrome.storage.local). It holds:',
        },
        {
          type: 'ul',
          items: [
            'how often a word was shown, had its card opened, was rated 👍/👎, was saved to your deck, or was marked "I know this";',
            'the CEFR level of the words you accept or reject;',
            'a coarse subject area derived from the page address (for example "business" or "tech"). Only the label is stored — never the address.',
          ],
        },
        {
          type: 'note',
          text: 'The profile contains counts about vocabulary only. It stores no page text, no page titles, no full URLs, no browsing history, and nothing that identifies you.',
        },
        {
          type: 'p',
          text: 'You can read back everything it holds, and erase it on its own without touching your deck, in Settings → "What Merid has learned about you" → "Forget what Merid learned". While the context check is on, a short summary of this profile (Section 4) travels with each request; the summary carries preferences only, with no page content and no identifiers. If you sign in, the profile is also backed up to your own account so your preferences follow you to another computer.',
        },
      ],
    },
    {
      id: 'sync',
      heading: '6. Optional sync when you sign in',
      blocks: [
        {
          type: 'p',
          text: 'You can sign in — on merid.site, where the session carries over to the extension automatically, or from the Settings page — to back up your deck and study it on merid.site. When signed in, the data synced is:',
        },
        {
          type: 'ul',
          items: [
            'your email address (your account identity);',
            'your deck (saved words with their dictionary info, and your known-words list);',
            'the personalization profile from Section 5, as a backup;',
            'your own Gemini API key, if you have one saved (see Section 7).',
          ],
        },
        {
          type: 'p',
          text: 'All of it is stored in Google Firestore under your own account and protected by server-side security rules so that only you can access it. Page content is NOT part of this sync. Signing out stops all syncing immediately.',
        },
        {
          type: 'p',
          text: 'Signing in also replaces the anonymous account from Section 4 with your real one, and the AI feature’s daily allowance is counted against that account instead.',
        },
      ],
    },
    {
      id: 'api-keys',
      heading: '7. API keys',
      blocks: [
        {
          type: 'ul',
          items: [
            'The extension ships with no API keys. Merid’s keys live in server-side environment variables and are never sent to a browser — a key inside an extension is a key anyone can read.',
            'You can still use your own Google Gemini API key. With a personal key, requests go straight from your browser to Google, touch no Merid server, and count against no allowance of ours. The key field is currently hidden in Settings because almost nobody needs it any more; a key saved under an earlier version is still used, and can still be cleared.',
            'A personal key is stored on your device (chrome.storage.local). If you sign in to the optional sync, it is additionally backed up to your own account’s private Firestore document — protected by server-side security rules so only you can read it — purely so the feature keeps working when you sign in on another device. The key is only ever sent to Google endpoints (Gemini, Firestore) over TLS and is deleted from both places when you clear it in Settings.',
          ],
        },
      ],
    },
    {
      id: 'permissions',
      heading: '8. Permissions and why they are used',
      blocks: [
        {
          type: 'p',
          text: 'Merid requests only the minimum permissions needed for the purpose above:',
        },
        {
          type: 'ul',
          items: [
            'storage — to save your settings, deck, personalization profile and custom datasets on the device.',
            'activeTab — so popup actions (such as reverting the page or pausing on the current site) apply to the exact tab you have open.',
            'Host access (<all_urls>, via a content script) — necessary because Merid must read and replace words on whatever Vietnamese page you read; which page cannot be known in advance. Scanning is local, the pages in Section 3 are excluded, and you can pause Merid per site.',
            'Content script on merid.site — used only to carry your sign-in session and your language choice between the merid.site website and the extension so you do not have to log in twice. It does not read the content of any other site.',
          ],
        },
        {
          type: 'p',
          text: 'The extension is allowed to connect to four places in total, declared in its own Content Security Policy: merid.site (the context check) and three Google endpoints for sign-in, Firestore and Gemini. It does NOT use permissions such as "tabs" to track history, "webRequest" to intercept the network, or any location or cross-site cookie tracking.',
        },
      ],
    },
    {
      id: 'third-parties',
      heading: '9. Third-party services',
      blocks: [
        {
          type: 'p',
          text: 'Merid uses only the following services:',
        },
        {
          type: 'ul',
          items: [
            'Vercel — where merid.site and the /api/check endpoint run. Like any web server, Vercel’s infrastructure sees the IP address of a request at the network level; Merid does not record it.',
            'Alibaba Cloud Model Studio (Qwen) — the model provider that answers the context check by default, on its international (Singapore) endpoint.',
            'Google Gemini API (Generative Language API) — the fallback for the context check, and where a personal key of yours would send its requests.',
            'Google Firebase Authentication & Cloud Firestore — for the anonymous account behind the AI allowance, for sign-in, and for the optional sync.',
            'Upstash Redis — where the daily AI allowance counter (per account id) and the merid.site website counts (Section 10) are kept.',
            'Cloudinary — where images for the merid.site blog are stored. Reading a blog post loads those images directly from Cloudinary, so Cloudinary sees that image request.',
          ],
        },
        {
          type: 'p',
          text: 'Merid uses no third-party analytics, no ad networks, no tracking pixels, and no third-party measurement tools — neither on the website nor in the extension. No third-party JavaScript runs on merid.site at all. The website does keep a count of its own, described next.',
        },
      ],
    },
    {
      id: 'website',
      heading: '10. The merid.site counter and survey',
      blocks: [
        {
          type: 'p',
          text: 'To know whether the website is helping anyone, merid.site counts a few things itself. The counter is ours, it sets no cookie, it issues you no identifier, and it cannot work out who you are.',
        },
        {
          type: 'p',
          text: 'What is counted — totals only, never tied to a person:',
        },
        {
          type: 'ul',
          items: [
            'How many times each page was viewed (the homepage, the tutorial, the blog and so on), which blog post was read, and which language was being shown.',
            'How many times an "Add to Chrome" button was clicked, and which button on the page it was.',
            'First visits to /welcome (the page the extension opens once after installing) and /goodbye (the page it opens after uninstalling) — in other words, installs and uninstalls.',
            'The reasons you tick on the exit survey at /goodbye, if you send one.',
            'The domain name of the site that linked you here (for example "google.com") — the domain only, never the full address or its query string.',
          ],
        },
        {
          type: 'p',
          text: 'What is NOT stored: your IP address, your browser’s user-agent string, cookies, cross-site identifiers, and any per-person browsing history. No profile of you is built. Your browser does keep a couple of small markers in localStorage (the language you chose, and the date you were counted at /welcome or /goodbye) so one install is not counted twice; they stay on your machine and are never sent.',
        },
        {
          type: 'note',
          text: 'So that one person returning during the same day is counted once, the server combines your IP address and browser string with a secret and the date, then hashes that one way. The result is fed straight into a probabilistic counter (a HyperLogLog), which keeps statistics rather than members, and is then discarded. Neither the hash nor its inputs is written down anywhere, and because the date is part of it the value changes every midnight, so it cannot be used to follow you from one day to the next.',
        },
        {
          type: 'p',
          text: 'If your browser sends a Do Not Track or Global Privacy Control signal, nothing is counted at all. Crawler and bot traffic is excluded as well.',
        },
        {
          type: 'p',
          text: 'The uninstall survey. The /goodbye page carries a voluntary survey: you tick reasons and may add a note of up to 500 characters. It is written to a write-only Firestore collection that only the project owner can read; the security rules forbid every read, update and delete from a browser. Because the note is free text, please do not put personal information in it. The reasons you tick are additionally added to the aggregate counts above.',
        },
        {
          type: 'note',
          text: 'Important: everything in this section happens on the merid.site website only. The extension sends nothing to this counter.',
        },
      ],
    },
    {
      id: 'limited-use',
      heading: '11. Limited Use commitment',
      blocks: [
        {
          type: 'p',
          text: 'Merid’s use and transfer of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Specifically:',
        },
        {
          type: 'ul',
          items: [
            'We collect and use your data only to provide and improve the user-facing features described in this policy.',
            'We do not sell user data, and do not transfer it to third parties except as needed to operate or improve a feature you are using (for example, passing sentence fragments to a model provider to answer the context question), to comply with applicable law, or as part of a merger/acquisition with prior notice.',
            'We do not use user data for advertising, ad targeting, or any unrelated purpose, and we do not use your content to train models.',
            'We do not allow humans to read your data, except where you give explicit consent for a specific support purpose, where required by law, or where necessary for security purposes (for example, investigating abuse).',
          ],
        },
      ],
    },
    {
      id: 'retention',
      heading: '12. Data retention and deletion',
      blocks: [
        {
          type: 'ul',
          items: [
            'On-device data (settings, deck, personalization profile, custom datasets) is stored until you clear it or uninstall.',
            'The AI answer cache expires after 30 days.',
            'The daily AI allowance counter expires at midnight UTC.',
            'The website counts expire after roughly 400 days.',
            'Synced data remains in your own Firebase account until you delete it or request account deletion.',
            'Uninstall-survey responses are kept until we delete them ourselves.',
          ],
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
            'Turn off the AI context check in Settings at any time — nothing leaves your device after that (bar the sync, if you are signed in).',
            'Erase the personalization profile on its own with "Forget what Merid learned" in Settings.',
            'Sign out in Settings to stop syncing immediately.',
            'Delete everything: Settings → "Delete all stored data" clears your settings, deck, profile and datasets from the device. Uninstalling the extension also removes local data. To remove synced data as well, clear your deck while signed in, or contact us (Section 16) to request account-data deletion.',
          ],
        },
      ],
    },
    {
      id: 'security',
      heading: '13. Security',
      blocks: [
        {
          type: 'p',
          text: 'All communication with Merid’s server and with outside services (Firebase, Firestore, Qwen, Gemini) uses encrypted TLS connections. The model providers’ API keys exist only in server-side environment variables. The /api/check endpoint answers only with a valid sign-in token, so it is not open to the internet at large.',
        },
        {
          type: 'p',
          text: 'Synced data is isolated per account by Firestore’s server-side security rules so only the account owner can read or write their own data. The only two stores Merid runs are the allowance counter (which holds nothing but "account id → requests today") and the website counter (which holds nothing but totals). Context-check fragments are not logged and are stored nowhere.',
        },
      ],
    },
    {
      id: 'children',
      heading: '14. Children’s privacy',
      blocks: [
        {
          type: 'p',
          text: 'Merid is a general-purpose learning tool and does not knowingly collect personal information from anyone, including children. We do not direct the extension to children under 13 and do not knowingly collect data from them.',
        },
      ],
    },
    {
      id: 'changes',
      heading: '15. Changes to this policy',
      blocks: [
        {
          type: 'p',
          text: 'Material changes to this policy will be reflected on this page (with an updated date), as well as in the extension’s policy file and on the Chrome Web Store listing. The main change in this update: the AI context check is now on by default and runs through Merid’s own server, rather than being off by default and requiring an API key of your own.',
        },
      ],
    },
    {
      id: 'contact',
      heading: '16. Contact',
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
  usePageMeta(t.meta.privacyPolicyTitle, t.meta.privacyPolicyDescription)
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
          {/* Not <InstallButton>: a plain footer link, but still part of the
           *  install funnel. */}
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-accent transition-colors hover:text-accent-hover"
            onClick={() => trackInstallClick('privacy-policy')}
          >
            Chrome Web Store ↗
          </a>
        </div>
      </div>
    </div>
  )
}
