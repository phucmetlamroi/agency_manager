# Rà ngược sau khi chuyển Vercel → VPS

Dự án **đã chuyển** rồi, nên đây không phải hướng dẫn di trú mà là checklist **rà ngược**:
xác minh cái gì đã đúng, tìm cái gì đang hỏng mà không báo lỗi.

Kiểu hỏng đặc trưng của việc này đã lộ ra hai lần rồi: xuất hoá đơn PDF chết vì Chrome không
có `$HOME` ghi được — **lỗi nằm im trong code cả năm**, chỉ nổ khi rời Vercel (đã sửa,
`cfef579`). Và 8 lịch cron trong `vercel.json` thì **chưa chạy ngày nào** kể từ lúc chuyển.

**Bối cảnh:** tên miền giữ nguyên `hustlytasker.xyz` (chỉ đổi DNS) · reverse proxy
**nginx/1.24.0 (Ubuntu)** · giữ nguyên thư mục dự án · đang dùng Resend, Supabase, SePay.

**File cấu hình sẵn sàng chép** trong thư mục này:

| File | Chép tới |
|---|---|
| [`hustlytasker.service`](hustlytasker.service) | `/etc/systemd/system/` |
| [`hustly-cron`](hustly-cron) | `/usr/local/bin/` (chmod 700) |
| [`crontab`](crontab) | `sudo crontab -e` |
| [`nginx.conf`](nginx.conf) | **bản vá bổ sung** — đừng chép đè cấu hình đang chạy |

> `Caddyfile` trong thư mục này **không dùng tới** — máy chủ thật chạy nginx, không phải Caddy.
> Giữ lại phòng khi sau này đổi.

---

## ✅ Đã kiểm chứng từ xa ngày 24/08/2026 — ba mục ĐẠT

Không cần làm gì với ba mục này, đã đo thật chứ không phải suy đoán:

| Mục | Cách đo | Kết quả |
|---|---|---|
| **A1 · Đồng hồ** | So header `Date` của máy chủ với Google và một máy thứ ba | **Lệch 0 giây.** Webhook Mux/SePay an toàn |
| **C1 · `X-Real-IP`** | Gửi `X-Real-IP: 203.0.113.77` giả từ ngoài vào, xem DB ghi gì | **Ghi IP công cộng THẬT**, không phải header giả ⇒ nginx đã ghi đè đúng |
| **C5 · Giới hạn body** | POST 2MB | **Đi lọt** ⇒ `client_max_body_size` đã nâng khỏi mặc định 1MB |

Chạy lại bất cứ lúc nào: `npx tsx scripts/ent/probe-real-ip.ts`

## 🟢 Và tin tốt: thiệt hại webhook = **KHÔNG**

Cảnh báo trước đó về `WEBHOOK_MAX_AGE_MS = 7 ngày` (janitor chỉ cứu được webhook Mux rơi trong
7 ngày) **đã không xảy ra**. Đo thật:

```
🔴 ĐÃ MẤT VĨNH VIỄN (>7 ngày) : 0
🟡 CÒN CỨU ĐƯỢC (<7 ngày)     : 0
```

Không webhook nào bị bỏ rơi. Lý do: module Tệp đang trong giai đoạn đóng dần nên gần như không
có video mới đi qua đường đó. Đồng hồ đếm ngược có thật, nhưng **chưa mất gì cả**.

## ❌ Ba lịch cron đã xác nhận CHẾT

`npx tsx scripts/ent/probe-cron-alive.ts`

| Job | Dấu vết | Kết luận |
|---|---|---|
| **check-deadline** | Lần cuối ghi `'Quá hạn'`: **34 ngày trước**. Đang có **72 task quá hạn chưa đánh dấu** | 🔴 chết |
| **auth-cleanup** | **130** bản ghi đăng nhập cũ hơn 90 ngày còn nguyên | 🔴 chết |
| **cleanup-notifications** | **75** thông báo đáng lẽ đã dọn còn nguyên | 🔴 chết |
| send-digest | 219 thông báo chờ gửi >2h | ❓ không kết luận được — `emailSentAt` cũng do đường gửi email tức thời đặt, không riêng digest |

**72 task quá hạn** là con số cần chú ý trước khi bật `check-deadline` lại — xem mục B2.

---

## KHÔNG cần làm (vì giữ nguyên tên miền)

- Đăng ký lại webhook **Mux** / **SePay** — URL không đổi
- Sửa **redirect URI OAuth** (Google, Drive, Dropbox) — callback không đổi
- Xác thực lại **domain Resend** (SPF/DKIM)
- Sửa **CSP** trong `next.config.ts` — đã có đủ `*.supabase.co` (cả `wss://`), `*.mux.com`,
  `*.r2.cloudflarestorage.com`, `qr.sepay.vn` (đã xác nhận qua header thật)
- **A1 đồng hồ**, **C1 `X-Real-IP`**, **C5 giới hạn body** — đã đo, đều đạt (bảng phía trên)
- Đổi `middleware.ts` → `proxy.ts` — Next 16 mới khuyến nghị, chưa bắt buộc
- **Đừng xoá `vercel.json`** — nó là bản ghi duy nhất của 8 lịch cron

---

## A — Cầm máu (~15 phút)

### A1. Đồng hồ VPS

Webhook Mux và SePay đều fail-closed cửa sổ **±5 phút**. Lệch quá là **401 hàng loạt**:
khách chuyển tiền không được kích hoạt gói, video kẹt `PROCESSING`. Vercel lo NTP hộ, VPS không.

```bash
timedatectl status                 # cần: synchronized yes · NTP active · UTC
sudo timedatectl set-ntp true && sudo timedatectl set-timezone UTC
```

Phải là **UTC chứ không phải giờ VN** — `src/lib/payroll-cycle.ts:25-26` tính kỳ lương bằng
giờ máy chủ, đặt giờ VN làm ranh giới tháng dịch 7 tiếng so với hành vi cũ.

### A2. App đang nối database nào

Next đọc `.env.local` **ưu tiên cao hơn** `.env`. Copy nguyên thư mục thì `.env.local` đi theo
và đang ghi đè `DATABASE_URL`.

```bash
grep -h '^DATABASE_URL=' .env .env.local 2>/dev/null | sed 's|://[^@]*@|://***@|'
```

### A3. Bốn biến `SEPAY_*` — **đã xác nhận THIẾU cả 4**

`SEPAY_ACCOUNT_NUMBER`, `SEPAY_BANK`, `SEPAY_WEBHOOK_HMAC_SECRET`, `SEPAY_WEBHOOK_API_KEY`
không có trong `.env` lẫn `.env.example`. Đây là **đường thu tiền duy nhất**.

Thiếu thì webhook trả 500 (SePay retry, hết lượt là mất thật), và ô **QR trên trang thanh toán
trắng trơn** — khách không có gì để quét.

Kiểm sống: mở trang Gói cước, panel checkout phải hiện ảnh QR VietQR.

> `.env.example` chỉ có 11 biến — **đừng dùng làm danh sách kiểm**, nó thiếu ~25 biến đang dùng.

### A4. Nơi lưu ảnh — đang đúng, chỉ cần ghim lại

`src/lib/storage.ts:23-31`: không có `BLOB_READ_WRITE_TOKEN` + có 2 biến Supabase
⇒ `pickDriver()` trả `'supabase'`. **Đang đúng**, nhưng nó đang *tự đoán*. Ghim tường minh để
sau này thêm biến nào đó không làm nó đổi ý:

```
STORAGE_DRIVER=supabase
SUPABASE_STORAGE_BUCKET=public-uploads
```

Kiểm sống: đổi ảnh đại diện → chuột phải xem URL, phải là `*.supabase.co/storage/...`

### A5. Email — biến có, nhưng phải thử thật

`src/lib/email.ts:27-30` — thiếu key thì `sendEmail()` chỉ `console.warn` rồi `return`. Không
ném lỗi, **giao diện vẫn báo "đã gửi"**. 10 module dính. Biến có trong `.env` nhưng key có thể
đã bị thu hồi.

Dùng **Quên mật khẩu** với email của chính mình → xem log tìm `Email sent to` /
`Resend API error`. **Và mở email đó ra xem link** — trỏ `http://localhost:3000` thì nhảy xuống C3.

---

## B — Dựng lại hai thứ Vercel làm hộ

### B1. Trình quản lý tiến trình

Hiện app chết là nằm chết. Chép [`hustlytasker.service`](hustlytasker.service):

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now hustlytasker
```

**Kiểm chứng thật** — không phải "thấy nó chạy là xong":
```bash
sudo systemctl kill -s SIGKILL hustlytasker
sleep 6 && systemctl is-active hustlytasker      # phải in: active
```

**Cổng 3000 có hở ra Internet không?** Chạy **từ máy anh**, không phải từ VPS:
```bash
curl -sS -m 5 -o /dev/null -w '%{http_code}\n' http://<IP-VPS>:3000/
```
Phải timeout/refused. Trả `200` = mọi cấu hình Caddy đang bị đi vòng qua.

### B2. Cron — 8 job, hiện **0 job đang chạy**

Chép [`hustly-cron`](hustly-cron) và [`crontab`](crontab).

Tin tốt: `src/lib/cron-auth.ts` chỉ đọc `Authorization: Bearer` — **không route nào phụ thuộc
header riêng của Vercel**, curl chạy được ngay, không phải sửa code.

> `RAILWAY_MIGRATION.md` **lỗi thời** — chỉ liệt kê 6/8 job, thiếu đúng `review-janitor` (giữ
> tiền Mux/R2) và `billing-sweep` (doanh thu).

**Kiểm scheduler cũ còn sống không** — cron-job.org từng dựng vẫn đang bắn vào cùng tên miền:
```bash
sudo grep -o '/api/cron/[a-z-]*' /var/log/caddy/hustly-access.log | sort | uniq -c
```
Job mỗi giờ phải đúng 24 lần/ngày. Thấy 48 = có hai scheduler, tắt bớt một. Chạy trùng không
chỉ dư thừa: `send-digest` gửi digest đôi, `billing-sweep` gửi email nhắc gia hạn đôi.

**Lần chạy đầu tiên phải ngồi xem — sẽ xả lũ.** Đo trước:
```sql
-- check-deadline sẽ đánh dấu bao nhiêu task? (vòng lặp KHÔNG có giới hạn)
SELECT count(*) FROM "Task"
 WHERE deadline < now() AND "assigneeId" IS NOT NULL AND status <> 'Quá hạn';

-- review-janitor: webhook ĐÃ MẤT vĩnh viễn vs còn cứu được
SELECT count(*) FROM "WebhookEvent"
 WHERE "processedAt" IS NULL AND "receivedAt" < now() - interval '7 days';
SELECT count(*) FROM "WebhookEvent"
 WHERE "processedAt" IS NULL
   AND "receivedAt" BETWEEN now() - interval '7 days' AND now() - interval '1 hour';
```
Vài trăm task trở lên → chạy ban đêm và báo trước cho team, nếu không cả đội nhận mưa thông báo.

> **Bẫy giám sát:** `review-janitor` trả 200 khi **gửi được sự kiện**, không phải khi janitor
> chạy xong. `hard-delete-*` trả 200 kèm `{"skipped":"migration pending"}` = không xoá gì.
> Phải mở **bảng điều khiển Inngest** xem lượt chạy `review-janitor` + `ent-janitor`.

> Giới hạn `JANITOR_BATCH=100` / `PURGE_BATCH=25` mỗi đêm là **cố ý** — tồn đọng cần vài đêm
> mới rút cạn. Đừng tăng lên cho nhanh.

### B3. Inngest — phải đăng ký tay **mỗi lần build**

```bash
curl -X PUT https://hustlytasker.xyz/api/inngest     # kỳ vọng: modified:true
```

Rời Vercel là mất tích hợp tự đồng bộ. Quên = `review-janitor` và `ent-janitor` (hai hàm
**không có nguồn kích hoạt nào khác**) không tồn tại với Inngest Cloud; cron vẫn trả 200, sự
kiện bay vào hư không, không một dòng log. `ExecStartPost` trong service file tự lo việc này.

Kiểm chứng đầy đủ — script gọi **thật** Mux, R2, Inngest chứ không chỉ kiểm biến có mặt:
```bash
npx tsx scripts/probe-review-provisioning.ts        # kỳ vọng 0 FAIL
```

---

## C — Caddy và các lỗ hổng âm thầm

### C1. 🔴 `X-Real-IP` — lỗ hổng **mới sinh ra do rời Vercel**

`src/lib/request-ip.ts:34-35` đọc `x-real-ip` **đầu tiên**, và chú thích ngay trong file nói rõ
vì sao: *"Vercel sets them to the TRUE connecting client and **overrides anything the caller
sent**"*.

**Caddy không ghi đè, cũng không xoá** — chuyển tiếp nguyên xi. Hậu quả nếu thiếu dòng
`header_up X-Real-IP {remote_host}`:
- Ai cũng gửi `X-Real-IP: <bịa>` đổi mỗi request ⇒ **vô hiệu hoá giới hạn tần suất theo IP chạy
  trên cơ sở dữ liệu**, gồm cả trần chống dò mật khẩu ở cổng chia sẻ cho khách
- `LoginAttempt.ipAddress` ghi giá trị **kẻ tấn công tự khai** ⇒ nhật ký điều tra vô giá trị

**Cách kiểm — một lệnh, ba chẩn đoán.** Route `/api/log-client-error` không cần đăng nhập và
ghi thẳng IP vào `RateLimitBucket`. Chạy **từ máy anh**:
```bash
curl -sS -X POST https://hustlytasker.xyz/api/log-client-error \
  -H 'Content-Type: application/json' -H 'X-Real-IP: 203.0.113.77' \
  -d '{"message":"probe-header-ip"}'
```
```sql
SELECT "key" FROM "RateLimitBucket" WHERE "key" LIKE 'client-error:%'
 ORDER BY "windowStart" DESC LIMIT 3;
```

| Thấy | Nghĩa |
|---|---|
| `client-error:203.0.113.77` | 🔴 header giả đi lọt — lỗ hổng đang mở |
| `client-error:127.0.0.1` | 🟠 mọi khách chung một xô giới hạn tần suất |
| IP công cộng thật của anh | 🟢 đúng |

### C2. Caddy

Chép [`Caddyfile`](Caddyfile), rồi:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Nó xử lý: ghi đè `X-Real-IP` (vá C1), 900 giây cho `/api/inngest` (bước ffmpeg stream video
trong một lần gọi), tắt đệm cho hai route tải ZIP (tránh kịch bản hết RAM đã xảy ra với video
964MB), và bật nhật ký truy cập (Caddy không tự bật).

**Tuyến 900 giây không giả lập được bằng curl.** Kiểm bằng đường thật: upload một video cần gắn
lại thẻ màu, rồi mở bảng điều khiển Inngest xem bước `ensure-color-tags` phải **hoàn tất**.

### C3. `NEXT_PUBLIC_APP_URL` — đổi biến rồi khởi động lại là **KHÔNG đủ**

Dùng ở 24 chỗ, fallback **không nhất quán**: đa số về `hustlytasker.xyz` (vô hại), nhưng
`src/lib/email-templates.ts:65,99,131,173,217,239` fallback về **`http://localhost:3000`**, và
`src/actions/invoice-actions.ts:610` **không có fallback** ⇒ sinh chuỗi `"undefined/admin/crm/..."`.

Vì tiền tố `NEXT_PUBLIC_` nên giá trị **nướng vào bundle lúc build**:
```bash
grep -rl 'localhost:3000' .next/server .next/static 2>/dev/null | head
```
Có kết quả → biến thiếu **lúc build** ⇒ `npm run build` lại, rồi đăng ký lại Inngest (B3).

### C4. Giới hạn tần suất — **phải xác minh, không được giả định**

`UPSTASH_REDIS_REST_URL` **có** trong `.env`, nhưng nếu tài khoản Upstash đã đóng thì limiter
hỏng lúc gọi. Hai khả năng khác hẳn nhau:
```bash
journalctl -u hustlytasker | grep -i 'rate-limit-upstash'
```
Thấy `UPSTASH_REDIS_REST_URL/TOKEN missing in production!` → **tắt sạch**: 10 lần đăng
nhập/phút/IP, 5 đăng ký/giờ, trần OTP, trần mời thành viên — không còn cái nào, và toàn bộ dấu
vết là một dòng `console.error`.

Cộng thêm: **BotId chỉ bật khi có `process.env.VERCEL`** ⇒ trên VPS đã tắt. Nếu C1 cũng chưa sửa
thì ba lớp phòng thủ mất cùng lúc. Còn lại chỉ khoá theo tài khoản — không chặn được kẻ rải một
mật khẩu qua hàng nghìn tài khoản.

### C5. Giới hạn upload — cái chặn thật **không nằm ở Caddy**

- Caddy **không** giới hạn body mặc định (nginx mới có 1MB — hầu hết hướng dẫn trên mạng nói về nginx)
- **Video không bị ảnh hưởng** — đi thẳng lên R2 bằng URL ký sẵn, không xuyên qua Next
- 5 đường upload ảnh/phụ đề là **Server Action**, mà Next có trần riêng **1MB mặc định** và
  `next.config.ts` không khai `experimental.serverActions.bodySizeLimit`

Trần đó **giống hệt nhau trên Vercel và VPS** ⇒ không phải lỗi di trú, nhưng dễ bị đổ oan cho
Caddy. Thử upload avatar ~3MB rồi grep log tìm `Body exceeded 1 MB`.

### C6. Binary native — `sharp` + `ffmpeg`

`node_modules` copy từ Windows sang thì `sharp` mang binary Windows ⇒ **mọi upload ảnh 500**.
```bash
node -e "console.log('sharp OK', require('sharp').versions.vips)"
node -e "require('child_process').execFileSync(require('@ffmpeg-installer/ffmpeg').path,['-version'])"
```
Lỗi `invalid ELF header` / `ERR_DLOPEN_FAILED` → `rm -rf node_modules && npm ci && npm run build`.
(`postinstall` mặc định **bỏ qua** `db push` — an toàn.)

### C7. Chromium + phông chữ cho PDF hoá đơn

Thiếu Chromium → xuất PDF lỗi hẳn. Có Chromium mà **thiếu phông** → PDF ra **toàn ô vuông** với
tiếng Việt có dấu — tệ hơn, vì nó "thành công" và anh gửi khách rồi mới biết.

```bash
sudo apt-get install -y chromium fonts-liberation fonts-noto-core
```
Thêm vào `.env`: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

Xác minh: **xuất một hoá đơn thật, mở ra đọc chữ có dấu.** Không có cách kiểm nào khác đáng tin.

---

## D — Nên làm tuần này

- **Cảnh báo khi cron im lặng.** Không thấy `review-janitor` trong `hustly-cron.log` suốt 24h
  thì gửi mail. (Dòng tự khởi động lại khi app treo đã có sẵn trong [`crontab`](crontab).)
- **`.env` đang trỏ database production cũ.** Prisma CLI đọc `.env`, **không bao giờ đọc
  `.env.local`**. ~150 script trong `scripts/` sẽ nối vào DB cũ. Quy tắc: **luôn truyền
  `DATABASE_URL` nội tuyến** khi chạy script.
- **`.next/cache` sống dai qua khởi động lại** (khác Vercel). Bảng xếp hạng hiện sai sau di trú
  → `rm -rf .next/cache` rồi khởi động lại.
- **Sao lưu database.** Vercel/Neon lo hộ, VPS không. Nếu DB đã về VPS mà chưa có `pg_dump` định
  kỳ thì đây là **rủi ro lớn hơn mọi mục trên cộng lại** — task riêng, đừng quên.

## E — Để sau

`middleware.ts` → `proxy.ts` · viết lại `.env.example` cho đủ 36 biến · chuyển hai route
`download-zip` sang trả URL ký sẵn thay vì proxy byte (chính tác giả ghi trong comment rằng đây
mới là cách chữa thật).

---

## Xếp hạng "chảy máu mỗi ngày"

| # | Mục | Mất gì mỗi ngày trôi qua |
|---|---|---|
| 1 | B2 · review-janitor | Tiền Mux+R2 cho thùng rác quá hạn **+** một lô webhook vượt mốc 7 ngày = mất vĩnh viễn |
| 2 | A1 · Đồng hồ | Khách chuyển tiền không được kích hoạt gói; video kẹt |
| 3 | A3 · `SEPAY_*` | Đã xác nhận thiếu cả 4 — đường thu tiền duy nhất, QR trắng |
| 4 | B2 · billing-sweep | Mỗi ngày bỏ = một nhóm khách **vĩnh viễn** không nhận nhắc gia hạn |
| 5 | A5 · Resend | Mọi email im lặng trong khi giao diện báo "đã gửi" |
| 6 | C1 · X-Real-IP | Lỗ hổng **mới sinh ra do di trú**; nhật ký điều tra vô giá trị |
| 7 | C4 · Giới hạn tần suất | Có thể đang tắt sạch — phải xác minh |
| 8 | B1 · Trình quản lý tiến trình | Không mất gì cho tới lần đầu app chết, sau đó mất tất cả |
| 9 | B2 · check-deadline | "Quá hạn" không tồn tại; để càng lâu, bật lại càng xả lũ |
| 10 | C3 · `APP_URL` | Link hỏng trong email — mất khách âm thầm |

---

## Nghiệm thu — chạy theo thứ tự này

1. `timedatectl status` → synchronized yes, UTC
2. `npx tsx scripts/probe-review-provisioning.ts` → **0 FAIL**
3. Quên mật khẩu với email của mình → nhận được mail, link là `https://hustlytasker.xyz/...`
4. Trang Gói cước → **hiện ảnh QR VietQR**
5. Đổi ảnh đại diện → URL ảnh là `*.supabase.co`
6. Xuất một hoá đơn PDF → **đọc được chữ tiếng Việt có dấu**
7. Probe `X-Real-IP` (C1) → thấy IP công cộng thật, không phải `203.0.113.77`
8. `sudo systemctl kill -s SIGKILL hustlytasker; sleep 6; systemctl is-active hustlytasker` → active
9. Từ máy ngoài: `curl http://<IP-VPS>:3000/` → refused
10. Qua đầu giờ → `tail /var/log/hustly-cron.log` có `job=send-digest http=200`
11. Chạy tay `review-janitor` → bảng điều khiển Inngest: `review-janitor` **và** `ent-janitor`
    đều hoàn tất (đừng nhìn mã HTTP của cron)
12. Upload một video → theo tới `READY`, xác nhận Mux → Inngest thông suốt
