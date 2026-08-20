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

## 4. Chạy thử 10 từ trước

```powershell
node scripts/visual/try.mjs
```

Một lệnh, chạy trọn chuỗi 01 → 04 trên **cùng một nhóm từ**, rồi in ra bảng:
mỗi từ được phân loại thế nào và bởi cái gì, tìm bằng câu gì, chấm điểm so với
cái gì, và điểm bao nhiêu.

Đừng dùng `--limit` của từng bước cho việc này: bước 01 giới hạn nhóm nó đem đi
hỏi, bước 02 giới hạn nhóm concrete, bước 03 giới hạn nhóm tìm được — ba lần
"10 từ" cho ra ba nhóm khác nhau, giao nhau có khi bằng 0.

File tạm nằm ở `state/trial/`, **không đụng** vào state của lần chạy thật.

Từ mặc định được chọn cho **khó**, không phải cho tiêu biểu: một nửa là động từ
có nghĩa vật lý nhưng dùng theo nghĩa trừu tượng (`skirt`, `table`, `eclipse`) —
đúng loại đã từng sai. Muốn chọn từ khác: `node scripts/visual/try.mjs anchor monk aisle`.

Xem ảnh luôn: thêm `--review`.

**Đọc dòng `searched` đối chiếu với định nghĩa ngay trên nó.** Nếu câu tìm kiếm
tả một cảnh có nghĩa đúng như định nghĩa thì chuỗi đang chạy đúng. Nếu nó tả một
phép ẩn dụ thì bước 01 đã phân loại nhầm.

## 4b. Hoặc thử 20 từ theo kiểu cũ

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

# bạn ngồi xem 50 từ, ~10 phút
node scripts/visual/05-review.mjs --sample 50

# in ra bảng: 50 từ đó nói gì về 240 từ còn lại
node scripts/visual/06-build.mjs

# làm theo bảng. 0.284 là con số bảng vừa in, không phải số cố định.
# mã hoá AVIF ~1 giây/ảnh, nên 350 ảnh ≈ 6 phút
node scripts/visual/06-build.mjs --accept-above 0.284
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
- **Không cần duyệt hết.** `--sample 50` đổi công việc chứ không phải rút ngắn
  nó — xem mục dưới.

### Bước 05 cho bạn xem gì

Chỉ những từ mà bước 04 tìm được **ít nhất một ứng viên vượt ngưỡng**, xếp theo
điểm **tăng dần** — từ kém chắc chắn nhất trước, vì đó là chỗ nhìn bằng mắt mới
quyết định được điều gì; những từ chắc chắn chỉ cần bấm `Enter`.

Đánh đổi: dừng giữa chừng thì phần **chưa duyệt là phần chắc chắn nhất**, và
chưa duyệt nghĩa là dùng ký hiệu — tức là mất ảnh tốt. Nếu biết trước sẽ không
duyệt hết, dùng `--order best` để phần bỏ lại là phần kém tin nhất.

Những từ không ứng viên nào đạt sẽ **tự dùng ký hiệu**, không đưa ra hỏi. Bắt
bạn xác nhận một kết luận mà pipeline đã đưa ra rồi, vài trăm lần, chỉ tổ mệt
và làm mất niềm tin vào công cụ.

Muốn xem cả những từ đó: `node scripts/visual/05-review.mjs --all`.
Muốn hạ ngưỡng: `$env:MERID_CLIP_FLOOR='0.20'` rồi chạy lại bước 04.

### Phím trong bước 05

| Phím | Việc |
|---|---|
| `1` `2` `3` | chọn ảnh tương ứng |
| `Enter` | lấy ảnh đầu tiên (gợi ý của pipeline) |
| `x` | không ảnh nào đúng → từ này dùng icon |
| `→` | bỏ qua, quyết định sau |
| `←` | quay lại từ trước |

Mỗi phím bấm là ghi xuống đĩa ngay. Đóng tab không mất gì.

### Duyệt 50 từ thay vì 290: `--sample 50`

```bash
node scripts/visual/05-review.mjs --sample 50
```

Duyệt hết 290 từ là **tự tay quyết định 290 tấm ảnh**. Duyệt 50 từ trải đều dải
điểm là **đo** một chuyện khác: *ở mức điểm nào thì ảnh số 1 của bước 04 là ảnh
mà người thật sự giữ lại?* Câu trả lời đó nói về cả 240 từ bạn không mở.

Nên 50 từ này **không phải 50 từ tệ nhất**. Chương trình chia hàng đợi thành 5
dải điểm bằng nhau và lấy đều mỗi dải 10 từ. Mẫu lấy dồn về một đầu chỉ đo được
đúng cái đầu đó, không suy ra được gì cho phần còn lại.

Bấm phím như bình thường: `Enter` nếu ảnh đầu đúng, `2`/`3` nếu ảnh khác đúng
hơn, `x` nếu không ảnh nào dùng được. Ba loại phím này chính là ba cột trong
bảng ở bước sau — nên **đừng bấm `Enter` cho qua**: mỗi lần bấm bừa là một dòng
sai trong phép đo, và phép đo đó quyết định 240 từ.

### Bước 06 đọc lại 50 phím bấm đó

```bash
node scripts/visual/06-build.mjs
```

Nó in hai bảng. Bảng đầu — tỉ lệ giữ ảnh số 1 theo từng dải điểm:

```
       score range     in queue   you saw   kept #1   took #2/3   refused
       0.196 - 0.221         58        10         4           3         3
       ...
       0.284 - 0.371         58        10         9           1         0
```

Nhìn cột `kept #1` từ trên xuống. Nếu nó **tăng dần** thì điểm của bước 04 thật
sự có ý nghĩa. Nếu nó phẳng thì điểm không đo được gì và không ngưỡng nào cứu
được — bước 06 sẽ nói thẳng như vậy và không gợi ý lệnh nào cả.

Bảng thứ hai trả lời đúng câu hỏi cần hỏi: *lấy đại ảnh số 1 cho mọi từ từ điểm
này trở lên thì đúng bao nhiêu phần trăm?*

```
       cutoff          would ship   you saw   kept #1   right at least
       >= 0.284               40        10         9              72%
       >= 0.249               98        20        17              66%
       ...
```

`would ship` = số từ sẽ được nhận ảnh mà **không ai xem**. Cột cuối là **cận
dưới của khoảng tin cậy 90%**, không phải tỉ lệ thô — 9/10 không phải là 90%,
nó là "khoảng từ 72% trở lên", và 240 tấm ảnh này sẽ không ai kiểm lại nữa nên
phải nói con số thật.

Cuối bảng là một lệnh để copy:

```bash
node scripts/visual/06-build.mjs --accept-above 0.284
```

Nó chỉ được gợi ý khi cận dưới còn giữ được **70%**. Dưới mức đó thì ký hiệu vẽ
sẵn là câu trả lời tốt hơn: một tấm ảnh sai trên thẻ từ vựng không phải là
"không giúp được gì", nó **dạy sai**.

Ba điều lệnh đó **không** làm:

- Không đè lên quyết định của bạn. Từ nào bạn đã bấm `x` thì vẫn dùng ký hiệu,
  kể cả khi điểm rất cao.
- Không đụng tới từ dưới ngưỡng — chúng dùng ký hiệu.
- Không giấu chuyện gì. Danh sách từ được nhận ảnh nhờ thống kê chứ không nhờ
  mắt người nằm ở `scripts/visual/state/auto-accepted.json`, muốn duyệt lại lúc
  nào cũng được.

Muốn duyệt hết 290 từ thì cứ bỏ `--sample` — cách cũ vẫn nguyên.

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
| Bước 06 báo `N picture(s) would not fit` | Ảnh quá rối, nén hết cỡ vẫn > 9KB. Nó tự bỏ ảnh đó và dùng ký hiệu — không cần làm gì |
| Bước 06 báo `pictures are used twice` | Hai từ gần nghĩa nhận cùng một ảnh, ít nhất một cái sai. Mở lại đúng cặp đó: `node scripts/visual/05-review.mjs --only craft,artisan` |
| Nhiều từ chỉ hiện chữ cái đầu | Từ cụ thể nhưng không được ảnh nào. 56 ký hiệu đều là khái niệm trừu tượng nên không có cái nào hợp. Hạ `--accept-above` xuống, hoặc duyệt thêm |
| Ảnh sai nghĩa nhiều | Thường là bước **01** phân loại nhầm từ trừu tượng thành "chụp được", chứ không phải lỗi tìm ảnh. Xoá `state/classification.json` + `state/queries.json` + `state/llm-cache-*.json` rồi chạy lại từ 01 |
| Ảnh là bản đồ, biểu đồ, sơ đồ | Query đang tả một phép ẩn dụ. Xem `state/queries.json` — nếu query tả cảnh vật lý cho một nghĩa trừu tượng thì gốc rễ ở bước 01 |

## 9. Sau khi xong

`vis/` và `visual-index.json` là sản phẩm cuối, commit vào repo bình thường.
`state/decisions.json` cũng vậy — đó là ghi chép bạn đã chọn ảnh nào cho từ nào,
thứ duy nhất trong pipeline không tính lại được bằng máy.

Muốn nâng độ phủ về sau: chạy lại `03` → `06`. Cache giữ nguyên nên chỉ tốn
thời gian ở phần thật sự mới.

Muốn đổi ảnh của một từ: xoá mục đó khỏi `state/decisions.json`, chạy lại `05`
rồi `06`.
