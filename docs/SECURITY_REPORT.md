# Báo cáo Bảo mật — Merid (Web App + Chrome Extension + Firebase)

Tài liệu tổng hợp toàn bộ quyết định bảo mật của dự án, các lỗi đã phát hiện
trong quá trình phát triển và cách kiểm chứng — dùng làm tài liệu thuyết trình.
Bám theo **OWASP Top 10 (2021)**.

## 1. Kiến trúc tổng quan

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Chrome Extension    │  REST   │        FIREBASE          │
│  (Manifest V3)       ├────────►│  Auth (Email/Password)   │
│  savedWords/known    │         │  Firestore + RULES ◄── lớp bảo vệ chính
└─────────────────────┘         └────────────▲─────────────┘
                                              │ SDK
┌─────────────────────┐                       │
│  Web App (merid.site)├───────────────────────┘
│  React + Vite        │   /my-deck (cần đăng nhập)
│  hosted on Vercel    │   /demo    (mock data, không cần account)
└─────────────────────┘
```

Nguyên tắc xuyên suốt: **client không bao giờ được tin** — mọi kiểm soát truy
cập và validate dữ liệu đều được cưỡng chế lần cuối tại server (Firestore
Security Rules), phía client chỉ là lớp UX.

## 2. Bảng đối chiếu OWASP Top 10

| # | Nguy cơ | Biện pháp trong Merid | Bằng chứng / file |
|---|---------|----------------------|-------------------|
| A01 | Broken Access Control | Rules default-deny toàn DB; chỉ `request.auth.uid == uid` được đọc/ghi `users/{uid}/**`. User A không thể đụng data user B kể cả giả mạo uid trong path/payload | `firestore.rules`; test "user B cannot read or write user A data" |
| A02 | Cryptographic Failures | Không tự chế crypto: mật khẩu hash bằng **scrypt** phía server Google; session = ID token (JWT ~1h) + refresh token do SDK quản lý; TLS toàn tuyến | `docs/FIREBASE_SETUP.md` §3 |
| A03 | Injection / XSS | (1) Validate schema ngay trong rules: đúng danh sách field, đúng kiểu, giới hạn độ dài, regex `[a-z](?:[a-z '-]*[a-z])?` cho word → payload chứa `<script>` bị DB từ chối. (2) React auto-escape + **cấm `dangerouslySetInnerHTML`**. (3) `sanitizeVocabText()` strip control-chars + cắt độ dài cho mọi text từ Firestore trước khi render | `firestore.rules` `validWord()`; `src/lib/sanitize.ts`; test "schema violations are rejected" |
| A04 | Insecure Design | **Rate limit 200 từ/ngày/tài khoản** cưỡng chế bằng rules: mỗi lệnh tạo từ phải kèm tăng counter trong cùng một batch atomic (`getAfter()`), tăng đúng +1, không reset lùi trong ngày | `firestore.rules` `counterBumped()`; 2 test rate-limit |
| A05 | Security Misconfiguration | Config qua biến môi trường (`.env.local` gitignore, `.env.example` mẫu); tài liệu hoá việc hạn chế API key theo referrer + API; Authorized domains tối thiểu; extension để trống config = tự tắt hoàn toàn tính năng mạng | `src/lib/firebase.ts`, `.gitignore`, `docs/FIREBASE_SETUP.md` §2 |
| A06 | Vulnerable Components | `npm audit --audit-level=high` cho cả web lẫn extension, chạy tự động mỗi PR; extension **zero-dependency** (không kéo SDK 300KB vào MV3) | `.github/workflows/security.yml` job `audit` |
| A07 | Auth Failures | Thông báo lỗi "mờ": sai email / sai mật khẩu / email không tồn tại đều hiện *"Email hoặc mật khẩu không đúng"* → chống user-enumeration; mật khẩu ≥ 8 ký tự; Firebase tự chặn brute-force (`TOO_MANY_ATTEMPTS`) | `src/lib/auth.ts` `classifyAuthError()`; `options.js` `AUTH_ERRORS` |
| A08 | Software & Data Integrity | Validate tham số runtime ở mọi cửa vào logic: `toDeckWord()` shape-check + drop record hỏng; Puzzle/Flashcard fail-soft khi input không hợp lệ (thiếu example, <4 lựa chọn...); CI build + test là merge-gate | `src/deck/DeckSource.ts`; `PuzzleMode.tsx` `buildRound()` |
| A09 | Logging Failures | Không log token / email / payload / nội dung trang ở bất kỳ đâu; lỗi sync chỉ log mã thô (`console.warn('[VM] sync deferred: NETWORK')`) | `merid-extension-final/lib/firebase-rest.js`, `lib/sync.js` |
| A10 | SSRF | Không có bất kỳ fetch nào theo URL do user nhập. Extension bị CSP `connect-src` khoá cứng vào đúng 3 endpoint Google; nút "View my deck" mở URL hằng số | `manifest.json` CSP; `popup.js` |

## 3. Thiết kế Firestore Rules (lớp phòng thủ chính)

```
users/{uid}                  ← hồ sơ + counter ngày (rate limit)
users/{uid}/words/{wordId}   ← 1 document / từ, wordId == từ đã normalize
```

Các lớp kiểm tra trên **mỗi** request ghi:

1. **Danh tính**: `request.auth.uid == uid` (đường dẫn là ranh giới quyền).
2. **Schema**: `hasOnly`/`hasAll` danh sách field (chặn field lạ kiểu
   `isAdmin: true`), kiểu dữ liệu, độ dài (`word ≤64`, `example ≤1024`...),
   `status ∈ {saved, known}`, `datasets ⊆ {SAT,B2,C1,C2}`.
3. **Danh tính dữ liệu**: `wordId == data.word == lowercase` → mỗi từ chỉ có
   1 document (chống trùng ở tầng cấu trúc), không thể ghi document tên A
   nội dung B.
4. **Bất biến**: `createdAt` không đổi được sau khi tạo; user-doc không bao
   giờ xoá được (giữ mỏ neo rate-limit).
5. **Rate limit atomic**: tạo từ mà không tăng counter cùng batch → từ chối;
   counter nhảy cóc (+5) hay vượt 200/ngày → từ chối; dùng `request.time`
   của **server** nên client chỉnh đồng hồ cũng vô ích.
6. **Default deny**: mọi path không khai báo đều bị chặn.

## 4. Lỗi & edge-case phát hiện trong quá trình phát triển (đã xử lý)

| Lỗi / edge case | Phát hiện bằng | Cách xử lý |
|---|---|---|
| Batch thứ 2 trở đi bị từ chối vì client ghi đè `createdAt` (rule bất biến hoạt động đúng, client sai) | Emulator test fail (1/9) | Client phải **merge-set chỉ 2 field counter**, giữ nguyên `createdAt`; test helper mô phỏng đúng protocol này → 9/9 pass |
| Doc ID bị lệch giữa extension và web: `encodeURIComponent(word)` trong **body JSON** của commit khiến `"give up"` thành `"give%20up"` | Review chéo REST client | Chỉ encode khi path nằm trên **URL** (GET); path trong body giữ nguyên byte |
| Bundle web phình 880KB vì Firebase SDK nằm chung chunk landing page | Cảnh báo build Vite | `manualChunks` tách `firebase` chunk riêng (322KB app + 555KB firebase, cache độc lập) |
| Deploy chưa có env vars → app crash trắng trang? | Thiết kế + e2e test | `isFirebaseConfigured()`: thiếu config thì `/login` hiện thông báo, `/my-deck` chuyển hướng `/demo`, landing bình thường — **fail-safe, không fail-crash** |
| Extension mất mạng giữa chừng / service worker bị Chrome tắt | Thiết kế sync | Diff-based sync + snapshot persist: wake lần sau tự đồng bộ tiếp từ chỗ dừng, backoff mũ khi lỗi mạng, không bao giờ crash extension |
| Từ không hợp lệ với regex của rules (ví dụ chứa ký tự lạ) sẽ kẹt queue sync vĩnh viễn | Review | Skip fail-soft ngay phía client những từ mà rules chắc chắn từ chối |

## 5. Kiểm chứng (chạy được lại bất kỳ lúc nào)

| Hạng mục | Lệnh | Kết quả |
|---|---|---|
| Security rules trên Firestore Emulator thật | `npm run test:rules` | **9/9 pass** (cross-user forgery, schema, counter cheating, immutability) |
| UI deck end-to-end trên Chromium | script Playwright (list/xoá/persist, Puzzle, Flashcard, menu, auth fallback) | **16/16 pass** |
| Extension unit tests + syntax lint | `npm test`, `npm run lint` (trong `merid-extension-final/`) | **20/20 pass** |
| Lỗ hổng dependency | `npm run audit` (cả 2 package) | **0 vulnerabilities** |
| CI tự động mỗi PR vào main | `.github/workflows/security.yml` | audit + build + rules-test + **CodeQL SAST** |

## 6. Giới hạn hiện tại & lộ trình nâng cấp

- **App Check** (reCAPTCHA v3) chưa bật — bật sau sẽ chặn client lạ gọi thẳng
  API dù có apiKey.
- **API key chưa restrict** trong Google Cloud Console — nên khoá về 3 API
  (Identity Toolkit, Token Service, Firestore) sau khi chạy ổn.
- Refresh token của extension nằm trong `chrome.storage.local` — chuẩn chung
  của extension, nhưng nghĩa là malware chiếm được profile Chrome thì chiếm
  được session (ngoài threat-model của web app).
- Rate limit theo tài khoản, chưa theo IP — muốn chặt hơn cần Cloud Functions
  (Blaze plan).
- Email verification / password reset chưa làm (Firebase hỗ trợ sẵn, thêm sau
  không tốn kiến trúc).
