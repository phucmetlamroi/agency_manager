# Đề xuất đổi `schema.prisma` cho hệ thống thu phí — CHỜ CHỦ SẢN PHẨM DUYỆT

> Ngày soạn: 2026-07-31 · Nhánh `claude/billing-2026-07` · Cổng thanh toán: **SePay**
>
> ⛔ **CHƯA chạm vào `prisma/schema.prisma`.** File này là bản mô tả để duyệt. Repo dùng
> `prisma db push` thủ công chứ không dùng `migrate`, nên **không có đường lùi tự động** —
> đó là lý do phải duyệt trước.

---

## 1. Tóm tắt: rủi ro ở mức thấp nhất có thể

| | |
|---|---|
| Bảng **mới** | 3 (`Subscription`, `SubscriptionOrder`, `SubscriptionPayment`) |
| Cột **mới** trên bảng cũ | **1** — `Profile.subscriptionId`, cho phép rỗng |
| Cột bị **sửa kiểu** | **0** |
| Cột bị **xoá** | **0** |
| Bảng bị **đổi khoá chính** | **0** |

Toàn bộ là **thêm mới**. Không có thao tác nào phá dữ liệu đang có. Đây là hình dạng an
toàn nhất cho `db push`: chạy lên database thật thì mọi hàng cũ giữ nguyên, mọi truy vấn
cũ vẫn chạy, và nếu muốn lùi thì chỉ cần bỏ 3 bảng mới + 1 cột mới.

**Thứ tự bắt buộc** (ghi trong `scripts/maybe-db-push.mjs`): THÊM cột thì **push TRƯỚC**
khi đưa mã đọc nó lên. Làm ngược lại thì build vẫn xanh, deploy vẫn báo thành công, lỗi
chỉ nổ ở request đầu tiên — và người phát hiện sẽ là khách.

---

## 2. `Subscription` — một gói đang mua

Một bản ghi = một khách đang trả tiền (hoặc đang dùng thử, hoặc đang ở gói Free).

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | String, khoá chính | |
| `ownerProfileId` | String, **duy nhất** | Tổ chức đứng tên trả tiền |
| `planCode` | String | `FREE` / `STUDIO` / `AGENCY` / `SCALE` / `ENTERPRISE` |
| `status` | String | `TRIALING` / `ACTIVE` / `PAST_DUE` / `GRACE` / `EXPIRED` / `CANCELED` |
| `billingCycle` | String | `MONTHLY` / `ANNUAL` |
| `extraSeats` | Int, mặc định 0 | Số ghế mua thêm ngoài phần kèm sẵn |
| `trialStartedAt` | DateTime? | |
| `trialEndsAt` | DateTime? | Mốc 14 ngày |
| `currentPeriodStart` | DateTime? | |
| `currentPeriodEnd` | DateTime? | Hết hạn kỳ đang trả |
| `graceEndsAt` | DateTime? | Hết hạn → chỉ-đọc tới mốc này rồi mới dọn |
| `canceledAt` | DateTime? | |
| `overrideSeats` | Int? | **Ngoại lệ** — trần ghế riêng, bỏ qua trần của gói |
| `overrideStorageBytes` | BigInt? | **Ngoại lệ** — trần dung lượng riêng |
| `overrideNote` | String? | Vì sao được ngoại lệ (bắt buộc điền khi cấp) |
| `overrideUntil` | DateTime? | Rỗng = vĩnh viễn |
| `createdAt` / `updatedAt` | DateTime | |

**Vì sao dùng String chứ không dùng enum của Postgres:** đổi enum trong Postgres qua
`db push` rất phiền và dễ kẹt. Repo đã có tiền lệ đúng kiểu này — `Workspace.status` và
`Profile.status` đều là String kèm comment liệt kê giá trị hợp lệ. Tôi theo nếp đó.

**Vì sao cần bốn cột `override*`:** năm tổ chức đang dùng thật đều vượt trần Free ngay
ngày đầu (đo được: Vincent 28 ghế, Hustly Team 18 ghế/72,9GB, Tobi 10, Audrey 9,
Carpe Diem 9). Không có đường cấp ngoại lệ thì bật khoá là tự khoá chính mình. `overrideNote`
để bắt buộc, vì một ngoại lệ không ghi lý do sau 6 tháng sẽ không ai dám gỡ.

---

## 3. `Profile.subscriptionId` — cột mới duy nhất trên bảng cũ

`String?`, cho phép rỗng, trỏ tới `Subscription.id`.

**Vì sao không gắn gói thẳng vào `Profile`:** bảng giá cho phép Agency dùng **3 tổ chức**
và Scale **5 tổ chức**, và các tổ chức đó **dùng chung một pool ghế + dung lượng**. Dùng
chung pool là cố ý: nếu mỗi tổ chức có trần riêng thì mua một gói Agency rồi lập 3 tổ chức
× 15 ghế = 45 ghế với giá của 15. Cột này cho nhiều tổ chức cùng trỏ về một gói.

Hiện chưa khách nào có nhiều tổ chức, nên trước mắt luôn là một-trỏ-một. Nhưng hình dạng
đúng ngay từ đầu thì sau này không phải đập đi.

Rỗng = chưa gắn gói nào (mọi hàng cũ sẽ rỗng ngay sau khi push — đó là lý do phải cho phép rỗng).

---

## 4. `SubscriptionOrder` — một lần yêu cầu thanh toán

Sinh ra khi khách bấm "Nâng gói". Nó là thứ nối **mã trên nội dung chuyển khoản** với
**gói khách định mua**.

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | String, khoá chính | |
| `subscriptionId` | String | |
| `paymentCode` | String, **duy nhất** | Mã khách gõ vào nội dung chuyển khoản |
| `planCode` / `billingCycle` / `extraSeats` | | Đang mua cái gì |
| `amountVND` | Int | Số tiền phải chuyển, chốt tại thời điểm tạo |
| `status` | String | `PENDING` / `PAID` / `EXPIRED` / `CANCELED` |
| `expiresAt` | DateTime | Quá hạn thì mã hết hiệu lực |
| `paidAt` | DateTime? | |
| `createdAt` | DateTime | |

**Mã thanh toán:** tiền tố cố định + chuỗi ngắn viết HOA, ví dụ `VELOX7K2M9Q`.
Chỉ chữ và số, **bỏ các ký tự dễ nhìn nhầm** (0/O, 1/I/L) vì người ta gõ tay vào app ngân
hàng. Tiền tố cố định để SePay tự tách mã ra trường `code` giúp — khỏi phải tự bóc chuỗi
nội dung chuyển khoản, vốn là chỗ mỗi ngân hàng cắt xén một kiểu.

**`amountVND` chốt tại thời điểm tạo, KHÔNG tính lại lúc đối chiếu.** Nếu bảng giá đổi giữa
lúc khách bấm nút và lúc khách chuyển tiền, cái đúng là giá khách nhìn thấy.

---

## 5. `SubscriptionPayment` — một giao dịch SePay đã nhận

Mỗi lần SePay báo có tiền vào, ghi đúng một hàng.

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | String, khoá chính | |
| `provider` | String | `sepay` |
| `providerTxnId` | String | Trường `id` trong gói tin SePay |
| `orderId` | String? | Rỗng = **chưa khớp được đơn nào** |
| `amountVND` | Int | Trường `transferAmount` |
| `gateway` | String | Tên ngân hàng |
| `accountNumber` | String | |
| `transferCode` | String? | Trường `code` SePay tự tách |
| `content` | String | Nội dung chuyển khoản, giữ nguyên văn |
| `transactionDate` | DateTime | |
| `matchedAt` | DateTime? | |
| `rawPayload` | Json | Toàn bộ gói tin gốc |
| `createdAt` | DateTime | |

**Ràng buộc duy nhất `[provider, providerTxnId]`** — đây là lớp chống ghi trùng và chống
phát lại. Quan trọng vì SePay **không gửi dấu thời gian đã ký**: cách chống phát lại kiểu
Mux (cửa sổ ±5 phút) không áp dụng được ở đây. Chính tài liệu SePay khuyến nghị đặt ràng
buộc duy nhất trên trường này. SePay thử lại tối đa 7 lần trong ~5 giờ khi thất bại, nên
ghi trùng là chuyện chắc chắn xảy ra, không phải chuyện hiếm.

**`orderId` cho phép rỗng là CỐ Ý.** Khách chuyển tiền mà quên mã, gõ sai mã, hoặc chuyển
sai số tiền — vẫn phải ghi lại. Tiền đã vào tài khoản anh rồi; không ghi thì nó biến mất
khỏi hệ thống và anh chỉ biết khi khách gọi hỏi "tôi chuyển rồi sao chưa kích hoạt".
Những hàng `orderId` rỗng sẽ hiện ở một màn "chờ đối chiếu tay".

---

## 6. KHÔNG đổi `WebhookEvent` — và vì sao

Bảng `WebhookEvent` hiện có `id` là **khoá chính dùng chung cho mọi nhà cung cấp**. Về
nguyên tắc, cắm nhà cung cấp thứ hai vào là có nguy cơ trùng mã: SePay gửi mã dạng số
(vd `92704`), Mux gửi mã dạng UUID. Trùng nhau thì route bắt lỗi trùng, trả về 200, và
**không bao giờ xử lý** — mất im lặng một lần khách trả tiền.

**Cách xử lý tôi chọn: gắn tiền tố khi ghi**, lưu `sepay:92704` thay vì `92704`.

- Đổi khoá chính của một bảng đang có dữ liệu trên production qua `db push` là thao tác
  rủi ro cao và **không đảo ngược được**.
- Gắn tiền tố cho **cùng một bảo đảm** với **rủi ro bằng không**: hai nhà cung cấp không
  thể sinh ra cùng một chuỗi.
- Cột `provider` vẫn còn nguyên để truy vấn.

Ghi ở đây để người sau không tưởng là bỏ sót.

---

## 7. Những gì bản thiết kế này KHÔNG làm

- **Không lưu số thẻ, không lưu thông tin ngân hàng của khách.** SePay chỉ báo "có tiền
  vào, số này, nội dung này". Hệ thống không bao giờ chạm vào dữ liệu thanh toán nhạy cảm.
- **Không đo phút video.** Bảng giá ghi fair-use phút là **điều khoản mềm trong ToS**,
  không phải đồng hồ đếm thời gian thực. Muốn đo thật thì phải lưu thời lượng lúc tạo
  video — hiện database không lưu. Đó là việc khác, không nằm trong đợt này.
- **Không đụng `Invoice` / `Payment` / `BillingProfile` đang có.** Cả ba thuộc miền
  *agency xuất hoá đơn cho khách của agency* — một tầng tenancy khác hẳn. Trộn vào là trộn
  tiền của anh với tiền của khách anh.
- **Không tự động trừ tiền lúc gia hạn.** Chuyển khoản là khách chủ động đẩy, không phải
  hệ thống chủ động rút. Tới kỳ sẽ gửi email nhắc kèm mã QR.

---

## 8. Ba quyết định bản thiết kế này đang chờ

**8.1 — Năm tổ chức đang dùng: cấp ngoại lệ thế nào?**
Đề xuất: Hustly Team (của anh) → ngoại lệ vĩnh viễn mức Scale. Bốn tổ chức khách
(Vincent, Tobi, Audrey, Carpe Diem) → ngoại lệ có hạn 12 tháng ở mức gói họ đang cần,
để có thời gian thương lượng chuyển sang trả phí.

**8.2 — Tổ chức đang có được dùng thử 14 ngày không, hay vào thẳng gói?**
Đề xuất: **không** cho trial. Trial là để người MỚI thử. Người đang dùng nhiều tháng rồi
mà đưa vào trial 14 ngày thì hết trial là bị khoá — trải nghiệm tệ và sai thông điệp.
Họ nên vào thẳng diện ngoại lệ ở 8.1.

**8.3 — Hạn mức dung lượng tính theo con số nào?**
`liveBytes` (khách còn nhìn thấy) hay `totalBytes` (gồm cả thùng rác 30 ngày)? Thùng rác
vẫn tốn tiền R2 thật. Đo hiện tại: hai con số này **chưa làm lệch gói của tổ chức nào**,
nên chọn cách nào lúc này cũng chưa ảnh hưởng ai. Nhưng phải chốt và ghi vào Điều khoản
sử dụng trước khi có khách trả tiền.

---

## 9. Câu lệnh sẽ chạy sau khi anh duyệt

```
ALLOW_DB_PUSH=1 ALLOW_DB_PUSH_PRODUCTION=1 npx prisma db push
```

Hai cờ, cố ý khó gõ nhầm. Tôi sẽ **không chạy lệnh này mà không có chữ duyệt của anh**,
và sẽ chạy thử trên nhánh database thử nghiệm `ep-round-lab` trước.
