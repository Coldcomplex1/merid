# Chrome Web Store - listing copy (copy & paste)

Everything below is ready to paste into the Chrome Web Store developer dashboard.
Two languages are provided - use **Vietnamese** as the primary listing (the audience
is Vietnamese learners) and add **English** as a secondary/localized listing if you
wish. Assets to upload are in [`store-assets/`](store-assets) and the icons are
`icon128.png` (store icon) plus the bundled 16/48/128 set.

> **Accuracy note (important):** this copy matches what the extension actually
> does in v1.4: matching/replacement is local, and there are exactly two
> **optional, off-by-default** network features - deck sync after the user signs
> in, and the AI context check using the user's own Gemini API key. If you change
> either feature, update this file, `PRIVACY.md`, and the data-safety answers
> together. Review compares your declarations against observed traffic;
> a mismatch is a common takedown reason.

---

## 1. Basics

| Field | Value |
|---|---|
| **Name** | Merid |
| **Category** | Education |
| **Primary language** | Vietnamese |
| **Store icon** | `icon128.png` (128×128) |
| **Screenshots** | `store-assets/screenshot-5-realpage.png` first (the product actually running on a Vietnamese article - store guidelines favor real usage), then `screenshot-1.png` … `screenshot-4.png` (all 1280×800; 5 max) |
| **Small promo tile** | `store-assets/promo-tile-440x280.png` (440×280) |
| **Marquee promo** | `store-assets/marquee-1400x560.png` (1400×560) |
| **Homepage** | https://merid.site |
| **Support** | add a support email + https://merid.site (required for a trustworthy listing) |
| **Privacy policy** | public URL hosting [`PRIVACY.md`](PRIVACY.md) (see §6) |

---

## 2. Summary (short description - max 132 characters)

**Vietnamese**
```
Học từ vựng tiếng Anh (SAT/CEFR) ngay khi lướt web tiếng Việt. Xử lý trong trình duyệt; đồng bộ và AI là tùy chọn.
```

**English**
```
Learn English (SAT/CEFR) vocabulary while browsing Vietnamese sites. Runs in your browser; optional sync and AI check.
```

---

## 3. Detailed description

**Vietnamese**
```
Merid giúp bạn học từ vựng tiếng Anh một cách thụ động ngay trong lúc đọc các trang web tiếng Việt. Khi bật, tiện ích sẽ quét văn bản hiển thị trên trang và thay những từ/cụm tiếng Việt trong bộ dữ liệu bạn chọn bằng từ tiếng Anh tương ứng. Di chuột lên từ để xem nghĩa, phiên âm, ví dụ và từ đồng/trái nghĩa.

TÍNH NĂNG
• Bộ từ vựng có sẵn: SAT, CEFR C1, CEFR C2, hoặc tất cả - hoặc tự tải lên bộ từ CSV của riêng bạn.
• Ba kiểu hiển thị: Thay trực tiếp · Chỉ tô sáng (di chuột xem nghĩa) · Đặt bên cạnh - từ (word).
• Điều chỉnh mật độ thay từ theo ý bạn.
• Hai chiều quét: Việt → Anh và Anh → Anh (bật cả hai để quét đồng thời).
• Thẻ học khi di chuột: định nghĩa, phát âm (giọng đọc của trình duyệt), đồng nghĩa/trái nghĩa, ví dụ.
• "Save to Deck" để lưu từ ôn lại; "I know this" để ngừng thay những từ bạn đã thuộc.
• Bật/tắt tức thì - toàn bộ, hoặc chỉ riêng một trang web ("Tắt trên trang này").
• Khôi phục trang về nguyên bản chỉ với một nhấp.

TÙY CHỌN (mặc định TẮT - không bắt buộc)
• Đồng bộ bộ thẻ: đăng nhập (trên merid.site hoặc trong Cài đặt) để sao lưu các từ đã lưu vào tài khoản của riêng bạn và ôn tập tại merid.site/my-deck.
• AI kiểm tra ngữ cảnh: dùng API key Gemini miễn phí CỦA BẠN để kiểm tra từng từ đã thay có hợp với câu không; từ không hợp tự đổi lại như cũ. Khi bật, chỉ một đoạn câu ngắn quanh từ đã thay được gửi tới Google Gemini.

RIÊNG TƯ
• Việc quét và thay từ diễn ra trong trình duyệt của bạn; Merid không có máy chủ riêng.
• Không đăng nhập, không API key thì tiện ích không gửi bất cứ dữ liệu nào đi đâu.
• Nội dung trang chỉ được gửi tới Google Gemini khi CHÍNH BẠN bật AI kiểm tra ngữ cảnh (và chỉ là đoạn câu ngắn quanh từ đã thay).
• Chính sách đầy đủ: xem liên kết "Privacy policy" trong trang này.

Bật tiện ích, chọn bộ từ, rồi mở một trang tiếng Việt bất kỳ (ví dụ vnexpress.net, tuoitre.vn) và bắt đầu học.
```

**English**
```
Merid helps you absorb English vocabulary passively while you read Vietnamese web pages. When enabled, it scans the visible text on the page and replaces Vietnamese words/phrases from the dataset you choose with their English equivalent. Hover a word to see its meaning, pronunciation, example and synonyms/antonyms.

FEATURES
• Bundled datasets: SAT, CEFR C1, CEFR C2, or All - or upload your own CSV vocabulary.
• Three display modes: Replace directly · Highlight only (hover for meaning) · Show beside - từ (word).
• Adjustable replacement intensity.
• Two scan directions: Vietnamese → English and English → English (enable both to scan at once).
• Hover learning card: definition, pronunciation (browser text-to-speech), synonyms/antonyms, example.
• "Save to Deck" to keep words for review; "I know this" to stop replacing words you already know.
• Instant on/off - globally, or per site ("Turn off on this site").
• One-click page revert.

OPTIONAL (OFF by default - never required)
• Deck sync: sign in (on merid.site or in Settings) to back up your saved words to your own account and study them at merid.site/my-deck.
• AI context check: uses YOUR OWN free Gemini API key to verify each replaced word fits its sentence; words that don't fit revert automatically. When enabled, only a short snippet of the sentence around each replaced word is sent to Google Gemini.

PRIVACY
• Scanning and replacement happen in your browser; Merid runs no servers of its own.
• With no sign-in and no API key, the extension sends nothing anywhere.
• Page content only ever goes to Google Gemini when YOU enable the AI context check (and only short sentence snippets around replaced words).
• Full policy: see the Privacy policy link on this listing.

Turn it on, pick a dataset, then open any Vietnamese site (e.g. vnexpress.net, tuoitre.vn) and start learning.
```

---

## 4. Single purpose (required field)

```
Merid replaces selected Vietnamese (or English) words on web pages with English vocabulary from the user's chosen dataset, so users learn English vocabulary while browsing. Matching and replacement run locally in the browser. Two optional, user-enabled features serve the same purpose: backing up the user's saved-word deck to their own account, and verifying replaced words with Google Gemini using the user's own API key.
```

---

## 5. Permission justifications (required field)

| Permission | Justification to paste |
|---|---|
| `storage` | Saves the user's settings (dataset, display mode, intensity, scan direction, on/off, per-site pause list) and their word deck (saved/known words) on the device. If the user signs in to the optional deck sync, the session token is also kept in extension storage. |
| `activeTab` | Powers the two current-tab actions in the popup: "Turn off on this site" (reads the active tab's hostname to add/remove it from the user's pause list) and "Revert this page" (messages the page to restore its original text). Used only when the user opens the popup, only for the active tab. |
| Host access (`content_scripts` on all sites) | The core feature is passive vocabulary replacement while the user browses, so the content script must run on the pages the user visits. Page text is matched locally against the bundled datasets. Page content leaves the browser only if the user enables the optional AI context check, which sends short sentence snippets around replaced words to Google Gemini using the user's own API key. |

There are **no** host permissions requested in `host_permissions`, no optional
permissions, and no remote code (all scripts are bundled; MV3 CSP `script-src 'self'`).
The `identity` permission was removed in v1.4 - re-add it only together with a
configured `googleClientId` (see `lib/firebase-config.js`) if you ship in-extension
Google sign-in later, and add a justification for it here when you do.

---

## 6. Privacy / data-use disclosures (Data safety form)

Answer the dashboard's data-use questions as follows (accurate for v1.4):

- **Does this item collect or use user data?** Yes - but **only when the user opts
  in**, and only the following:
  - **Personally identifiable information - email address.** Collected only when
    the user signs in to the optional deck sync. Stored in the user's own
    Firebase Authentication/Firestore account. Used only to operate the user's
    account and show who is signed in.
  - **Authentication information.** The sign-in session token, stored in
    extension storage on the device; and, if the user provides one, their own
    Gemini API key (stored locally, and - only when signed in - backed up to the
    user's private Firestore document so the feature follows them across
    devices).
  - **Website content.** Only when the user enables the AI context check: short
    text snippets (the sentence around each replaced word) are sent to Google's
    Gemini API with the user's own key to verify the replacement fits. Snippets
    are not stored by the extension.
  - **User activity / browsing history / location / financial or health info:**
    **not collected.** The extension never transmits URLs, history, or page
    content beyond the opt-in snippets described above.
- **Sold to third parties:** No.
- **Transferred for purposes unrelated to the single purpose:** No.
- **Used or transferred to determine creditworthiness / for lending:** No.
- **Uses remote code:** No (all scripts are bundled; MV3 CSP `script-src 'self'`).
- **Certify** the data-use practices comply with the Developer Program Policies.

Privacy policy URL: host [`PRIVACY.md`](PRIVACY.md) at a public URL (e.g.
https://merid.site/privacy or the repo's raw file) and paste that link into the
listing's privacy field. The listing cannot be submitted without it.

---

## 7. Notes for the reviewer (optional but helps)

```
Merid's matching and replacement are fully local: page text is compared against vocabulary CSVs bundled in the package, and matched words are replaced in place. In its default state the extension makes no network requests - you can verify with DevTools → Network on any page.

Exactly two OPTIONAL, off-by-default features use the network, both user-initiated:
1) Deck sync - if the user signs in (email link/password in the options page, or on merid.site), their saved-word deck is backed up to their own Firebase account (identitytoolkit/securetoken/firestore.googleapis.com). Signing out stops it.
2) AI context check - if the user pastes their OWN Google Gemini API key in the options page and turns the feature on, short sentence snippets around replaced words are sent to generativelanguage.googleapis.com to verify the replacement fits the context. No key ships with the extension.

These four Google endpoints are the only hosts in the extension CSP. There is no Merid backend, no analytics, and no remote code. The content script runs on all sites because the product's single purpose is passive vocabulary replacement wherever the user browses; "Turn off on this site" in the popup lets users exclude any site.

To test the core flow: load the extension, open the popup (choose e.g. the SAT dataset, mode "Replace"), then visit a Vietnamese news site such as vnexpress.net or tuoitre.vn. Highlighted English words appear in articles; hover one for the learning card.
```
