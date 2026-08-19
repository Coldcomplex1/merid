# Merid — Hướng dẫn sinh ảnh minh hoạ từ vựng

> ⚠️ **Không bao giờ commit API key vào git**, kể cả repo private. Các khóa
> dưới đây chỉ đặt trong biến môi trường của phiên terminal đang chạy.

Pipeline này biến ba file CSV từ vựng thành ảnh minh hoạ mà extension hiển thị
khi người đọc hover một từ. Mất khoảng 2 giờ, trong đó 1 giờ là bạn ngồi duyệt
ảnh; phần còn lại là máy chạy.

**Không chạy cũng được.** Từ nào không có ảnh sẽ hiện một ký hiệu khái niệm
trên nền màu — extension vẫn hoàn chỉnh. Pipeline này quyết định bao nhiêu phần
trong đó là ảnh chụp thật.

Chi tiết kỹ thuật từng bước nằm ở `scripts/visual/README.md`. Tài liệu này là
đường đi từ đầu đến cuối cho người chạy.

---

## 1. Tải repo về

```bash
git clone https://github.com/Coldcomplex1/merid.git
cd merid
```

Nếu đã có repo trên máy thì `cd` vào đó và `git pull` cho mới nhất. Nếu công
việc đang nằm trên một nhánh riêng thì `git checkout <tên-nhánh>` trước.

---

## 2. Cài công cụ

### Kiểm tra Node

```bash
node -v      # phải là v22.x
```

Chưa có thì cài từ nodejs.org (bản LTS 22).

### Cài dependencies

```bash
npm install          # deps sẵn có của repo
npm i -D sharp       # bước 06 cần, ~30MB
```

> **Lưu ý một cái bẫy tôi đã vấp:** `npm i --no-save <gói>` sẽ **gỡ mất** các gói
> `--no-save` cài trước đó. Cứ dùng `-D` như trên cho chắc.
>
> `npm i -D sharp` sẽ thêm sharp vào `package.json`. Điều đó đúng — repo thật sự
> cần sharp để tái sinh ảnh. Đổi lại CI sẽ cài thêm ~30MB. Nếu bạn không muốn,
> chạy `git checkout package.json package-lock.json` sau khi xong bước 06.

### Cài Python cho bước 04 (CLIP)

Dùng venv để không đụng vào Python hệ thống:

**macOS / Linux**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install open_clip_torch pillow torch
```

**Windows (PowerShell)**
```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install open_clip_torch pillow torch
```

Khoảng 2GB, tải vài phút. Lần đầu chạy bước 04 sẽ tải thêm ~150MB weights của
CLIP từ HuggingFace.

---

## 3. Đặt API key

> **Key Gemini phải bắt đầu bằng `AIzaSy`.** Lấy ở
> <https://aistudio.google.com/apikey>. Key bắt đầu bằng `AQ.` là ephemeral
> token của Live API, không gọi được API này.

**macOS / Linux** — trong cùng terminal bạn sẽ chạy pipeline:
```bash
export GEMINI_API_KEY='key-gemini-moi-cua-ban'
export PEXELS_API_KEY='key-pexels-moi-cua-ban'
```

**Windows (PowerShell)**
```powershell
$env:GEMINI_API_KEY='key-gemini-moi-cua-ban'
$env:PEXELS_API_KEY='key-pexels-moi-cua-ban'
```

Key chỉ sống trong phiên terminal đó. Đóng terminal là mất, phải set lại.
**Đừng** ghi key vào file trong repo.

Kiểm tra đã set chưa:
```bash
node -e "console.log(process.env.GEMINI_API_KEY ? 'gemini OK' : 'gemini CHUA CO')"
node -e "console.log(process.env.PEXELS_API_KEY ? 'pexels OK' : 'pexels CHUA CO')"
```

### Kiểm tra key Gemini có thật sự dùng được

Nếu không chắc, hỏi thẳng Google xem key gọi được model nào:

**Windows PowerShell**
```powershell
curl.exe "https://generativelanguage.googleapis.com/v1beta/models?key=$env:GEMINI_API_KEY"
```

**macOS / Linux**
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
```

| Trả về | Nghĩa |
|---|---|
| JSON dài, có nhiều `"name": "models/gemini-…"` | Key tốt |
| `API_KEY_INVALID` | Sai loại key — tạo lại ở aistudio.google.com/apikey |
| `PERMISSION_DENIED` | Project chưa bật Generative Language API |

Không cần tự chọn model. Pipeline hỏi key xem gọi được gì rồi tự chọn, ưu tiên
`flash-lite` vì hạn mức miễn phí của nhóm này gấp ~25 lần (500 request/ngày so
với 20). Cả pipeline tốn khoảng **131 request**, vừa đủ trong một ngày.

---

## 4. Chạy thử 20 từ trước

**Đừng chạy full ngay.** Chạy thử để xem chất lượng có ổn không, rồi mới chạy
hết. Mọi bước đều resume được nên thử xong không mất gì.

**Đừng dùng `--offline` để vòng qua lỗi.** Nó không hỏi model nên không sinh ra
dữ liệu — các bước sau sẽ không có gì để làm. Nếu một bước báo lỗi, đọc thông
báo: nó chỉ thẳng chỗ cần sửa.

```bash
node scripts/visual/01-classify.mjs --limit 20
node scripts/visual/02-query.mjs    --limit 20
node scripts/visual/03-fetch.mjs    --limit 20
python3 scripts/visual/04-rank.py   --limit 20
node scripts/visual/05-review.mjs
```

Bước cuối in ra một địa chỉ `http://127.0.0.1:8787` — mở trong trình duyệt.
Bạn sẽ thấy từng từ với 3 ảnh ứng viên.

**Đây là lúc quyết định.** Nếu ảnh nhìn hợp lý → chạy tiếp phần 5. Nếu ảnh lệch
nghĩa nhiều → dừng lại và chỉnh: prompt ở `scripts/visual/02-query.mjs`,
hoặc hai ngưỡng `MERID_CLIP_FLOOR` / `MERID_CLIP_MARGIN` ở bước 04.

Xong thì `Ctrl-C` để tắt server.

---

## 5. Chạy đầy đủ

```bash
node scripts/visual/01-classify.mjs     # ~5 phút
node scripts/visual/02-query.mjs        # ~5 phút
node scripts/visual/02b-iconmap.mjs     # ~15 phút (nhiều từ nhất)
node scripts/visual/03-fetch.mjs        # ~40-60 phút, tải ảnh về
python3 scripts/visual/04-rank.py       # ~15-25 phút, CPU chạy hết công suất
node scripts/visual/05-review.mjs       # ~1 giờ CỦA BẠN
node scripts/visual/06-build.mjs        # ~2 phút
```

Ước lượng thời gian sẽ chính xác hơn sau bước 01 — nó in ra bao nhiêu từ thật
sự cần ảnh. (Ở lần đo không có LLM là 404 từ; có LLM chắc sẽ nhỉnh hơn.)

Vài điều khi chạy:

- **Ngắt giữa chừng thoải mái.** `Ctrl-C` rồi chạy lại đúng lệnh đó, nó tiếp tục
  từ chỗ dừng. Câu trả lời của Gemini được cache theo nội dung câu hỏi nên chạy
  lại không tốn quota.
- **Bước 03 gặp 429** sẽ tự dừng 60 giây rồi thử lại. Không cần làm gì.
- **Bước 05** xếp từ khó nhất lên đầu. Hết giờ cứ đóng — từ chưa duyệt tự dùng
  icon, không nhận ảnh bừa.

### Phím trong bước 05

| Phím | Việc |
|---|---|
| `1` `2` `3` | chọn ảnh tương ứng |
| `Enter` | lấy ảnh đầu tiên (gợi ý của pipeline) |
| `x` | không ảnh nào đúng → từ này dùng icon |
| `→` | bỏ qua, quyết định sau |
| `←` | quay lại từ trước |

Mỗi phím bấm là ghi xuống đĩa ngay. Đóng tab không mất gì.

---

## 6. Kiểm tra kết quả

```bash
cd merid-extension-final
npm test          # 19 test, trong đó 3 test về ảnh giờ sẽ chạy thay vì skip
npm run build     # sẽ BÁO LỖI nếu vis/ vượt ngân sách 6MB
node e2e/visual.mjs
du -sh vis        # nên khoảng 2MB
```

Rồi tự mắt kiểm:

1. Load extension vào Chrome: `chrome://extensions` → bật Developer mode →
   *Load unpacked* → chọn thư mục `merid-extension-final`
2. Vào một trang tiếng Việt bất kỳ, hover vài từ được tô vàng
3. Thử riêng ba từ này ở **cả** chế độ SAT lẫn C1/C2 trong Settings —
   `delegate`, `buttress`, `yoke`. Mỗi nghĩa phải ra **ảnh khác nhau**. Đây là
   phần dễ sai nhất của toàn bộ thiết kế.

---

## 7. Đẩy kết quả lên

```bash
cd ..
git add merid-extension-final/vis merid-extension-final/visual-index.json \
        scripts/visual/state/decisions.json
git commit -m "Add the artwork"
git push
```

`decisions.json` phải commit — đó là công sức duyệt tay của bạn, thứ duy nhất
trong pipeline không tính lại được. Mọi file khác trong `state/` đã được
gitignore vì tái tạo được.

---

## 8. Nếu hỏng

| Hiện tượng | Nguyên nhân |
|---|---|
| `no GEMINI_API_KEY set - offline` | Chưa `export`, hoặc đang ở terminal khác |
| `the key was rejected (HTTP 400)` | Sai loại key. Phải là key `AIzaSy…` từ aistudio.google.com/apikey |
| `the key works but can call no text model` | Project chưa bật Generative Language API |
| `no searchable queries were produced` | Bước 02 không nhận được câu trả lời nào — xem dòng `[llm]` ngay trên đó |
| `[llm] 429` lặp mãi | Hết quota free tier trong ngày — chờ mai, tiến độ đã lưu |
| `sharp is not installed` | Chạy `npm i -D sharp` ở **thư mục gốc** repo, không phải trong `merid-extension-final` |
| Bước 04 `Failed to download weights` | Mạng chặn HuggingFace. Thử VPN, hoặc bỏ qua bước 04 — bước 05 vẫn chạy được, chỉ mất thứ tự ưu tiên |
| `npm test` báo `vis/... is over the cap` | Có ảnh > 9KB. Chạy lại bước 06 với `--format webp` |
| Ảnh sai nghĩa nhiều | Chỉnh prompt bước 02, hoặc nâng `MERID_CLIP_FLOOR` / `MERID_CLIP_MARGIN`, rồi chạy lại bước 02 trở đi |

## 9. Sau khi xong

`vis/` và `visual-index.json` là sản phẩm cuối, commit vào repo bình thường.
`state/decisions.json` cũng vậy — đó là ghi chép bạn đã chọn ảnh nào cho từ nào,
thứ duy nhất trong pipeline không tính lại được bằng máy.

Muốn nâng độ phủ về sau: chạy lại `03` → `06`. Cache giữ nguyên nên chỉ tốn
thời gian ở phần thật sự mới.

Muốn đổi ảnh của một từ: xoá mục đó khỏi `state/decisions.json`, chạy lại `05`
rồi `06`.
