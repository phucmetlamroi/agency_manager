# Đặc tả cải thiện TO_BE — HustlyTasker

> **Ngày:** 2026-07-28 · **Trạng thái:** ⏸️ **CHỜ DUYỆT — chưa được phép triển khai**
> Mọi mục ở đây đều đã qua **11 vòng phản biện** ([07-CRITIQUE](07-CRITIQUE.md)).
> Mục nào phụ thuộc câu trả lời của anh đều được đánh dấu ❓ và **không có đặc tả chi tiết** cho tới khi anh trả lời.

---

## 1. Mục tiêu trải nghiệm

Ba mục tiêu, xếp theo thứ tự. Khi hai mục tiêu xung đột, mục trên thắng.

| # | Mục tiêu | Đo bằng gì |
|---|---|---|
| **1** | **Hệ thống không bao giờ im lặng.** Mọi thao tác đều có phản hồi — kể cả khi thất bại. | 0 thao tác không phản hồi trong 4 giây |
| **2** | **Người dùng luôn biết mình đang ở đâu và làm được gì.** | 0 mục điều hướng dẫn tới ngõ cụt không giải thích |
| **3** | **Khách hàng chỉ thấy đúng thứ agency muốn cho thấy.** | 0 nội dung đã gỡ còn lộ qua link chia sẻ |

---

## 2. Nguyên tắc thiết kế của sản phẩm

Rút ra từ chính sản phẩm, không áp từ ngoài vào.

1. **Chuyên sâu, không phình to.** Dự án đã từng dựng chat đầy đủ rồi gỡ sạch. Mọi đề xuất thêm tính năng
   phải qua câu hỏi: *thứ này có phục vụ quy trình dựng video không?*
2. **Trạng thái hiếm không được chiếm chỗ đẹp.** 71% video chỉ có 1 phiên bản → giao diện phiên bản
   không được nằm ở vị trí chính.
3. **Cấm im lặng.** Thành công, thất bại, không có quyền, không có dữ liệu — mỗi loại một câu riêng.
4. **Cách làm đúng đã có sẵn thì nhân rộng, đừng phát minh.** Module Tệp đã xử lý địa chỉ hỏng đúng cách.
5. **Việt Nam trước.** Nhưng đánh dấu rõ chỗ nào sẽ phải làm lại khi ra quốc tế.

---

## 3. Kiến trúc thông tin — **GIỮ NGUYÊN**

Đây là kết luận có chủ đích: **không đề xuất thay đổi cấu trúc.**

```
Tổ chức → Workspace (= tháng) → Task
                              → Tệp: Tháng → Khách hàng → Dự án → Công đoạn
```

**Vì sao không đổi:** cây 4 cấp theo khách hàng **khớp với cách agency thật đang làm việc** (đo trên dữ
liệu thật: 25 thư mục cấp khách hàng, tên là Archie · Jacob · Jayden · Kate…). Notion cho tự do hơn,
nhưng tự do hơn = mỗi agency tự bịa một cách sắp xếp, mất luôn tính chuyên biệt — thứ duy nhất khiến sản
phẩm này khác Asana.

⚠️ **Rủi ro đã ghi nhận:** "workspace = tháng" là khái niệm khó với người mới. **Không sửa ở giai đoạn
này** — nhưng phải giải thích trong onboarding khi tới giai đoạn đó.

---

## 4. Điều hướng ❓ **CHỜ Q1**

Nguyên tắc đã chốt qua phản biện: **chia mục theo tiêu chí "có thể được cấp quyền không"**.

| Nhóm | Cách hiển thị |
|---|---|
| Dùng được | Bình thường |
| **Có thể được cấp quyền** | Hiện · làm mờ · biểu tượng khoá · chú giải **"Cần quyền quản trị — liên hệ [tên chủ workspace]"** |
| **Không bao giờ được cấp** | **Ẩn hẳn** |

❌ **Không đặc tả chi tiết được** cho tới khi anh trả lời Q1: mục nào thuộc nhóm nào.

🔻 **Đã loại khỏi phạm vi MVP:** nút "Xin quyền" chính thức. Lý do từ vòng phản biện: agency 5 người ngồi
cùng phòng sẽ **hỏi miệng**, không bấm nút — nguy cơ lặp lại đúng vết xe trường trạng thái 85% bỏ trống.
Làm lại khi có khách trên 15 người.

---

## 5. Đặc tả từng luồng

### 5.1 · Luồng "thao tác thất bại" — áp dụng cho MỌI nút gọi máy chủ

```
Bấm nút
  ├─ 0–100ms   → nút đổi trạng thái ngay (đè xuống / mờ đi)     [bắt buộc]
  ├─ >400ms    → hiện chỉ báo đang chờ trên chính mục đó         [bắt buộc]
  ├─ Thành công → cập nhật + xác nhận ngắn
  ├─ Thất bại  → HOÀN NGUYÊN về giá trị máy chủ
  │              + câu tiếng Việt CẠNH nút (không phải góc màn hình)
  │              + nút "Thử lại"
  │              + GIỮ NGUYÊN nội dung người dùng đã nhập        [bắt buộc]
  └─ Mất mạng  → cùng nhánh thất bại, câu: "Mất kết nối. Thay đổi chưa được lưu."
```

**Ngoại lệ bắt buộc:** thao tác **phá huỷ** (xoá, xoá vĩnh viễn, thu hồi link) **không được dùng phản hồi
lạc quan**. Phải chờ máy chủ xác nhận rồi mới đổi giao diện.

### 5.2 · Luồng "không tìm thấy trang"

Giữ nguyên vỏ ứng dụng (thanh bên, logo, tài khoản). Tiếng Việt. Ngôn ngữ trang khai báo `lang="vi"`.
Ba nút: **Quay lại** · **Về trang chủ** · **Tìm kiếm**.

⚠️ **Không tiết lộ** tài nguyên có tồn tại hay không — cùng một câu cho "không tồn tại" và "không có quyền".

### 5.3 · Luồng Tệp: video một phiên bản ❓ *(ưu tiên đầu tiên của anh)*

| Số phiên bản | Giao diện |
|---|---|
| **1** *(71% số video)* | **Như một video bình thường.** Không badge, không thanh phiên bản, không nút chọn phiên bản. |
| **≥2** *(29%)* | Hiện số hiệu phiên bản ở đầu · mở **bản mới nhất** mặc định · bản cũ nằm sau nút chọn |
| So sánh | Chỉ **hai** bản được chọn, không bày hết |

**Bằng chứng:** đo trên dữ liệu thật của anh (94/132 video có đúng 1 bản) **và** tài liệu Frame.io V4
(chồng phiên bản chỉ tạo ra từ bản thứ 2). Hai đường độc lập, một kết luận. **Đây là mục chắc chắn nhất
của cả đặc tả.**

---

## 6. Vai trò & quyền — **GIỮ NGUYÊN mô hình, SỬA cách báo**

**Không đổi** mô hình phạm-vi-theo-task. Nó chặt và đang chạy tốt cho agency 3–10 người.

**Sửa 2 chỗ:**

| Chỗ | Hiện tại | TO_BE |
|---|---|---|
| Tệp khi editor chưa có task | Màn hình trống, không chữ | *"Bạn chưa được giao task nào. Video sẽ hiện ở đây khi bạn nhận task."* |
| Mở link video ngoài phạm vi | Trang trắng 66 ký tự | Câu giải thích **không tiết lộ** video có tồn tại hay không + nút quay lại |

⚠️ **Rủi ro mở rộng đã ghi nhận** (Codex, dẫn NIST): quản trị quyền theo từng người tốn kém và dễ sai khi
đội lớn. **Không phải lỗi hiện tại.** Xem lại khi có khách trên 30 người.

---

## 7. Logic & chuyển trạng thái — **KHÔNG ĐỀ XUẤT THAY ĐỔI**

Máy trạng thái task và vòng duyệt khách **không nằm trong phạm vi đề xuất**. Lý do: nó chạm trực tiếp
tới tính lương và hoá đơn. Đợt kiểm toán này **không đủ bằng chứng runtime** về luồng đó (chưa chạy được
luồng upload và luồng khách duyệt thật).

**Riêng 3 mục sửa bắt buộc, không đổi logic:**

| Mã | Sửa gì | Vì sao |
|---|---|---|
| S1-3 | Mở rộng link chia sẻ phải kiểm **chuỗi tổ tiên còn sống** | Nội dung đã gỡ vẫn lộ cho khách |
| S1-4 | Tải lên phải kiểm **chủ sở hữu phiên**, không chỉ thành viên workspace | Vòng qua phạm vi task |
| S1-2 | Tách lệnh sửa cấu trúc database khỏi đường build | Đã gây sập 15 phút |

---

## 8. Hệ thống phân cấp nút — **GIỮ NGUYÊN**

Đo được **0 trường hợp** cùng nhãn nút mà kích thước khác nhau. Hệ thống thiết kế đang được tuân thủ
nghiêm túc. **Không đề xuất thay đổi cấp bậc nút.**

**Chỉ sửa kích thước tối thiểu:**

| Hiện tại | TO_BE | Ở đâu |
|---|---|---|
| 20px | **≥24px** | Nút "Thu gọn" / "Mở rộng" — **trong module Tệp** |
| 21px | **≥24px** | Ô nhập "Tìm task…" |
| 61 thành phần dưới 24px | **≥24px** | Toàn hệ thống |

---

## 9. Component & trạng thái — bốn trạng thái rỗng

Đây là nguyên tắc sửa được **cả S2-4 lẫn S2-6** bằng một lần làm.

| Loại | Khi nào | Câu mẫu | Lối thoát |
|---|---|---|---|
| **Chưa có dữ liệu** | Thật sự chưa có gì | *"Chưa có task nào. Task sẽ hiện ở đây khi được tạo."* | Nút tạo (nếu có quyền) |
| **Lọc không ra** | Có dữ liệu, bộ lọc giấu | *"Không tìm thấy task nào khớp «…»"* | **Nút xoá bộ lọc** |
| **Không có quyền / ngoài phạm vi** | Quyền chặn | Câu **không tiết lộ** tài nguyên tồn tại | Nút quay lại |
| **Tải thất bại** | Gọi máy chủ lỗi | *"Không tải được dữ liệu."* | **Nút thử lại** |

❌ **Cấm** dùng chung một câu cho nhiều loại — đây chính là lỗi S2-6 hiện tại.

---

## 10. Máy tính / máy tính bảng / điện thoại ❓ **CHỜ Q4**

**Giai đoạn MVP: giữ nguyên cơ chế hiện tại.**

Quyết định này **đi ngược kết luận nghiên cứu**, và tôi ghi rõ lý do: Codex đúng về nguyên tắc (đoán thiết
bị ở phía máy chủ là sai; phải theo cửa sổ thật). Nhưng cơ chế đó nằm **cùng file với cổng xác thực** —
sửa nó là chạm vào lớp chặn đăng nhập của toàn hệ thống. **Rủi ro cao hơn lợi ích ở giai đoạn này.**

📌 **Ghi vào nợ kỹ thuật phải trả trước khi ra quốc tế** — máy tính bảng dùng nhiều hơn ở thị trường ngoài.

❌ Phần "16 hành động bị lược bỏ trên điện thoại" **không đặc tả được** cho tới khi anh trả lời Q4.

---

## 11. Câu chữ & nhãn

| Nguyên tắc | Ví dụ sai (hiện tại) | Đúng |
|---|---|---|
| Nói **nguyên nhân**, không nói hiện tượng | *"Chưa có task nào ở đây"* (khi đang lọc) | *"Không tìm thấy task nào khớp «abc»"* |
| Luôn có **bước tiếp theo** | *(không có gì)* | *"…— Xoá bộ lọc"* |
| Nói **ai gỡ được** cho người dùng | *(đá về im lặng)* | *"Cần quyền quản trị — liên hệ Bảo Phúc"* |
| **Tiếng Việt** ở mọi màn người Việt thấy | *"404 This page could not be found."* | *"Không tìm thấy trang này."* |
| **Không tiết lộ** tài nguyên tồn tại | *"Video này thuộc task chưa giao cho bạn"* | *"Bạn không có quyền xem nội dung này."* |

---

## 12. Trợ năng

| Mục | Hiện trạng | TO_BE |
|---|---|---|
| Viền focus bàn phím | ✅ **0/45 điểm dừng thiếu** | Giữ nguyên |
| Đi bằng Tab | ✅ 32/35 thành phần | Kiểm 3 thành phần còn lại |
| **Thông báo động** | ❌ Mất mạng = im lặng | **Bắt buộc** — có thể đang sai chuẩn WCAG 4.1.3 |
| Tương phản | 🟡 16% dưới chuẩn, tệ nhất 4,12:1 (cần 4,5:1) | Nâng màu xám một bậc → sửa cả nhóm |
| Vùng bấm | 🟡 61 thành phần dưới 24px | ≥24px |
| Ngôn ngữ trang | ❌ Trang 404 tiếng Anh | `lang="vi"` |

---

## 13. Tiêu chí nghiệm thu

Mỗi mục phải **đo được**, không phải "trông đẹp hơn".

| Mã | Tiêu chí nghiệm thu |
|---|---|
| S1-1 | Mở 2 trình duyệt, A đổi trạng thái task → B thấy **trong 3 giây, không F5**. Nhật ký trình duyệt **0 lỗi chặn kết nối**. |
| S1-2 | Chạy cài đặt dự án trên bản xem thử → cấu trúc database thật **không đổi** (so trước/sau). |
| S1-3 | Vứt thư mục cha vào thùng rác → mở link khách → **video con KHÔNG còn hiện**. |
| S1-4 | Editor A lấy mã phiên upload của editor B ngoài phạm vi → máy chủ trả **403**. |
| S2-1 | Editor bấm mọi mục thanh bên → **0 lần bị ném về không giải thích**. |
| S2-2 | Ngắt mạng, bấm nút → **trong 4 giây** có câu tiếng Việt + nút thử lại. |
| S2-3 | Gõ địa chỉ sai → giữ vỏ ứng dụng, tiếng Việt, có nút quay lại. |
| S2-4 | Editor 0 task mở Tệp → có câu giải thích, **không phải màn trống**. |
| S2-6 | Lọc không ra → câu khác hẳn câu "chưa có dữ liệu" + nút xoá bộ lọc. |
| 5.3 | Video 1 phiên bản → **0 phần tử giao diện phiên bản** trên màn hình. |
| §8 | **0 thành phần** vùng bấm dưới 24px. |
| §12 | **0 nhãn** tương phản dưới 4,5:1 (chữ thường). |

---

## 14. Chỉ số thành công

| Chỉ số | Cách đo | Vì sao chọn |
|---|---|---|
| Số lần bị ném về/người/tuần | Nhật ký hoạt động | Đo trực tiếp S2-1 |
| Tỉ lệ video có ≥1 bình luận | Truy vấn dữ liệu | Cộng tác có thật sự diễn ra không |
| Tỉ lệ trường trạng thái được điền | Hiện **15%** | ❓ chỉ có nghĩa **sau khi** trả lời Q2 |
| Thời gian từ upload → khách duyệt | Nhật ký task | Đo giá trị cốt lõi của Tệp |

⚠️ **Chưa đo được cái nào trong số này** — hệ thống hiện không ghi lại các sự kiện đó. **Việc dựng đo đạc
là một hạng mục riêng**, không nằm trong đặc tả này.

---

## 15. Đánh đổi & rủi ro

| Quyết định | Được | Mất | Rủi ro |
|---|---|---|---|
| Giữ nguyên kiến trúc thông tin | Không phá thứ đang chạy | Không gỡ được khó khăn "workspace = tháng" | Người mới vẫn khó hiểu |
| Giữ cơ chế nhận diện thiết bị | Không chạm cổng xác thực | Trái nguyên tắc chuẩn | Nợ kỹ thuật khi ra quốc tế |
| Bỏ nút "Xin quyền" khỏi MVP | Không xây thứ có thể không ai dùng | Đội lớn thiếu đường chính thức | Phải làm lại khi có khách >15 người |
| **Sửa rò link chia sẻ** | Đóng lỗ lộ dữ liệu khách | **95 link đổi nội dung ngay** | 🔴 **Khách đang xem có thể thấy video biến mất** |
| Không đụng máy trạng thái task | Không chạm lương/hoá đơn | Bỏ qua một vùng lớn | Có thể còn lỗi chưa phát hiện ở đó |

---

## 16. Câu hỏi còn mở

Sáu câu ở [mục 13 của báo cáo chính](08-BAO-CAO-CHINH.md#13-sáu-quyết-định-cần-anh-đưa-ra), cộng thêm:

- **Q7** · Có cần dựng đo đạc (§14) không? Hiện **không đo được** hiệu quả của bất kỳ cải thiện nào.
- **Q8** · Phát hiện R-15 (cờ khoá khôi phục) — anh có muốn tôi **chạy thử dứt điểm** trên nhánh thử
  nghiệm để kết luận không? Cần khoảng 15 phút.

---

## 17. Nhật ký quyết định — truy nguyên từng đề xuất

| Đề xuất | Bắt nguồn từ | Bằng chứng | Phản biện đã đổi gì |
|---|---|---|---|
| S1-1 CSP | Nhật ký trình duyệt, 4 vai trò | `next.config.ts:92-93` | Không đổi — rủi ro thấp nhất |
| S1-2 `db push` | Codex nêu → tôi xác minh | `package.json` + sự cố đã ghi | Không đổi |
| S1-3 rò link | Codex nêu → tôi đọc mã xác minh | `share-guest.ts:103-126` | **Thêm điều kiện: đếm trước, báo khách trước** |
| S1-4 quyền upload | Codex nêu → tôi đọc mã xác minh | `upload-service.ts:493-504` | **Nâng mức** vì phá vỡ mô hình phân quyền |
| §4 Điều hướng | Bất đồng Claude ↔ Codex | IBM Carbon + Frame.io | **Hợp nhất** + **bỏ nút xin quyền khỏi MVP** |
| §5.3 Phiên bản | Đo dữ liệu thật + tài liệu Frame.io | 94/132 video 1 bản | Không đổi — bằng chứng mạnh nhất |
| §9 Trạng thái rỗng | Hội tụ độc lập | IBM Carbon | **Thêm loại thứ 4** (tải thất bại) từ Codex |
| §10 Thiết bị | **Codex đúng, tôi sai** | Android + Apple HIG | **Hoãn sau MVP** vì chạm cổng xác thực |
| ❌ Trường trạng thái | Codex phản bác tôi | GOV.UK | **Bỏ đề xuất thiết kế → thành câu hỏi Q2** |
| ❌ "Nút biến mất" | *(đã rút)* | — | **Lỗi đo của tôi** |
| ❌ "41% tương phản" | *(đã sửa thành 16%)* | — | **Lỗi tính của tôi** |
| ❌ "Nhân sự bị chặn oan" | *(đã rút)* | `folder-scope.ts` | **Thiết kế đúng** |

---

## 18. Điều tôi **KHÔNG** đề xuất — và vì sao

Phần này quan trọng ngang phần đề xuất.

| Không đề xuất | Vì sao |
|---|---|
| Thiết kế lại giao diện tổng thể | Hệ thống thiết kế **đang được tuân thủ tốt** — 0 sai lệch kích thước nút. Đập đi làm lại là phá thứ đang chạy. |
| Đổi kiến trúc thông tin | Cây theo khách hàng **khớp cách agency thật làm việc**. |
| Thêm tính năng mới | Không một đề xuất nào trong đặc tả này thêm tính năng. Toàn bộ là **làm cho thứ đã có hoạt động đúng**. |
| Đổi máy trạng thái task | Chạm lương và hoá đơn. Chưa đủ bằng chứng runtime. |
| Học Notion/ClickUp về độ linh hoạt | Tính chuyên biệt là **lợi thế duy nhất** so với Asana. |

---

## ⏸️ ĐIỂM DỪNG BẮT BUỘC

Theo đúng quy trình anh đặt ra, tôi **dừng ở đây**.

**Đã hoàn thành:** Phase 0 → Phase 8.
**Chưa được phép làm:** lập kế hoạch triển khai chi tiết, và triển khai.

**Anh có bốn lựa chọn:** `DUYỆT` · `DUYỆT KÈM ĐIỀU KIỆN` · `YÊU CẦU SỬA` · `TỪ CHỐI`

Sau khi duyệt đặc tả, tôi lập kế hoạch triển khai đầy đủ — rồi **dừng lần thứ hai** để anh duyệt kế hoạch,
trước khi chạm vào bất kỳ dòng mã nào.
