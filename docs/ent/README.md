# Giải trí — kho phim riêng (sổ tay vận hành)

> Tính năng ẨN, vào bằng mã. Không bán cho khách, không nằm trong bảng giá.
> Mã nguồn: `src/lib/ent/**`, `src/app/api/ent/**`, `src/app/entertainment/**`,
> `src/components/ent/**`.

## 1. Vào cửa thế nào

1. Đăng nhập HustlyTasker như bình thường.
2. Vào **Cài đặt workspace** (trang admin) → card **"Giải trí"**, hoặc gõ thẳng
   `https://<tên miền>/entertainment`.
3. Nhập **mã truy cập**. Nhập đúng một lần, trình duyệt nhớ 30 ngày.

Hai loại mã:

| Mã | Làm được gì |
|---|---|
| **Người xem** (`ENT_VIEWER`) | Duyệt kho phim, xem phim, bật/tắt phụ đề. Hết. |
| **Quản trị** (`ENT_ADMIN`) | Mọi thứ của người xem, **cộng** thanh tab "Up phim": tải phim lên, thêm/gỡ phụ đề, đổi tên, gỡ phim. |

Người cầm mã quản trị **không** tự phát mã cho người khác — việc đó chỉ chủ hệ
thống (`User.role === 'ADMIN'`) làm được, tại `/entertainment/codes`.

## 2. Phát và thu hồi mã

`/entertainment/codes` (lối vào nằm trong tab "Up phim", chỉ chủ hệ thống thấy).

- Tạo mã: chọn loại + ghi chú "phát cho ai" → mã 16 ký tự hiện ra, bấm sao chép.
- **Thu hồi có hiệu lực NGAY**, kể cả với người đang mở sẵn trang: cookie phiên
  chỉ mang id của mã, còn vai trò thì đọc lại từ cơ sở dữ liệu ở mỗi request.
- Mã lưu dạng chữ đọc được (để còn gửi lại cho người khác). Đổi lại nó dài 16 ký
  tự trên bảng 31 ký tự (~79 bit) và mỗi tài khoản/IP chỉ được thử 8 lần / 15 phút.

## 3. Tiền — điều cần biết trước khi up

Kho phim dùng chung tài khoản **Mux** và **Cloudflare R2** với module Tệp.

| Khoản | Mức | Ghi chú |
|---|---|---|
| Chuyển mã (encode) — bậc **Nguyên bản** | ~$0,025–0,10/phút, **trả một lần** | Phim 2 tiếng ≈ 80.000–300.000đ tuỳ độ phân giải |
| Chuyển mã — bậc **Tiết kiệm** | **0đ** | Nhưng Mux **chặn ở 720p**: phim 1080p/4K sẽ bị hạ nét |
| Lưu trữ trên Mux | ~$0,0024–0,0096/phút/tháng | Phim 2 tiếng 1080p ≈ 15.000đ/tháng |
| Lượt xem | **100.000 phút đầu mỗi tháng miễn phí** | ≈ 830 lượt xem trọn phim 2 tiếng — nhóm kín coi như 0đ |
| Bản gốc giữ trên R2 | ~$0,015/GB/tháng | Phim 4 GB ≈ 1.500đ/tháng |

Chọn bậc ngay lúc kéo-thả, **không đổi được sau**. Muốn đổi thì gỡ phim rồi up lại.

**Bản gốc trên R2 được GIỮ LẠI** sau khi Mux xử lý xong. Tốn thêm tiền lưu trữ
nhưng đổi lại có bản gốc để chuyển mã lại nếu cần. Muốn tiết kiệm thì xoá thủ
công trên bảng điều khiển R2 (khoá dạng `ent/<id phim>/source/...`).

> ⚠️ **Quyết định huỷ Mux (04/08/2026) đã bị ĐẢO** vì tính năng này. Sau 03/09
> chỉ dọn asset cũ của module Tệp; **tài khoản Mux phải giữ**, không thì kho phim
> chết theo.

## 4. Kho phim KHÔNG tính vào hạn mức gói

`getStorageUsage` (`src/lib/billing/usage.ts`) chạy SQL thẳng trên bảng
`ReviewVersion`, nên byte của bảng `EntVideo` **vô hình** với hạn mức dung lượng
của các gói thuê bao. Cố ý: kho này của chủ hệ thống, không phải tính năng bán
cho khách. Nếu sau này mở cho khách thì phải sửa `getStorageUsage` thành UNION,
nếu không người dùng lách trần dung lượng bằng cách up vào đây.

## 5. Khi phim kẹt "đang chuyển mã"

Đường xử lý: R2 → Inngest `ent/upload.completed` → tạo asset Mux → webhook Mux →
`READY`. Nếu webhook rơi mất, **cron dọn dẹp lúc 20h hằng ngày** (chung lịch với
module Tệp, `/api/cron/review-janitor`) sẽ hỏi thẳng Mux rồi áp đúng trạng thái.
Quá 24 giờ vẫn chưa xong thì đánh dấu lỗi và xoá asset Mux (kẻo tính tiền mãi).

### Đọc trạng thái trên giao diện

Hàng phim trong tab **Up phim** nói rõ đang ở chặng nào và đã bao lâu:

| Nhãn | Nghĩa | Bao lâu là bình thường |
|---|---|---|
| Đang tải lên | byte đang đi từ máy bạn lên R2 | tuỳ mạng |
| **Đang xếp hàng** | R2 đã nhận đủ, đang chờ giao việc cho Mux | **vài giây** |
| **Mux đang chuyển mã** | Mux đang kéo tệp về và encode | hàng chục phút với phim dài |
| Sẵn sàng / Lỗi | xong | — |

Vượt ngưỡng thì nhãn chuyển **đỏ** kèm một câu giải thích, và hiện nút **Thử lại**
(chạy lại từ tệp gốc còn trên R2 — không phải tải lên lại). Nút này CHỈ hiện khi
Mux chưa nhận việc: đã có asset rồi mà chạy lại là **trả tiền encode hai lần**.

### Kẹt ở "Đang xếp hàng" — gần như luôn là Inngest chưa biết hàm mới

Bộ ba hàm nền (`ent-process-upload`, `ent-mux-webhook`, `ent-janitor`) phải được
**đăng ký với Inngest Cloud** thì sự kiện mới có người nhận. Nếu chưa, sự kiện gửi
đi vẫn "thành công" rồi **rơi vào hư không** — không lỗi, không log, phim nằm mãi ở
Đang xếp hàng. Deploy có tích hợp Vercel–Inngest thì tự đồng bộ; không thì làm tay:

```bash
curl -X PUT https://hustlytasker.xyz/api/inngest
```

Lệnh này chỉ khai báo lại danh sách hàm tại URL đó — không đụng dữ liệu, chạy lại
bao nhiêu lần cũng được. Sau khi đồng bộ, bấm **Thử lại** trên phim đang kẹt.

### Soi trạng thái thật (khi giao diện không đủ)

```bash
npx tsx scripts/ent/check-video-status.ts
```

Đặt cạnh nhau trạng thái trong DB và **câu trả lời của chính Mux** — đủ để phân biệt
"Mux chưa nhận việc" với "Mux xong rồi mà webhook rơi mất". Cần `DATABASE_URL` +
`MUX_TOKEN_ID` + `MUX_TOKEN_SECRET` trong môi trường. Hai script cùng bộ:
`probe-mux-recent.ts` (liệt kê asset gần đây) và `requeue-stuck.ts` (bắn lại việc
cho mọi phim kẹt, an toàn với việc trả tiền hai lần).

## 6. Phụ đề

Chỉ nhận tệp `.srt` do người dùng đưa vào — **không có tự sinh phụ đề**. Hệ thống
chuyển sang định dạng WebVTT (thứ duy nhất trình duyệt đọc được) rồi mới lưu.
Nên lưu tệp bằng mã **UTF-8**; bảng mã cũ sẽ ra chữ hỏng.

Một phim gắn được nhiều phụ đề; người xem chọn trong menu **CC** của trình phát
(menu chỉ hiện khi phim thực sự có phụ đề).

## 7. Phím tắt khi xem

| Phím | Tác dụng |
|---|---|
| `Space` hoặc `K` | Phát / tạm dừng |
| `←` `→` | Lùi / tiến 10 giây |
| `↑` `↓` | Tăng / giảm âm lượng |
| `F` | Toàn màn hình |
| `M` | Tắt / bật tiếng |
| `C` | Bật / tắt phụ đề |

Bấm vào mặt video = phát/dừng. Bấm đúp = toàn màn hình. Trình phát **nhớ chỗ
đang xem dở** và chạy tiếp khi mở lại (lưu trong trình duyệt, không lưu máy chủ —
đổi máy là mất).

## 8. Ranh giới với module Tệp

Dùng chung **hạ tầng** (R2, Mux, bảng `WebhookEvent`, cron dọn dẹp) nhưng **bảng
riêng, API riêng, consumer riêng**. Kho phim **không** chịu hai cờ đóng dịch vụ
`REVIEW_UPLOAD_MAINTENANCE` / `REVIEW_PLAYBACK_DISABLED` — Tệp đóng, kho phim vẫn
chạy.

Sợi dây phân biệt hai module ở phía Mux là trường `passthrough`: kho phim gắn
tiền tố `ent:`. Ba chỗ trong mã nguồn dựa vào tiền tố này (webhook route, hai chỗ
trong `src/lib/review/inngest.ts`); sửa một mà quên hai chỗ kia sẽ khiến video
của module này bị consumer của module kia đánh dấu "đã xử lý" và **treo vĩnh viễn**.
