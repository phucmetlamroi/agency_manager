# Kiểm kê môi trường & Báo cáo tương đồng

> **Giai đoạn:** PHASE 1–2 · **Ngày:** 2026-07-28
> **Trạng thái:** ⛔ **DỪNG MỘT PHẦN** — cần anh cấp quyền để dựng môi trường thử nghiệm
> **Nguồn:** khảo sát mã nguồn do Claude và Codex làm **độc lập**, sau đó Claude kiểm chứng chéo

---

## PHẦN A — Cảnh báo an toàn phải đọc trước

### 🔴 A1. Mỗi lần cài đặt dự án là một lần ghi thẳng vào cơ sở dữ liệu THẬT

Đây là phát hiện nghiêm trọng nhất của Phase 1. Codex nêu, tôi **tự kiểm chứng lại và xác nhận đúng**.

Trong `package.json` có dòng này:

```json
"postinstall": "prisma generate && prisma db push"
```

**Dịch sang tiếng thường:** `postinstall` là lệnh chạy **tự động** mỗi khi cài đặt thư viện dự án.
`prisma db push` là lệnh **sửa cấu trúc cơ sở dữ liệu cho khớp với mã nguồn**.
Nó đọc địa chỉ database từ file `.env` — và file `.env` hiện đang trỏ tới **database THẬT đang chạy sản phẩm**.

➡️ **Nghĩa là: gõ `npm install` trong dự án này = sửa cấu trúc database thật.**

**Đây không phải lo xa — đã xảy ra thật rồi.** Chính tài liệu dự án ghi lại (`IMPLEMENTATION-NOTES.md:29`):

> *"postinstall `db push` chạy MỌI build → schema nhánh lên prod DB ngay từ preview build.
> […] đã vi phạm 1 lần → share portal sập ~15 phút"*

| Ảnh hưởng | Chi tiết |
|---|---|
| **Với đợt kiểm toán này** | Tôi **không được** chạy `npm install` khi `.env` còn trỏ vào database thật. Đã ghi nhận, sẽ không làm. |
| **Với việc bán sản phẩm** | Mỗi bản xem thử (preview) trên Vercel cũng đẩy cấu trúc lên database thật của khách. Khi có nhiều agency trả tiền, đây là rủi ro sập dịch vụ. |

**Xếp loại đề xuất:** `S1_CRITICAL` · `MVP_REVENUE_BLOCKER`
**Ghi chú:** đây là phát hiện đầu tiên của đợt kiểm toán. Tôi **chưa sửa** — đúng quy tắc anh đặt ra.

---

## PHẦN B — Có những môi trường nào

| Môi trường | Trạng thái | Bằng chứng |
|---|---|---|
| **Chạy thật (production)** | ✅ Có. Deploy từ nhánh `main` qua PR merge. Database Neon, mã máy chủ `autumn-flower`. | `IMPLEMENTATION-NOTES.md:29`, `.env` |
| **Xem thử (preview)** | ✅ Có. Mỗi nhánh đẩy lên tạo một bản xem thử trên Vercel. **Nhưng dùng chung database thật** (mục A1). | `IMPLEMENTATION-NOTES.md:29` |
| **Thử nghiệm cố định (staging)** | ❌ **KHÔNG CÓ.** | Codex tìm không thấy; tôi xác nhận |
| **Database thử nghiệm cũ** | ⚠️ **Từng có, nay không dùng được.** Mã máy chủ `frosty-forest`. | `scripts/test-invite-security.ts:58-64` |
| **File cấu hình `.env.test`** | ❌ **KHÔNG TỒN TẠI** trên máy này. Tôi đã kiểm trực tiếp. | Kiểm tra thư mục |

### Về database thử nghiệm cũ (`frosty-forest`)

Dự án **đã từng** có một quy trình kiểm thử rất tốt, và nó vẫn còn nguyên trong mã nguồn:

- **8 bộ kiểm thử** chạy được bằng lệnh (`npm run test:invite-security`, `test:folder-scope-db`…)
- **Chốt an toàn 3 lớp:** bắt buộc có `.env.test`; **từ chối** dùng tạm `.env`; và **thoát ngay** nếu địa chỉ database không chứa `frosty-forest` hoặc lỡ chứa `autumn-flower`
- Mỗi bộ kiểm thử tự tạo và tự dọn dữ liệu mẫu, đánh dấu bằng tiền tố riêng (`__invsec__`, `__tc__`, `__fs__`…)

➡️ **Đánh giá của tôi:** đây là nền móng tốt, **không cần dựng lại từ đầu**. Chỉ thiếu đúng một thứ: **địa chỉ kết nối tới một database thử nghiệm còn sống**.

⚠️ **Chưa xác minh được:** nhánh `frosty-forest` còn tồn tại trên tài khoản Neon của anh hay không. Tôi không có quyền truy cập để kiểm tra.

---

## PHẦN C — ⛔ Vì sao tôi phải dừng

Anh đã chọn: **"Tạo nhánh DB thử nghiệm mới + chạy app trên máy"** — đây đúng là phương án tốt nhất và tôi hoàn toàn đồng ý.

**Nhưng tôi không có quyền để tự làm.** Tôi đã kiểm tra hết các đường:

| Đường tôi thử | Kết quả |
|---|---|
| Khoá API Neon trong dự án | ❌ Không có |
| Công cụ dòng lệnh `neonctl` | ❌ Chưa cài |
| Tạo nhánh qua Vercel | ❌ Vercel không quản lý nhánh Neon |

**Tôi cố tình KHÔNG tự cài `neonctl` rồi đăng nhập** — đăng nhập vào tài khoản hạ tầng của anh là việc anh phải tự làm, không phải việc tôi làm thay.

### 👉 Việc cần anh làm — mất khoảng 3 phút

1. Mở **console.neon.tech** → chọn dự án đang chạy HustlyTasker
2. Bấm **Branches** → **New Branch**
3. Đặt tên, ví dụ `audit-2026-07`. Chọn tạo **từ nhánh production** (để có đúng cấu trúc dữ liệu)
4. Vào nhánh vừa tạo → **Connection string** → sao chép
5. Gửi lại cho tôi

**Về chi phí:** Neon tính tiền theo dung lượng lưu trữ và thời gian máy chạy. Một nhánh dùng vài ngày rồi xoá thường nằm trong hạn mức miễn phí, nhưng **tôi không thể nhìn thấy gói cước của anh nên không dám khẳng định**. Nếu anh muốn chắc chắn không tốn đồng nào, hãy xoá nhánh này ngay sau khi tôi báo kiểm toán xong.

### ⚠️ Một lưu ý quan trọng về dữ liệu

Nhánh Neon tạo ra sẽ là **bản sao của dữ liệu thật**, tức là **chứa dữ liệu khách hàng thật**.
Quy tắc anh đặt ra là *"không sao chép dữ liệu cá nhân hoặc nhạy cảm từ production"*.

Có hai cách, tôi cần anh chọn khi gửi chuỗi kết nối:

| Cách | Ưu | Nhược |
|---|---|---|
| **C1 — Nhánh sao chép, tôi xoá sạch dữ liệu rồi tự tạo dữ liệu giả** | Đúng quy tắc anh đặt ra; không có dữ liệu khách thật | Mất dữ liệu "hình thù thật" (tên dài, khối lượng lớn, trạng thái lạ) — đúng những thứ hay lòi ra lỗi |
| **C2 — Nhánh sao chép, giữ nguyên dữ liệu thật, tôi thao tác thoải mái trên đó** | Phát hiện được lỗi trên dữ liệu hình thù thật, giống hệt cái bẫy "thư mục ForTesting" | Dữ liệu khách thật nằm trên một nhánh nữa (dù đã cô lập, không ai ngoài anh truy cập được) |

---

## PHẦN D — Phần tôi VẪN chạy được trong lúc chờ

Không phải chờ không. Những việc sau **không cần chạy ứng dụng** và tôi làm ngay:

| Việc | Bằng chứng thu được |
|---|---|
| Kiểm kê module, màn hình, route | ✅ Chắc chắn — đọc trực tiếp cấu trúc |
| Bản đồ vai trò & phân quyền **theo mã nguồn** | ✅ Chắc chắn — Codex đã lấy xong (xem dưới) |
| Bản đồ trạng thái nghiệp vụ của task | ✅ Chắc chắn |
| Kiến trúc thông tin, cách đặt tên, điều hướng | ✅ Chắc chắn |
| Nghiên cứu độc lập Notion / ClickUp / Frame.io | ✅ Không liên quan hệ thống |

**Và những việc tôi TUYỆT ĐỐI không kết luận khi chưa có môi trường:**

| Việc | Vì sao phải chờ |
|---|---|
| Đo pixel, kích thước nút, tương phản màu | Phải đo trên trình duyệt thật, không được ước lượng |
| Responsive trên máy tính / máy tính bảng / điện thoại | Nt |
| Trạng thái rỗng, đang tải, lỗi, mất mạng | Phải chạy thật mới thấy |
| **Quyền hiển thị có khớp quyền thật không** | Đây là mục dễ sai nhất, và là mục quan trọng nhất với SaaS |
| Bàn phím, trình đọc màn hình | Phải chạy thật |

---

## PHẦN E — Vai trò trong hệ thống (từ mã nguồn)

Codex lấy, tôi giữ nguyên trích dẫn. Hệ thống có **ba tầng vai trò khác nhau** — đây là điều tôi dự đoán sẽ là nguồn gây nhầm lẫn lớn:

| Tầng | Các giá trị | Định nghĩa ở đâu |
|---|---|---|
| **Tài khoản** | `ADMIN`, `USER`, `AGENCY_ADMIN`, `CLIENT`, `LOCKED` | `prisma/schema.prisma:125-152` |
| **Tổ chức (Profile)** | `OWNER`, `ADMIN`, `USER`, `CLIENT` | `prisma/schema.prisma:266-278` |
| **Workspace (tháng)** | `OWNER`, `ADMIN`, `MEMBER`, `GUEST` | `src/lib/workspace-roles.ts:1-12` |

Cộng thêm một tầng thứ tư rút gọn chỉ dùng cho máy trạng thái task: `USER | ADMIN` (`src/lib/task-state-machine.ts:71-77`).

⚠️ **Quan sát cần kiểm chứng khi có môi trường:** một người có thể mang **ba vai trò khác tên nhau cùng lúc** ở ba tầng. Ví dụ `USER` ở tầng tài khoản nhưng `ADMIN` ở tầng tổ chức. Tôi chưa kết luận đây là vấn đề — cần chạy thật mới biết người dùng có bị rối không.

---

## PHẦN F — Những "công tắc" thay đổi giao diện

Hệ thống **không có** hệ thống bật/tắt tính năng tập trung. Chỉ có các công tắc rời:

| Công tắc | Tác dụng |
|---|---|
| `view-mode=mobile\|desktop` | Ép giao diện điện thoại hoặc máy tính, bỏ qua nhận diện thiết bị. **Rất hữu ích cho việc kiểm thử responsive của tôi.** |
| `ui-pref=mc` | Vào `/admin` trên máy tính thì tự nhảy sang Mission Control. **Tôi phải tránh bật cái này.** |
| Khoá VAPID | Thiếu khoá → nút bật thông báo đẩy **biến mất hoàn toàn** |
| Khoá Supabase | Thiếu khoá → ứng dụng vẫn chạy nhưng **mất cập nhật thời gian thực** |

⚠️ **Ảnh hưởng tới độ tương đồng môi trường:** hai công tắc cuối nghĩa là nếu môi trường thử nghiệm của tôi thiếu khoá, **giao diện sẽ khác thật** — mất nút thông báo, mất cập nhật tức thì. Tôi sẽ ghi rõ trong Báo cáo tương đồng nếu điều đó xảy ra.

---

## PHẦN G — Danh sách giới hạn không mô phỏng được

Ghi trước để không ai hiểu nhầm là đã kiểm:

| Giới hạn | Xử lý |
|---|---|
| **Gửi email thật** (Resend) | Sẽ chặn. Chỉ kiểm tra nội dung email được tạo ra, không gửi đi. |
| **Xử lý video thật** (Mux) | Tốn tiền theo phút. Sẽ dùng video ngắn hoặc bỏ qua, ghi rõ. |
| **Thanh toán** | Không tồn tại trong hệ thống → không có gì để kiểm. |
| **Hành vi thật của Vercel** (giới hạn thời gian chạy, chống bot) | Không tái tạo được trên máy. Ghi là **UNKNOWN**. |
| **Tốc độ thật với dữ liệu lớn** | Nhánh Neon thử nghiệm có thể nhanh/chậm khác thật. |

---

## Tóm tắt trạng thái cổng chất lượng

| Cổng | Kết quả |
|---|---|
| **G0_VISION** — hiểu và truyền đạt định hướng | ✅ **ĐẠT** — brief đã lập, anh đã gỡ mâu thuẫn định vị, đã có bản chuẩn giao Codex |
| **G1_ENVIRONMENT** — có môi trường an toàn + báo cáo tương đồng | ✅ **ĐẠT** — xem Phần H bên dưới |
| **G9_NO_PREMATURE_IMPLEMENTATION** — chưa sửa gì | ✅ **ĐẠT** — không một dòng mã, cấu hình hay dữ liệu nào bị chạm |

---

## PHẦN H — Kết quả dựng môi trường (2026-07-28)

Chủ sản phẩm tạo nhánh `audit-2026-07` (mã máy chủ `ep-round-lab-ahzs61vb`) và chọn **phương án C2**:
giữ nguyên dữ liệu thật trên nhánh cô lập.

### H1. Đo tương đồng — `scripts/audit-2026-07/probe-parity.ts` (chỉ đọc)

| Hạng mục | Production | Thử nghiệm | Kết quả |
|---|---:|---:|---|
| Số bảng dữ liệu | 67 | 67 | ✅ |
| Số cột dữ liệu | 800 | 800 | ✅ trùng khớp từng cột, không lệch kiểu |
| Task | 1 263 | 1 263 | ✅ |
| ReviewAsset / ReviewVersion | 205 / 254 | 205 / 254 | ✅ |
| Client / Invoice | 292 / 94 | 292 / 94 | ✅ |
| AuditLog | 3 167 | 3 167 | ✅ |
| **Tổng số dòng toàn hệ** | **21 018** | **21 017** | ⚠️ lệch **1 dòng** |

**Về 1 dòng lệch:** nằm ngoài 14 bảng theo dõi chính, gần như chắc chắn là một dòng nhật ký hoặc phiên
đăng nhập sinh ra trên production **sau** thời điểm tạo nhánh. Tôi ghi ra thay vì làm tròn thành
"khớp hoàn toàn" — nhưng nó không ảnh hưởng kết luận nào.

➡️ **Kết luận: nhánh thử nghiệm là bản sao trung thực của production.** Đủ điều kiện làm nền kiểm toán.

### H2. 🔴 Suýt kiểm toán nhầm trên PRODUCTION — sự cố thật, đã chặn kịp

Lần khởi động máy chủ đầu tiên, tôi tạo file `.env.local` trỏ nhánh thử nghiệm rồi chạy.
Nhật ký khởi động in ra:

```
- Environments: .env
```

**Thiếu `.env.local`.** Nghĩa là máy chủ đang chạy trên **database THẬT**. Tôi tắt ngay lập tức.

**Nguyên nhân:** máy chủ được khởi động từ một thư mục gốc khác (dự án có nhiều bản sao mã nguồn
song song, mỗi bản có `package-lock.json` riêng; Next.js chọn thư mục gốc suy diễn). Thư mục đó có
`.env` (production) nhưng không có `.env.local` của tôi.

**Kiểm chứng:** tôi hỏi thẳng bộ nạp env của chính Next.js với thư mục đúng — nó trả về
`['.env.local', '.env']` và `DATABASE_URL → ep-round-lab`. Vậy file tôi tạo không sai; chỗ khởi động mới sai.

**Cách khắc phục đã áp dụng:** truyền `DATABASE_URL` **thẳng vào biến môi trường của tiến trình**
khi khởi động. Biến môi trường tiến trình thắng mọi file `.env`, nên không còn phụ thuộc vào việc
Next.js đoán thư mục gốc nào. Nhật ký sau khi sửa: `- Environments: .env.local, .env` ✅

**Thiệt hại:** không. Trong khoảng thời gian chạy nhầm chỉ có các yêu cầu **đọc** (`GET /`,
`GET /api/auth/role` trả 401). Không câu lệnh ghi nào được phát ra.

**Bài học ghi lại cho các đợt sau:** trong dự án này, **luôn kiểm dòng `Environments:` trong nhật ký
khởi động** trước khi tin rằng mình đang ở môi trường thử nghiệm.

### H3. Xác nhận ứng dụng chạy

- Máy chủ: `http://localhost:3000` · Next.js 16.1.6 · sẵn sàng sau 2 giây
- Trang đăng nhập hiển thị đúng: ô email, ô mật khẩu, nút hiện mật khẩu, ghi nhớ đăng nhập,
  quên mật khẩu, **"Tiếp tục với Google"**, đăng ký
- ⚠️ Có cảnh báo của Next.js: `The "middleware" file convention is deprecated. Please use "proxy" instead.`
  → ghi nhận là món nợ kỹ thuật, chưa xếp hạng, sẽ đưa vào báo cáo chính.
