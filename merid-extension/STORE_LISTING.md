# Chrome Web Store - listing copy (copy & paste)

Everything below is ready to paste into the Chrome Web Store developer dashboard.
Two languages are provided - use **Vietnamese** as the primary listing (the audience
is Vietnamese learners) and add **English** as a secondary/localized listing if you
wish. Assets to upload are in [`store-assets/`](store-assets) and the icons are
`icon128.png` (store icon) plus the bundled 16/48/128 set.

---

## 1. Basics

| Field | Value |
|---|---|
| **Name** | Merid |
| **Category** | Education |
| **Primary language** | Vietnamese |
| **Store icon** | `icon128.png` (128×128) |
| **Screenshots** | `store-assets/screenshot-1.png` … `screenshot-4.png` (1280×800) |
| **Small promo tile** | `store-assets/promo-tile-440x280.png` (440×280) |
| **Marquee promo** | `store-assets/marquee-1400x560.png` (1400×560) |

---

## 2. Summary (short description - max 132 characters)

**Vietnamese**
```
Học từ vựng tiếng Anh (SAT/CEFR) ngay khi lướt web tiếng Việt. Hoàn toàn cục bộ - không tài khoản, không gửi dữ liệu.
```

**English**
```
Learn English (SAT/CEFR) vocabulary while browsing Vietnamese sites. Fully local - no account, nothing leaves your browser.
```

---

## 3. Detailed description

**Vietnamese**
```
Merid giúp bạn học từ vựng tiếng Anh một cách thụ động ngay trong lúc đọc các trang web tiếng Việt. Khi bật, tiện ích sẽ quét văn bản hiển thị trên trang và thay những từ/cụm tiếng Việt trong bộ dữ liệu bạn chọn bằng từ tiếng Anh tương ứng. Di chuột lên từ để xem nghĩa, phiên âm, ví dụ và từ đồng/trái nghĩa.

TÍNH NĂNG
• Bộ từ vựng có sẵn: SAT, CEFR C1, CEFR C2, hoặc tất cả.
• Ba kiểu hiển thị: Thay trực tiếp · Chỉ tô sáng (di chuột xem nghĩa) · Đặt bên cạnh - từ (word).
• Điều chỉnh mức độ: Nhẹ / Vừa / Nặng.
• Hai chiều quét: Việt → Anh và Anh → Anh (bật cả hai để quét đồng thời).
• Thẻ học khi di chuột: định nghĩa, phát âm (đọc bằng giọng của trình duyệt), đồng nghĩa/trái nghĩa, ví dụ.
• "Save to Deck" để lưu từ ôn lại; "I know this" để ngừng thay những từ bạn đã thuộc.
• Bật/tắt tức thì và hoàn tác trang chỉ với một nhấp.

RIÊNG TƯ & CỤC BỘ
• Toàn bộ xử lý diễn ra trong trình duyệt của bạn.
• Không gửi nội dung trang tới bất kỳ máy chủ nào, không dùng AI/API, không cần API key.
• Không tài khoản, không đăng nhập, không đồng bộ đám mây.
• Chỉ lưu cài đặt và bộ từ của bạn trên máy (chrome.storage).

Bật tiện ích, chọn bộ từ, rồi mở một trang tiếng Việt bất kỳ (ví dụ vnexpress.net, tuoitre.vn) và bắt đầu học.
```

**English**
```
Merid helps you absorb English vocabulary passively while you read Vietnamese web pages. When enabled, it scans the visible text on the page and replaces Vietnamese words/phrases from the dataset you choose with their English equivalent. Hover a word to see its meaning, pronunciation, example and synonyms/antonyms.

FEATURES
• Bundled datasets: SAT, CEFR C1, CEFR C2, or All.
• Three display modes: Replace directly · Highlight only (hover for meaning) · Show beside - từ (word).
• Adjustable intensity: Light / Medium / Heavy.
• Two scan directions: Vietnamese → English and English → English (enable both to scan at once).
• Hover learning card: definition, pronunciation (browser text-to-speech), synonyms/antonyms, example.
• "Save to Deck" to keep words for review; "I know this" to stop replacing words you already know.
• Instant on/off and one-click page revert.

PRIVATE & LOCAL
• All processing happens inside your browser.
• Never sends page content to any server, uses no AI/API, and needs no API key.
• No account, no sign-in, no cloud sync.
• Only your settings and deck are stored on your device (chrome.storage).

Turn it on, pick a dataset, then open any Vietnamese site (e.g. vnexpress.net, tuoitre.vn) and start learning.
```

---

## 4. Single purpose (required field)

```
Merid replaces selected Vietnamese words on web pages with their English equivalent from a bundled vocabulary dataset, so users learn English vocabulary while browsing. All processing is local.
```

---

## 5. Permission justifications (required field)

| Permission | Justification to paste |
|---|---|
| `storage` | Save the user's own settings and word deck locally (selected dataset, display mode, intensity, scan direction, saved words, known words). No data is transmitted. |
| `activeTab` | Granted only when the user explicitly invokes Merid (its keyboard shortcut or the popup's Activate button). It lets Merid act on the single tab the user just acted on. |
| `scripting` | Inject Merid's stylesheet and content script into the current tab at the moment the user activates it. Scripts are bundled; no remote code is used. |

Merid also declares one keyboard command (`toggle-merid-current-page`) in the
`commands` manifest key. This is a shortcut definition, not a permission or host
access.

There are **no** host permissions (`host_permissions`), **no** optional host
permissions, **no** `<all_urls>` content script, **no** `tabs` permission, and no
remote code - the extension makes zero network requests and cannot read any page
the user has not explicitly activated.

---

## 6. Privacy / data-use disclosures (Data safety form)

Answer the dashboard's data-use questions as follows:

- **Does this item collect or use user data?** The extension does **not** collect or
  transmit any user data. It stores settings and the user's deck locally on the
  device only.
- **Data types collected/transmitted:** None.
- **Sold to third parties:** No.
- **Used for purposes unrelated to the single purpose:** No.
- **Uses remote code:** No (all scripts are bundled; MV3 CSP `script-src 'self'`).

Privacy policy URL: host [`PRIVACY.md`](PRIVACY.md) at a public URL (e.g. the repo's
raw file or GitHub Pages) and paste that link into the listing's privacy field.

---

## 7. Notes for the reviewer (optional but helps)

```
Merid is fully local. It does not contact any backend or third-party API, contains no API keys, and makes no network requests. It reads visible page text only to match a bundled vocabulary CSV and replaces matched words in place. Settings and the user's saved/known word lists are stored via chrome.storage on the user's device.
```
