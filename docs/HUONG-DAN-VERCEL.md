# Merid — Hướng dẫn bật AI trên Vercel

> ⚠️ **Bản trong repo này KHÔNG chứa giá trị thật.** Các chỗ `<...>` bên dưới
> phải do chủ project gửi riêng cho người làm setup — khóa API và token không
> bao giờ được commit vào git, kể cả repo private.

Bạn cần làm 2 việc, mất khoảng 10 phút. Không cần biết code.

**Việc đang làm là gì:** Extension Merid thay từ tiếng Việt trên web bằng từ
tiếng Anh, rồi hỏi một mô hình AI xem từ đó có hợp ngữ cảnh không — hỏi Qwen
trước, không được thì mới hỏi Google Gemini. Phần hỏi này chạy trên server của
Merid (đặt tại Vercel) để khóa API không bị lộ. Bạn đang cắm khóa và bật tài
khoản cho server đó.

---

## Phần 1 — Vercel: thêm 5 biến môi trường

### 1.1 Mở đúng trang

1. Vào <https://vercel.com/dashboard> (đăng nhập bằng tài khoản có project Merid)
2. Bấm vào project tên **merid**
3. Thanh menu trên cùng → tab **Settings**
4. Menu dọc bên trái → **Environment Variables**

> Nếu thấy mục *Shared Environment Variables* thì **bỏ qua**, dùng phần của
> project.

### 1.2 Thêm từng biến

Với mỗi biến bên dưới, làm y hệt nhau:

- Điền ô **Key** (tên biến)
- Điền ô **Value** (giá trị)
- Ở phần Environment, tick **Production** *(nên tick luôn Preview)*
- Bấm **Save**

Rồi lặp lại cho biến tiếp theo. Tổng cộng 5 lần.

---

**Biến 1 — khóa Qwen** (đây là bên trả lời chính)

Key:
```
QWEN_API_KEYS
```
Value (chép nguyên khóa, dạng `sk-...`; nhiều khóa thì ngăn bằng **một dấu
phẩy, không có dấu cách**):
```
<khóa-qwen>
```

> Nếu khóa được tạo ở trang console **tiếng Trung** (dashscope.aliyuncs.com)
> chứ không phải bản quốc tế, thêm một biến nữa tên `QWEN_BASE_URL` với giá trị
> `https://dashscope.aliyuncs.com/compatible-mode/v1`. Sai chỗ này thì mọi lời
> gọi đều báo lỗi khóa không hợp lệ, dù khóa hoàn toàn đúng.

---

**Biến 2 — khóa Gemini** (bên dự phòng, dùng khi Qwen không trả lời được)

Key:
```
GEMINI_API_KEYS
```
Value (chép nguyên dòng, **một dấu phẩy ở giữa, không có dấu cách**):
```
<khóa-1>,<khóa-2>
```

---

**Biến 3 — địa chỉ bộ đếm**

Key:
```
UPSTASH_REDIS_REST_URL
```
Value:
```
<https://....upstash.io>
```

---

**Biến 4 — mật khẩu bộ đếm**

Key:
```
UPSTASH_REDIS_REST_TOKEN
```
Value:
```
<token-upstash>
```

---

**Biến 5 — mã dự án Firebase**

Key:
```
FIREBASE_PROJECT_ID
```
Value:
```
merid-49dd5
```

---

### 1.3 Ba lỗi hay gặp

| Lỗi | Hậu quả |
|---|---|
| Bọc giá trị trong dấu nháy `"..."` | Vercel lưu luôn cả dấu nháy → mọi request hỏng |
| Có dấu cách quanh dấu phẩy ở biến 1 | Khóa thứ hai không dùng được |
| Quên tick **Production** | Biến không tới bản chạy thật |

Dán xong nhìn lại một lượt: giá trị **không** có dấu nháy, **không** bị xuống dòng.

### 1.4 Redeploy — bắt buộc

Biến môi trường chỉ đến được bản build **khởi động sau khi bạn bấm Save**. Bản
đang chạy hiện tại vẫn chưa thấy chúng.

1. Thanh trên cùng → tab **Deployments**
2. Bản trên cùng (mới nhất) → bấm nút **⋯** bên phải → **Redeploy**
3. Nếu có ô *Use existing Build Cache* thì **bỏ tick**
4. Bấm **Redeploy**, chờ khoảng 1 phút tới khi hiện **Ready**

---

## Phần 2 — Firebase: bật đăng nhập ẩn danh

Server cần biết "ai đang hỏi" để đếm số lượt mỗi ngày. Người dùng không phải
tạo tài khoản, nên extension tự tạo một danh tính ẩn danh cho từng máy. Tính
năng đó phải được bật:

1. Vào <https://console.firebase.google.com>
2. Chọn project **merid-49dd5**
3. Menu trái → **Authentication**
4. Tab **Sign-in method**
5. Tìm dòng **Anonymous** → bấm vào → gạt sang **Enable** → **Save**

> Thiếu bước này thì server chạy đúng nhưng extension không lấy được vé vào
> cửa, và AI sẽ im lặng.

---

## Phần 3 — Kiểm tra

Mở Terminal (macOS) hoặc PowerShell (Windows), dán dòng này:

```bash
curl -i -X POST https://merid.site/api/check -H "Content-Type: application/json" -d "{\"items\":[]}"
```

Nhìn dòng đầu tiên của kết quả:

| Kết quả | Nghĩa là |
|---|---|
| **`401`** kèm `unauthorized` | ✅ **Thành công.** Đúng như mong đợi |
| `500` kèm `server-misconfigured` | Thiếu biến, hoặc chưa Redeploy → xem lại 1.2 và 1.4 |
| `404` | Vercel không build nhánh `main` → báo lại cho chủ project |

**401 là kết quả ĐÚNG ở bước này.** Lệnh curl không gửi kèm vé vào cửa nên
server từ chối — chứng tỏ nó đang chạy và không mở cho người lạ.

---

## Xong rồi thì báo lại

Nhắn cho chủ project: **"Đã set 5 biến, đã Redeploy, đã bật Anonymous,
curl trả 401."**

Còn một bước cuối thuộc về họ (merge một bản vá vào code extension) trước khi
người dùng thật thấy AI hoạt động. Không phải việc của bạn.

---

## Nếu muốn tự kiểm tra sâu hơn

Trong extension: **Cài đặt → AI context check → Test the AI check**. Nút này
chạy thử một lượt thật và nói thẳng mắt xích nào hỏng:

| Nó hiện | Cần sửa gì |
|---|---|
| *Working (model: …), N of M left today* | Không cần gì, xong |
| *The AI context check is switched off* | Bật công tắc ngay phía trên nút |
| *Could not create an account for this device* | Phần 2 chưa làm |
| *Could not reach the Merid AI endpoint* | Chưa deploy, hoặc mất mạng |
| *…missing its environment variables* | Phần 1.2 hoặc chưa Redeploy |
| *…cannot reach its quota store* | Sai biến 2 hoặc biến 3 |
| *…every Gemini key failed* | Khóa Gemini hết lượt hoặc sai |
| *…rejected this device's token* | Sai biến 4 |

---

## Đổi khóa khi cần

Bất kỳ khóa nào đã đi qua tin nhắn, email, ảnh chụp màn hình hay một commit đều
coi như không còn bí mật. Cách thay mới:

- **Khóa Qwen:** console Model Studio → **API Keys** → xóa khóa cũ → tạo khóa
  mới → cập nhật biến `QWEN_API_KEYS` → Redeploy.
- **Khóa Gemini:** <https://aistudio.google.com/apikey> → xóa khóa cũ → tạo khóa
  mới trong **cùng project** → cập nhật biến `GEMINI_API_KEYS` → Redeploy.
- **Token Upstash:** <https://console.upstash.com> → chọn database →
  **Details → Reset token** → cập nhật `UPSTASH_REDIS_REST_TOKEN` → Redeploy.

Mất thêm một lần Redeploy, gần như không có gián đoạn. Để nguyên thì: khóa
model lộ = người khác xài hết lượt của mình — với Qwen trả tiền theo dùng thì
đó là một hóa đơn, không chỉ là hết quota; token Upstash lộ = người khác xóa
được bộ đếm của tất cả người dùng.
