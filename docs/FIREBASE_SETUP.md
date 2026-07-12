# Firebase Setup — Merid

Hướng dẫn tạo và cấu hình Firebase project cho Merid (Web app + Chrome Extension),
kèm giải thích các quyết định bảo mật (bám theo OWASP Top 10).

## 1. Tạo project & bật dịch vụ

1. Vào <https://console.firebase.google.com> → **Add project** → đặt tên `merid`
   (Google Analytics: tắt cũng được).
2. **Build → Authentication → Get started → Sign-in method**: bật **Email/Password**
   (không bật Email link, không bật provider khác).
3. **Build → Firestore Database → Create database**: chọn **Production mode**
   (mọi truy cập bị chặn cho tới khi deploy rules), region `asia-southeast1` (Singapore).
4. **Project settings (⚙️) → Your apps → Add app → Web (</>)**: đặt tên `merid-web`,
   không cần Hosting. Copy khối `firebaseConfig`.

## 2. Cấu hình local cho Web app

```bash
cp .env.example .env.local
# Điền các giá trị từ firebaseConfig vào .env.local
```

Trên Vercel: Project → Settings → Environment Variables → thêm đúng các biến
`VITE_FIREBASE_*` rồi redeploy.

### Vì sao apiKey không phải secret (A05)

`apiKey` của Firebase web chỉ **định danh project** với Google — nó không cấp
quyền đọc/ghi dữ liệu. Quyền thật sự do **Firestore Security Rules** quyết định
(file `firestore.rules`). Dù vậy vẫn nên khoá bớt bề mặt tấn công:

1. **Hạn chế API key**: Google Cloud Console → APIs & Services → Credentials →
   chọn *Browser key (auto created by Firebase)* →
   - Application restrictions: **Websites** → thêm `https://merid.site/*` và
     `http://localhost:*`.
   - API restrictions: chỉ giữ *Identity Toolkit API*, *Token Service API*,
     *Cloud Firestore API*.
2. **Authorized domains**: Authentication → Settings → Authorized domains →
   chỉ giữ `merid.site` và `localhost`.
3. Không commit `.env.local` (đã gitignore) — mỗi môi trường tự cấu hình.
4. Nâng cao (làm sau): bật **App Check** (reCAPTCHA v3 cho web) để chỉ app
   hợp lệ mới gọi được Firestore.

> Lưu ý cho Extension: extension gọi Firebase qua REST nên **không** nằm trong
> referrer restriction của key web. Nếu áp referrer restriction, tạo **API key
> thứ hai** không giới hạn referrer nhưng chỉ bật 3 API kể trên, dùng riêng cho
> extension (`merid-extension-final/lib/firebase-config.js`).

## 3. Authentication hoạt động thế nào (A02, A07)

- **Hash mật khẩu**: Firebase Auth hash mật khẩu bằng **scrypt** (bản cải tiến
  của Google) **ở phía server**. Client chỉ gửi mật khẩu qua TLS lúc đăng
  ký/đăng nhập; không bao giờ thấy hay lưu hash. Ta không tự viết logic hash —
  tự viết là nguồn lỗi A02 phổ biến nhất.
- **Token**: sau khi đăng nhập, SDK giữ **ID token (JWT, hạn ~1 giờ)** và
  **refresh token** trong IndexedDB, tự refresh khi hết hạn. Mọi request
  Firestore tự động đính kèm ID token — rules đọc nó qua `request.auth`.
  **Không tự lưu token vào localStorage** (dễ bị XSS đọc trộm hơn và vô nghĩa
  vì SDK đã quản lý).
- **Thông báo lỗi mờ (A07)**: mọi lỗi đăng nhập (`auth/invalid-credential`,
  `auth/user-not-found`, `auth/wrong-password`) đều hiển thị chung là
  *"Email hoặc mật khẩu không đúng"* — không để lộ email nào đã đăng ký
  (chống user enumeration). Firebase cũng tự chặn brute-force
  (`auth/too-many-requests`).

## 4. Cấu trúc dữ liệu Firestore

```
users/{uid}
  createdAt      timestamp   — lúc tạo tài khoản/doc
  wordCountToday int         — số từ đã tạo trong ngày (rate limit A04)
  countDay       int         — ngày hiện tại tính bằng floor(epoch-ms / 86400000), UTC

users/{uid}/words/{wordId}
  word        string ≤64     — bắt buộc, lowercase, wordId == word
  vietnamese  string ≤128
  definition  string ≤512
  example     string ≤1024
  pos         string ≤32
  status      'saved' | 'known'
  datasets    array ⊆ [SAT, B2, C1, C2]
  createdAt   timestamp (server)
  updatedAt   timestamp (server)
```

Thiết kế chống trùng & đọc nhanh:

- **`wordId` = chính từ đó (đã normalize lowercase)** → lưu lại cùng một từ chỉ
  ghi đè document cũ, không bao giờ nhân bản; kiểm tra "từ này có trong deck
  chưa" là 1 phép đọc trực tiếp theo id, không cần query.
- Cả deck của một user là **1 collection query** (`users/{uid}/words`), có thể
  phân trang bằng `orderBy(createdAt)`.
- `saved` và `known` dùng chung collection, phân biệt bằng `status` → đổi trạng
  thái là 1 update, không phải move document.

## 5. Deploy Security Rules

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

Rules nằm ở `firestore.rules` — đọc comment trong file để hiểu từng lớp:
default-deny, owner-only theo `request.auth.uid`, validate schema tại DB,
và rate limit 200 từ/ngày bằng counter bắt buộc cập nhật cùng batch.

### Test rules bằng Emulator

```bash
npm run emulators          # cần Java ≥ 11 (emulator Firestore chạy trên JVM)
npm run test:rules         # chạy test trong test/firestore-rules.test.mjs
```

## 6. Checklist bảo mật đã áp

| OWASP | Biện pháp |
| --- | --- |
| A01 Broken Access Control | Rules owner-only theo `request.auth.uid`, default-deny toàn bộ path lạ |
| A02 Cryptographic Failures | Không tự xử lý mật khẩu/token — scrypt + JWT do Firebase quản lý |
| A03 Injection | Validate type/độ dài/regex ngay trong rules; React tự escape khi render |
| A04 Insecure Design | Rate limit 200 từ/ngày cưỡng chế bằng rules (counter cùng batch) |
| A05 Security Misconfiguration | Config qua env, API key bị hạn chế, authorized domains tối thiểu |
| A07 Auth Failures | Thông báo lỗi mờ, chặn enumeration, Firebase tự chống brute-force |
| A09 Logging Failures | Không log token/email/payload ra console (web + extension) |
