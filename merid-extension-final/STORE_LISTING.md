# Chrome Web Store - listing copy (copy & paste)

Everything below is ready to paste into the Chrome Web Store developer dashboard.
Two languages are provided - use **Vietnamese** as the primary listing (the audience
is Vietnamese learners) and add **English** as a secondary/localized listing if you
wish. Assets to upload are in [`store-assets/`](store-assets) and the icons are
`icon128.png` (store icon) plus the bundled 16/32/48/128 set, all taken from the
design pack in [`../brand/`](../brand).

> **Accuracy note (important):** this copy matches what the extension actually
> does in v1.6.6: matching/replacement is local; the **AI context check is ON by
> default** and sends short sentence fragments to `merid.site/api/check`, which
> calls Qwen (Alibaba Cloud Model Studio) first and Google Gemini as a fallback
> on Merid's own keys; and deck sync stays **optional and off** until the user
> signs in. If you change any of that, update this file, `PRIVACY.md`,
> <https://merid.site/privacy-policy>, and the data-safety answers together.
> Review compares your declarations against observed traffic; a mismatch is a
> common takedown reason.

---

## 1. Basics

| Field | Value |
|---|---|
| **Name** | Merid: Học tiếng Anh ngay khi lướt web tiếng Việt |
| **Category** | Education |
| **Primary language** | Vietnamese |
| **Store icon** | `icon128.png` (128×128) |
| **Screenshots** | `store-assets/screenshot-5-realpage.png` first (the product actually running on a Vietnamese article - store guidelines favor real usage), then `screenshot-1.png` … `screenshot-4.png` (all 1280×800; 5 max) |
| **Small promo tile** | `store-assets/promo-tile-440x280.png` (440×280) |
| **Marquee promo** | `store-assets/marquee-1400x560.png` (1400×560) |
| **Homepage** | https://merid.site |
| **Support** | add a support email + https://merid.site (required for a trustworthy listing) |
| **Privacy policy** | <https://merid.site/privacy-policy> (see §6) |

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

AI KIỂM TRA NGỮ CẢNH (bật sẵn - tắt được bất cứ lúc nào)
• Trước khi hiện một từ đã thay, Merid hỏi một mô hình AI xem từ đó có hợp câu không; từ không hợp sẽ không được hiện ra.
• Khi bật, mỗi từ được kiểm tra sẽ gửi đi: từ tiếng Anh, từ tiếng Việt bị thay, và tối đa 180 ký tự câu chứa nó. Không gửi địa chỉ trang, tiêu đề trang hay lịch sử duyệt web.
• Bạn không cần API key: Merid tự lo khóa và hạn mức. Tắt trong Cài đặt là không còn gì được gửi đi.

TÙY CHỌN (mặc định TẮT - không bắt buộc)
• Đồng bộ bộ thẻ: đăng nhập (trên merid.site hoặc trong Cài đặt) để sao lưu các từ đã lưu vào tài khoản của riêng bạn và ôn tập tại merid.site/my-deck.

RIÊNG TƯ
• Việc quét và thay từ diễn ra trong trình duyệt của bạn.
• Merid không bao giờ đọc trang tin nhắn, email, ngân hàng, đăng nhập, y tế hay thi cử có giám sát.
• Không quảng cáo, không theo dõi hành vi, không bán dữ liệu.
• Chính sách đầy đủ: merid.site/privacy-policy, hoặc liên kết "Privacy policy" trong trang này.

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
• Instant on/off - globally, or per site ("Stop scanning this site").
• Never touches private pages - messaging, email, banking, sign-in - and never touches direct messages on Facebook, Instagram, X, LinkedIn, TikTok or Reddit, while the feeds on those sites keep working.

AI CONTEXT CHECK (ON by default - switch it off any time)
• Before a replaced word appears, Merid asks an AI model whether it fits the sentence; a word that does not fit is never shown, so the text you are reading never changes under you.
• While it is on, each checked word sends: the English word, the Vietnamese it replaced, and up to 180 characters of the sentence around it. No page address, no page title, no browsing history.
• No API key needed - Merid supplies the keys and counts the allowance. Turn it off in Settings and nothing is sent at all.

OPTIONAL (OFF by default - never required)
• Deck sync: sign in (on merid.site or in Settings) to back up your saved words to your own account and study them at merid.site/my-deck.

PRIVACY
• Scanning and replacement happen in your browser.
• Merid never reads messaging, email, banking, sign-in, health or proctored-exam pages.
• No ads, no behavioural tracking, no data sold.
• Full policy: merid.site/privacy-policy, or the Privacy policy link on this listing.

Turn it on, pick a dataset, then open any Vietnamese site (e.g. vnexpress.net, tuoitre.vn) and start learning.
```

---

## 4. Single purpose (required field)

```
Merid replaces selected Vietnamese (or English) words on web pages with English vocabulary from the user's chosen dataset, so users learn English vocabulary while browsing. Matching and replacement run locally in the browser. Two further features serve the same single purpose: an AI context check, on by default, which sends the sentence fragment around each candidate word to Merid's own endpoint (and from there to a model provider) to confirm the word fits before it is shown; and an optional deck sync that backs up the user's saved words to their own account after they sign in.
```

---

## 5. Permission justifications (required field)

| Permission | Justification to paste |
|---|---|
| `storage` | Saves the user's settings (dataset, display mode, intensity, scan direction, on/off, per-site pause list) and their word deck (saved/known words) on the device. If the user signs in to the optional deck sync, the session token is also kept in extension storage. |
| `activeTab` | Powers the popup's current-tab actions: "Stop scanning this site" (reads the active tab's hostname to add/remove it from the user's pause list) and reloading that tab after the user changes the replacement intensity, so the new setting starts from a clean page. Used only when the user opens the popup, only for the active tab. |
| Host access (`content_scripts` on all sites) | The core feature is passive vocabulary replacement while the user browses, so the content script must run on the pages the user visits. Page text is matched locally against the bundled datasets. The only page content that leaves the browser is the AI context check's sentence fragments (up to 180 characters around each candidate word), sent to `merid.site/api/check` and on to a model provider so the replacement can be verified before it is shown; the check is on by default and can be switched off in Settings. Private categories (messaging, email, banking, sign-in, health, tax/identity, proctored exams) are never read at all. |

There are **no** host permissions requested in `host_permissions`, no optional
permissions, and no remote code (all scripts are bundled; MV3 CSP `script-src 'self'`).
The `identity` permission was removed in v1.4 - re-add it only together with a
configured `googleClientId` (see `lib/firebase-config.js`) if you ship in-extension
Google sign-in later, and add a justification for it here when you do.

---

## 6. Privacy / data-use disclosures (Data safety form)

Answer the dashboard's data-use questions as follows (accurate for v1.6.6):

- **Does this item collect or use user data?** Yes - the following, and nothing
  else:
  - **Website content.** The AI context check is **on by default**. For each
    checked word it transmits the English word, the Vietnamese it replaced, and
    up to 180 characters of the surrounding sentence (max 20 words per request,
    max 3 requests per page), plus a short aggregate summary of the user's own
    ratings. These go to `merid.site/api/check`, which forwards them to a model
    provider (Qwen / Alibaba Cloud Model Studio, with Google Gemini as fallback)
    on Merid's keys. Fragments are not logged or stored by the extension or by
    Merid's server, and are not used to train models. The user can switch the
    check off in Settings, after which nothing is transmitted. Users with a
    personal Gemini key saved send the same fragments straight to Google
    instead.
  - **Authentication information.** An anonymous Firebase account is created per
    device so the daily allowance can be counted; its id and refresh token are
    stored in extension storage. If the user signs in, that session replaces it.
    A personal Gemini API key, if the user has one saved, is stored locally and -
    only when signed in - backed up to the user's private Firestore document.
  - **Personally identifiable information - email address.** Collected only when
    the user signs in to the optional deck sync. Stored in the user's own
    Firebase Authentication/Firestore account. Used only to operate the user's
    account and show who is signed in.
  - **User activity.** Aggregate counts of how the user rated, saved or dismissed
    vocabulary words, plus a coarse subject label derived from the page address
    (for example `business`), kept on the device to personalize which words are
    shown, and backed up to the user's own account when signed in. No page text,
    titles or URLs are kept.
  - **Browsing history / location / financial or health info:** **not
    collected.** The extension never transmits URLs, page titles or history.
- **Sold to third parties:** No.
- **Transferred for purposes unrelated to the single purpose:** No.
- **Used or transferred to determine creditworthiness / for lending:** No.
- **Uses remote code:** No (all scripts are bundled; MV3 CSP `script-src 'self'`).
- **Certify** the data-use practices comply with the Developer Program Policies.

Privacy policy URL: <https://merid.site/privacy-policy> (the same policy, kept in
step with [`PRIVACY.md`](PRIVACY.md)). Paste that link into the listing's privacy
field; the listing cannot be submitted without it.

---

## 7. Notes for the reviewer (optional but helps)

```
Merid's matching and replacement are fully local: page text is compared against vocabulary CSVs bundled in the package, and matched words are replaced in place.

Two features use the network:
1) AI context check (ON by default, one toggle in Settings) - before a replaced word is shown, the extension POSTs to https://merid.site/api/check with the English word, the Vietnamese it replaced and up to 180 characters of the surrounding sentence (max 20 items per request, max 3 requests per page), authenticated with a Firebase ID token. That endpoint holds Merid's provider keys and counts a per-day request total per account id; it does not log or store the fragments. To have a token without forcing sign-up, the extension creates an anonymous Firebase account on first use. Answers are cached on the device for 30 days. A user who saves a personal Gemini key bypasses the endpoint entirely and calls generativelanguage.googleapis.com directly.
2) Deck sync (OPTIONAL, off) - if the user signs in (email/password in the options page, or on merid.site), their saved-word deck and personalization profile are backed up to their own Firebase account (identitytoolkit/securetoken/firestore.googleapis.com). Signing out stops it.

merid.site plus those three Google endpoints are the only hosts in the extension CSP. There is no analytics and no remote code. The content script runs on all sites because the product's single purpose is passive vocabulary replacement wherever the user browses; private categories (messaging, email, banking, sign-in screens, password managers, health, tax/benefits/identity, proctored exams) are hard-excluded in lib/vocab-core.js and are never read, and "Turn off on this site" in the popup lets users exclude anything else.

To test the core flow: load the extension, open the popup (choose e.g. the SAT dataset, mode "Replace"), then visit a Vietnamese news site such as vnexpress.net or tuoitre.vn. Highlighted English words appear in articles; hover one for the learning card.
```
