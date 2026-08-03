# Vận hành thu phí — sổ tay cho chủ Velox

> Cập nhật 2026-08-03 · đi cùng nhánh `claude/billing-2026-07` (P0–P8 đã build).
> Thiết kế dữ liệu: `SCHEMA-DE-XUAT.md` (cùng thư mục). Nguồn giá: `src/lib/billing/plans.ts`.

## 1. Bức tranh 60 giây

- **Không còn gói Free.** Người mới đăng ký → màn chọn gói: quét QR SePay **hoặc** nhập
  trial/gift code do anh phát. (D1/D2, chốt 2026-08-03.)
- **Chưa ai bị khoá** cho tới khi anh đặt env `BILLING_ENFORCEMENT_START`. Trước ngày đó
  mọi thứ chạy như cũ, chỉ hiện banner đếm ngược. Đây là cách thực thi lời hứa "báo trước
  30 ngày" trong Điều khoản §8.
- Tiền vào tài khoản ngân hàng của anh → SePay bắn webhook → gói tự kích hoạt trong ~10s.
- Hết hạn → **chỉ-đọc 30 ngày** (xem + tải được, không tạo mới) → khoá. Dữ liệu không xoá.

## 2. Việc anh phải làm MỘT LẦN trước khi bật (checklist)

| # | Việc | Ở đâu |
|---|---|---|
| 1 | Trong dashboard SePay: tạo webhook trỏ `https://hustlytasker.xyz/api/webhooks/sepay` — Loại giao dịch **Tiền vào**, định dạng **JSON**, tài khoản: chọn ĐÚNG tài khoản nhận tiền (Tuỳ chọn), bật "Dùng để xác thực thanh toán" (server đã trả `{"success":true}` đúng chuẩn), Bảo mật chọn **HMAC-SHA256** → SePay SINH Secret Key, **chỉ hiện MỘT LẦN — copy ngay** (sau đó chỉ còn ****4 ký tự cuối) | my.sepay.vn → Webhooks |
| 2 | Đặt 3 biến SePay trên Vercel: `SEPAY_ACCOUNT_NUMBER`, `SEPAY_BANK` (tên bank chuẩn SePay, vd `MBBank`), `SEPAY_WEBHOOK_HMAC_SECRET` (dán Secret Key vừa copy ở bước 1). *(Nếu dashboard chọn API Key thay vì HMAC thì thay biến thứ ba bằng `SEPAY_WEBHOOK_API_KEY` — hệ thống hỗ trợ cả hai, HMAC an toàn hơn vì có chữ ký + chống phát lại 5 phút.)* | Vercel → Settings → Environment Variables |
| 3 | Chạy cấp ngoại lệ cho 5 org đang dùng (D4): `DATABASE_URL="<prod>" npx tsx scripts/billing/grant-overrides.ts` xem trước → thêm `APPLY=1` để ghi | máy anh |
| 4 | Kiểm bằng `npx tsx scripts/billing/measure-usage.ts` — 5 org phải hết cảnh "sẽ bị khoá" | máy anh |
| 5 | Gửi email báo 30 ngày cho toàn bộ người dùng (mẫu ở mục 6) — **ghi lại ngày gửi** | tay anh |
| 6 | Sau khi merge code lên main + deploy READY: đặt `BILLING_ENFORCEMENT_START` = ngày-gửi + 30 (ISO, vd `2026-09-05`) trên Vercel → redeploy | Vercel |

Đặt sai/thiếu ngày → hệ thống coi như CHƯA cưỡng chế (fail-open có log) — không ai bị khoá nhầm.

## 3. Việc hàng ngày (thường là 0 phút)

- **Tiền vào có mã đúng** → tự động hết: kích hoạt + email biên nhận. Anh không làm gì.
- **Tiền vào không khớp** (quên mã, sai mã, chuyển thiếu) → hiện ở `/billing-ops` mục
  "Tiền vào chưa khớp đơn". Xử lý tay (nhắn khách, hoàn tiền, hoặc kích hoạt hộ bằng
  ngoại lệ) rồi bấm **Đã xử lý**.
- **Phát trial/gift code**: `/billing-ops` → Tạo code (mặc định Agency 14 ngày, 1 lượt).
  Code dạng `VLX-XXXX-XXXX-XXXX`, không có số 0/1. Thu hồi được khi chưa dùng.
- **Cron** `billing-sweep` chạy 08:00 VN mỗi ngày: chuyển GRACE/EXPIRED + gửi email nhắc
  D-7/D-1. Không cần đụng tay.

## 4. Các địa chỉ

| | |
|---|---|
| Trang khách mua gói | `/{workspaceId}/admin/billing` (mục "Gói cước" trên sidebar, admin tổ chức thấy) |
| Bàn điều khiển của anh | `/billing-ops` (chỉ tài khoản global ADMIN) |
| Webhook SePay | `POST /api/webhooks/sepay` |
| Cron vòng đời | `GET /api/cron/billing-sweep` (khoá `CRON_SECRET`) |

## 5. Kịch bản hay gặp

- **Khách kêu "chuyển rồi mà chưa lên gói"**: mở `/billing-ops` → nếu khoản nằm ở hàng chờ
  → xem nội dung CK họ ghi gì. Sai mã → kích hoạt hộ bằng "Cấp ngoại lệ" (ghi lý do) hoặc
  bảo khách chuyển đúng mã lần sau; khoản cũ bấm Đã xử lý.
- **Khách muốn dừng**: không có nút huỷ tự động — họ đơn giản là không gia hạn. Hết hạn
  30 ngày chỉ-đọc rồi khoá. Muốn tắt email nhắc cho một org: đặt `status='CANCELED'`
  (cron bỏ qua CANCELED khi nhắc).
- **Muốn tặng thêm thời gian**: tạo gift code số ngày tuỳ ý và gửi khách nhập, hoặc cấp
  ngoại lệ có hạn. Code chồng code = cộng dồn ngày.
- **Đổi giá**: sửa MỘT chỗ `src/lib/billing/plans.ts` (trang giá + số tiền đơn hàng tự
  theo). Đơn ĐÃ TẠO giữ giá cũ (amountVND đóng băng) — đúng luật "giá khách nhìn thấy".

## 6. MẪU EMAIL BÁO 30 NGÀY (anh gửi tay — bước 5 checklist)

> Tiêu đề: **HustlyTasker chuyển sang gói trả phí từ ngày [NGÀY + 30]**
>
> Chào bạn,
>
> Cảm ơn bạn đã dùng HustlyTasker thời gian qua. Từ **[NGÀY + 30]**, HustlyTasker chuyển
> sang mô hình thuê bao trả phí để chúng tôi đầu tư nghiêm túc vào sản phẩm.
>
> Điều đó nghĩa là gì với bạn:
> - **Trước [NGÀY + 30]:** mọi thứ giữ nguyên, không có gì thay đổi.
> - **Từ [NGÀY + 30]:** tổ chức cần một gói đang hiệu lực (Studio 990.000đ/tháng, Agency
>   3.290.000đ/tháng, Scale 8.290.000đ/tháng — trả năm rẻ hơn ~20%). Thanh toán bằng
>   chuyển khoản QR ngay trong ứng dụng, kích hoạt tự động.
> - **Dữ liệu của bạn an toàn:** nếu chưa kịp chọn gói, tài khoản chuyển sang chế độ
>   chỉ-đọc 30 ngày (vẫn xem và tải mọi thứ), sau đó tạm khoá — kích hoạt gói bất kỳ lúc
>   nào là toàn bộ dữ liệu quay lại nguyên vẹn.
>
> Muốn dùng thử trước khi trả? Trả lời email này, chúng tôi gửi bạn mã dùng thử 14 ngày
> đầy đủ tính năng.
>
> Điều khoản dịch vụ cập nhật: https://hustlytasker.xyz/legal/terms
>
> Trân trọng,
> [Tên anh] — HustlyTasker

⚠️ `BILLING_ENFORCEMENT_START` **phải ≥ ngày gửi email + 30** — đó là lời hứa pháp lý §8.

## 7. Nợ đã ghi (chưa cắm, không chặn thu tiền ngày một)

- Gate FINANCE_SUITE / ANALYTICS ở mức TRANG (mới chặn XLSX export); MCP server (build
  riêng); ẩn nút "So sánh phiên bản" theo gói; trần 4K qua Mux `max_resolution_tier`.
  Toàn bộ là khác biệt giữa các GÓI TRẢ PHÍ với nhau.
- Multi-org chung 1 subscription (Agency 3 org / Scale 5 org): schema sẵn sàng
  (`Profile.subscriptionId`), UI gán org phụ + cộng dồn usage làm khi có khách cần.
- Đo phút video thật (fair-use hiện là điều khoản mềm).
- Harness webhook end-to-end (`test-sepay-webhook.ts`) chạy ở chế độ API Key; chế độ HMAC
  (production dùng) mới có test THUẦN cho verifier (`npm run test:sepay-hmac`, 16 case) —
  wiring header trong route đã review tay + lần checkout 10k thật là bằng chứng end-to-end.
- Bản build này **chưa qua Codex** (khả dụng 2026-08-04) và trang billing/ops **chưa
  soi trên trình duyệt thật** — xem mục Verify của kế hoạch.
