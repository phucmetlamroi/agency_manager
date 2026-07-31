# Phase 4 — Báo cáo chuyên sâu: Tệp (module Review)

> **Ngày:** 2026-07-28 · **Môi trường:** nhánh thử nghiệm, dữ liệu thật, ứng dụng chạy thật
> **Đây là hạng mục anh chọn ưu tiên cải thiện đầu tiên** — nhưng chỉ sau khi đặc tả được duyệt.

---

## 1. Module này thật sự làm gì

**Tệp là nơi video bàn giao của task sống, và là nơi vòng duyệt với khách diễn ra.** Nó thay thế
việc agency phải dùng Frame.io.

**Đối tượng trung tâm là VIDEO (`ReviewAsset`), không phải thư mục.** Bằng chứng từ cấu trúc dữ liệu:
một video là một **chồng phiên bản** (`ReviewAsset` → nhiều `ReviewVersion`), có con trỏ
`currentVersionId` chỉ tới phiên bản mới nhất. Thư mục chỉ là chỗ chứa. Bình luận, link chia sẻ,
đăng ký nhận thông báo của khách — tất cả đều gắn vào video hoặc phiên bản, không gắn vào thư mục.

---

## 2. Hình thù thật của Tệp trên dữ liệu agency thật

Đây là phần không thể suy ra từ bản thiết kế — phải đo trên dữ liệu thật.

| Hạng mục | Số lượng |
|---|---:|
| Thư mục đang sống | 46 |
| **Video đang sống** | **132** |
| **Video trong thùng rác** | **73** |
| Phiên bản video | 254 |
| Bình luận review | 204 |
| **Link chia sẻ cho khách** | **113** (95 còn hiệu lực · 18 đã thu hồi) |

### 2.1 Cây thư mục: khách hàng trước, 4 cấp

| Cấp | Số thư mục | Là gì (quan sát từ tên) |
|---|---:|---|
| 0 | 5 | Gốc theo tháng — *"Tháng 7/2026"* |
| 1 | 25 | **Tên khách hàng** — Archie · Jacob · Jayden · Kate · MotoHalo… |
| 2 | 11 | Dự án / thương hiệu con — *"Didcot dental"*, *"Mayland Dental"* |
| 3 | 5 | Công đoạn — ***"Color Grade"*** |

**Thư mục dày nhất:** *"Color Grade"* — **27 video** trong một thư mục, ở **cấp 3** (bốn lần bấm mới tới).

---

## 3. 🔑 Ba con số làm thay đổi thứ tự ưu tiên

Đây là phần tôi cho là giá trị nhất của Phase 4: dữ liệu thật nói khác với trực giác.

### T-01 · **85% video KHÔNG có trạng thái**

| Trạng thái | Số video |
|---|---:|
| **(chưa đặt)** | **112** |
| Hoàn tất | 11 |
| Revision | 9 |

Ô trạng thái trên thẻ video gần như **không ai dùng**. Trước khi đầu tư thiết kế lại nó, cần trả lời:
người dùng không thấy nó, không hiểu nó, hay không cần nó? ➜ **Câu hỏi cho phần đặc tả.**

### T-02 · **71% video chỉ có ĐÚNG MỘT phiên bản**

| Số phiên bản | Số video |
|---|---:|
| **1** | **94** |
| 2 | 26 |
| 3 | 6 |
| 4–5 | 5 |
| 8 | 1 |

Toàn bộ bộ máy chồng phiên bản (badge v2/v3, chọn phiên bản, so sánh hai bản) phục vụ **29% số video**;
chồng sâu từ 3 bản trở lên chỉ **9%**. Không có nghĩa là bỏ đi — nhưng nó **không nên chiếm chỗ đẹp nhất
trên màn hình** nếu 71% trường hợp không cần tới.

### T-03 · **Cứ 10 video thì gần 4 nằm trong thùng rác**

73 trong thùng rác so với 132 đang sống — **36% tổng số video đã bị xoá**. Thùng rác **không phải góc phụ**,
nó là một bề mặt lớn mà người dùng ra vào thường xuyên.

Điều này làm phát hiện từ đợt kiểm toán trước nghiêm trọng hơn hẳn: thư mục *"ForTesting"* hiện
**`0 mục / −10.831.263 byte`** trong khi thật sự giữ **5 video sống / 136 MB**. Một dòng đếm âm, trong
một màn hình mà người dùng dùng nhiều, ngay cạnh nút "Xóa vĩnh viễn".

---

## 4. Ai thấy gì — mô hình phân quyền thật

**Tệp KHÔNG phân quyền theo vai trò đơn thuần.** Nó dùng **phạm vi theo task được giao**
(`src/lib/review/folder-scope.ts:30-54`):

```
Nếu là admin        → thấy toàn bộ workspace
Nếu KHÔNG phải admin → chỉ thấy thư mục của những task mà assigneeId = chính mình
                       (+ video của các task đó, + thư mục do mình tạo)
```

Đo runtime trên workspace July/2026 (25 thư mục, 170 video), cùng một địa chỉ:

| Màn | Chủ tổ chức | Quản trị | Nhân sự (0 task được giao) |
|---|---:|---:|---:|
| Gốc Tệp | 444 ký tự · 20 nút | 444 · 20 | **405 · 4** |
| Thư mục 27 video | 530 · 22 | 530 · 22 | **405 · 4** — *y hệt màn gốc* |
| Thư mục cấp 3 | 658 · 24 | 658 · 24 | 504 · 6 |
| Một video cụ thể | 161 · 8 · có trình phát | 161 · 8 | **66 ký tự · 1 nút · không tiêu đề** |

> **📌 Tôi suýt báo sai chỗ này.** Nhìn bảng trên, kết luận tự nhiên là *"nhân sự bị chặn oan khỏi Tệp
> trong chính workspace của mình"*. Tôi đã kiểm hai bước trước khi kết luận: (1) xác nhận thư mục
> *"Color Grade"* **đúng là thuộc July/2026** — nơi tài khoản nhân sự là thành viên hợp lệ; (2) đọc
> `folder-scope.ts`. Kết quả: **đây là thiết kế đúng, không phải lỗi.** Nhân sự chỉ thấy task được giao,
> và tài khoản kiểm toán của tôi được giao **0 task**.

### ➜ T-04 · `S2_MAJOR` — Nhưng màn hình trống thì không nói gì cả

Phân quyền đúng, **cách báo cho người dùng thì sai**:

**Người dùng đang thấy gì.** Một editor mới vào công ty, chưa được giao task nào, bấm **"Tệp"** trên
thanh bên. Màn hình hiện ra **trống trơn** — không video, không thư mục, và **không một câu nào giải thích**.
Không có *"Bạn chưa được giao task nào"*, không có *"Video sẽ hiện ở đây khi bạn nhận task"*.

Tệ hơn: nếu ai đó **gửi link một video** cho họ, họ mở ra và nhận **66 ký tự — một trang trắng**, không
tiêu đề, không thông báo, không nút quay lại.

**Vì sao đây là vấn đề.** Người dùng không có cách nào biết mình đang gặp **quyền hạn** hay **lỗi phần mềm**.
Họ sẽ hỏi quản lý, hoặc tệ hơn — kết luận sản phẩm hỏng. Đây cũng chính là hình ảnh đầu tiên một
editor mới thấy về module quan trọng nhất của sản phẩm.

**Hướng xử lý.** Trạng thái rỗng phải nói đúng nguyên nhân và bước tiếp theo. Trang video không có quyền
phải nói *"Video này thuộc task chưa giao cho bạn"* kèm nút quay về. **Chưa làm.**

---

## 5. ✅ Những gì module này làm tốt — đo được

| Kiểm tra | Kết quả |
|---|---|
| Tràn ngang ở mọi độ sâu thư mục | **Không** — kể cả thư mục 27 video ở cấp 3 |
| Đường dẫn phân cấp (breadcrumb) ở cấp sâu nhất | **Giữ nguyên, không vỡ** |
| Video có phiên bản xử lý **HỎNG** (2 bản trong dữ liệu) | **Không làm hỏng trang** — trình phát vẫn chạy bản mới nhất (v4), đủ nút Tải xuống / Bình luận / Thông tin |
| Địa chỉ thư mục không tồn tại | **Trả 200 và giữ người dùng trong ứng dụng** — tốt hơn hẳn phần còn lại của hệ thống, vốn văng ra trang 404 tiếng Anh trắng trơn (xem F-14) |

➜ Điểm cuối đáng chú ý: **cách xử lý địa chỉ hỏng ĐÚNG đã tồn tại sẵn — ở chính module Tệp.** Phần còn
lại của sản phẩm chỉ cần học theo.

---

## 6. Rủi ro khi ưu tiên triển khai Tệp đầu tiên

| Rủi ro | Mức | Vì sao |
|---|---|---|
| **95 link chia sẻ đang còn hiệu lực** | Cao | Mọi thay đổi ở tầng chia sẻ đều chạm tới bề mặt khách hàng **đang dùng**. Không phải màn nội bộ. |
| **73 mục trong thùng rác + bộ đếm sai** | Cao | Sửa giao diện thùng rác mà không sửa bộ đếm trước là xây trên nền hỏng. |
| **Phạm vi theo task được giao** | Trung bình | Mọi thay đổi hiển thị phải kiểm lại với editor **có** task và **không có** task — hai thế giới khác nhau. |
| 36% video đã xoá | Trung bình | Thay đổi luồng xoá/khôi phục chạm vào lượng dữ liệu lớn. |

---

## 7. Chưa kiểm chứng — ghi rõ để không ai hiểu nhầm

- **Luồng upload thật** (kéo thả file, chờ xử lý, lên phiên bản mới): chưa chạy — cần ghi dữ liệu và
  tốn phí xử lý video.
- **Trang khách xem `/r/[slug]`**: chưa mở bằng token thật.
- **Bình luận theo mốc thời gian, vẽ chú thích, so sánh phiên bản**: chưa thao tác.
- **Nhân sự CÓ task được giao**: chưa dựng — bảng ở mục 4 chỉ phản ánh trường hợp **0 task**.
- Codex đã chạy nhánh phân tích kỹ thuật độc lập cho module này; phần đối chiếu chéo sẽ đưa vào
  báo cáo nghiên cứu ở Phase 6.
