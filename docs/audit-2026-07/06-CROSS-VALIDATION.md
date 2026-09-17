# Phase 6 — Đối chiếu chéo Claude ↔ Codex

> **Ngày:** 2026-07-28
> Hai bên nghiên cứu **độc lập** cùng 8 câu hỏi, bằng **tập nguồn khác nhau**, và **viết xong kết luận
> trước khi nhìn kết quả của nhau**. Tài liệu này giữ nguyên mọi bất đồng có bằng chứng.
>
> **Quy tắc tôi tự ràng buộc:** không xoá bất đồng cho gọn, và không biến phán quyết QC của mình thành
> dữ kiện khi bằng chứng chưa đủ.

---

## 🔴 BẤT ĐỒNG 1 — Mục menu không có quyền: ẩn hay khoá? *(quan trọng nhất)*

Đây là bất đồng ở đúng **F-07**, phát hiện lớn nhất của cả đợt.

| | **Claude** | **Codex** |
|---|---|---|
| Kết luận | **Giữ đủ 15 mục**, làm mờ + khoá 9 mục, kèm chú giải | **ẨN HẲN** 9 mục không bao giờ dùng được |
| Nguồn chính | Smashing Magazine · UX Tigers (Jakob Nielsen) · The Usability People | **IBM Carbon — Disabled states**, cập nhật **2026-07-23** |
| Lý lẽ | Trạng thái khoá giúp người dùng **biết sản phẩm có gì**; agency Việt 3–10 người, ranh giới vai trò lỏng | Carbon phân biệt rõ: **cấm vĩnh viễn → ẩn**; **thiếu điều kiện tạm thời → khoá + giải thích cách gỡ** |

### ⚖️ Phán quyết QC của tôi — và tôi phải nhận là mình thiếu sót

**Nguồn của Codex mạnh hơn nguồn của tôi**, ở ba điểm cụ thể: nó **có ngày cập nhật** (2026-07-23),
nó là **hệ thống thiết kế của một hãng lớn**, và quan trọng nhất — nó nêu **một sự phân biệt mà tôi đã bỏ sót**:

> **Cấm VĨNH VIỄN thì ẩn. Thiếu điều kiện TẠM THỜI thì khoá và nói cách gỡ.**

Kết luận của tôi ("luôn luôn khoá + giải thích") đã **gộp hai trường hợp khác nhau làm một**.

**Nhưng Codex cũng chưa đúng hoàn toàn** — vì nó áp quy tắc "vĩnh viễn" vào một bối cảnh mà quyền
**không hề vĩnh viễn**. Trong agency 3–10 người, một editor hôm nay **hoàn toàn có thể** được nâng quyền
tuần sau. Đó không phải "vĩnh viễn cấm", đó là "chưa được cấp".

### ✅ Điều Codex tìm được mà TÔI KHÔNG TÌM RA — và nó gỡ được thế bí

Frame.io có **cơ chế xin quyền** (access request), tài liệu ghi ngày **2026-01-08, cập nhật 2026-03-02**.
Đây là **con đường thứ ba** mà cả hai kết luận ban đầu đều bỏ qua.

### 🎯 Kết luận hợp nhất — tốt hơn cả hai kết luận ban đầu

Không phải chọn một trong hai, mà là **chia 9 mục thành hai nhóm theo tiêu chí "có thể được cấp quyền không"**:

| Nhóm | Cách xử lý | Ví dụ |
|---|---|---|
| **Có thể được cấp quyền** (đa số, trong agency nhỏ) | Hiện, làm mờ + khoá, chú giải *"Cần quyền quản trị"*, kèm đường **xin quyền** | Bảng lương · Phân tích · Nhật ký hoạt động |
| **Không bao giờ được cấp** | **Ẩn hẳn** | Thùng rác tổ chức (nếu chỉ chủ sở hữu) |

❓ **CẦN ANH QUYẾT ĐỊNH:** trong 9 mục đó, mục nào anh **sẵn sàng cấp quyền** cho editor khi họ xin,
và mục nào **không bao giờ**? Danh sách đó quyết định trực tiếp mục nào ẩn, mục nào khoá.

---

## 🔴 BẤT ĐỒNG 2 — "Máy tính bảng = giao diện máy tính": Codex đúng, tôi sai

| | **Claude** | **Codex** |
|---|---|---|
| Kết luận | **Giữ nguyên** — Apple khuyên không phục vụ bản mobile cho iPad | Nhận diện ở phía máy chủ kiểu này **không bảo vệ được**; phải chọn bố cục theo **cửa sổ thật** |
| Nguồn | Bài hướng dẫn về iPad (không phải tài liệu gốc của Apple) | **Android Developers** (2026-06-16) — nói thẳng *không* dùng logic `isTablet`; **Apple HIG Multitasking** (2025-06-09) — cửa sổ iPad **thay đổi kích thước được** |

### ⚖️ Phán quyết QC: **Codex đúng, kết luận của tôi phải sửa.**

Tôi đã đọc đúng một nửa và suy ra sai nửa còn lại. Hướng dẫn của Apple nói **đừng phục vụ bản MOBILE
cho iPad** — nó **không** nói "hãy quyết định một lần ở phía máy chủ dựa trên loại thiết bị".

Điều tôi bỏ sót: **cửa sổ trên iPad thay đổi kích thước được** (Split View, Stage Manager). Một quyết định
chốt cứng ở phía máy chủ **không thể** thích ứng khi người dùng kéo ứng dụng còn nửa màn hình. Và Android
**nói thẳng** rằng lối suy nghĩ `isTablet` là sai.

**Kết luận sửa lại:** *"đưa giao diện dày cho iPad"* là **đúng**; *"quyết định bằng cách đoán loại thiết
bị ở phía máy chủ"* là **cách làm sai**. Hai điều đó khác nhau, và tôi đã trộn chúng làm một.

⚠️ Đây là hạng mục **đắt** — đổi cơ chế chọn lớp vỏ chạm vào `middleware`, tức chạm vào cổng xác thực.
Đưa vào đặc tả kèm cảnh báo chi phí, **không** phải việc làm ngay.

---

## ✅ HỘI TỤ ĐỘC LẬP — hai bên đi hai đường, ra cùng một chỗ

Đây là loại kết quả đáng tin nhất, vì không bên nào nhìn thấy bên kia.

### RQ-2 · Trạng thái rỗng — cả hai đều nói phải tách ba loại
Tôi tách 3 loại; Codex tách 3 loại **giống hệt** rồi thêm loại thứ 4 tôi bỏ sót: **tải dữ liệu thất bại**
(cần nút thử lại). Cả hai cùng dựa trên IBM Carbon một cách độc lập.

> 🔻 **Phản biện Codex nêu mà tôi không nghĩ tới:** câu giải thích quyền hạn **có thể vô tình tiết lộ
> cấu trúc dữ liệu được bảo vệ**. Ví dụ *"Video này thuộc task chưa giao cho bạn"* đã xác nhận **video đó
> có tồn tại**. Phải cân nhắc câu chữ.

### RQ-3 · Mất mạng — cả hai đều nói im lặng là lỗi, và Codex **nâng mức nghiêm trọng**
Tôi có câu mô tả hiện tượng (*"a silent rollback looks like a broken button"*). Codex có **con số và
tiêu chuẩn**:
- **RAIL của Google** (2020-06-10): phản hồi nhìn thấy trong **100 ms**; **1 giây** là ngưỡng mất tập trung; **10 giây** là ngưỡng bỏ cuộc
- **WCAG F103** (W3C, 2026-03-09): **thông báo động không được truyền đạt có thể LÀM HỎNG tiêu chí 4.1.3**

➡️ **Hệ quả: F-15 không chỉ là lỗi trải nghiệm — nó có thể là một lỗi KHÔNG ĐẠT CHUẨN TRỢ NĂNG.**
Tôi **nâng F-15 từ `S2_MAJOR` lên diện cần xử lý sớm** dựa trên bằng chứng của Codex.

### RQ-5 · Chồng phiên bản — số đo của tôi và tài liệu của Codex khớp nhau
Tôi đo: **71% video chỉ có 1 phiên bản**. Codex tra tài liệu Frame.io V4 (2024-10-10): **chồng phiên bản
chỉ được TẠO RA khi có bản thứ 2**; bản mới nhất mở mặc định; bản cũ nằm sau số hiệu phiên bản ở trên cùng.
So sánh chỉ thao tác trên **hai** bản được chọn.

➡️ Hai đường độc lập, một kết luận: **video 1 phiên bản phải trông như một video bình thường** — không
thanh phiên bản, không badge. Chỉ hiện cơ chế phiên bản **từ bản thứ 2 trở đi**.
Đây là khuyến nghị **chắc chắn nhất** của cả đợt nghiên cứu.

---

## 🔻 CODEX PHẢN BÁC MỘT KẾT LUẬN CỦA TÔI — và tôi chấp nhận

**Về T-01 (85% video không có trạng thái):**

> *"Do not infer 'unused' solely from 85% null… The 15% may represent the highest-consequence approval
> work. Sparse fields can still be valuable when exceptional states matter."*

Đúng. Con số 85% cho tôi biết trường đó **bị bỏ trống**, **không** cho tôi biết nó **vô dụng**.
Có thể 20 video có trạng thái chính là 20 video quan trọng nhất.

Codex đưa ra khung kiểm tra đúng, từ **GOV.UK Service Manual**: một trường chỉ nên tồn tại khi thông tin
đó **được cần**, **có người dùng đến**, **có người chịu trách nhiệm điền**, và **có kế hoạch cập nhật**.

➡️ **Tôi sửa lại T-01:** đây **không phải** kiến nghị bỏ trường trạng thái. Đây là **câu hỏi cần trả lời
trước khi thiết kế**: ai đặt trạng thái, vào lúc nào trong quy trình, và **cái gì đọc nó**?

---

## 🔻 CODEX THÁCH THỨC MÔ HÌNH PHÂN QUYỀN CỦA SẢN PHẨM

Về `folder-scope.ts` (nhân sự chỉ thấy thư mục của task giao cho mình), Codex tìm được:

- **Frame.io** kết hợp vai trò tài khoản với quyền theo tài nguyên — và **việc được giao việc KHÔNG phải
  ranh giới bảo mật** (Adobe, 2026-06-16)
- **NIST** (Role-Based Access Control): quản trị quyền **theo từng người** trở nên **tốn kém và dễ sai**
  khi đội lớn dần; vai trò ánh xạ theo cơ cấu tổ chức thì bền hơn

➡️ Ghi là **rủi ro mở rộng quy mô**, **không phải lỗi hiện tại**. Với agency 3–10 người thì mô hình hiện
tại chạy tốt. Câu hỏi cho đặc tả: khi khách hàng của anh có 30 người thì mô hình này còn quản được không?

---

## Bảng tổng hợp

| Câu hỏi | Claude | Codex | Kết quả |
|---|---|---|---|
| RQ-1 Menu không quyền | Khoá + giải thích | Ẩn hẳn | ⚖️ **Hợp nhất: chia theo "có thể cấp quyền không"** + đường xin quyền |
| RQ-2 Trạng thái rỗng | 3 loại | 3 loại **+ 1** | ✅ Hội tụ, Codex bổ sung |
| RQ-3 Mất mạng | Là lỗi | Là lỗi **+ có thể sai chuẩn trợ năng** | ✅ Hội tụ, **nâng mức** |
| RQ-4 Trang 404 | *(không làm — nhường Codex)* | Giữ vỏ ứng dụng, tiếng Việt, `lang="vi"` | ✅ Nhận kết luận Codex |
| RQ-5 Chồng phiên bản | Đo: 71% một bản | Tài liệu: chồng tạo từ bản 2 | ✅ **Hội tụ mạnh nhất** |
| RQ-6 Trạng thái bỏ trống | Nghi ngờ vô dụng | **Phản bác** cách suy luận | 🔻 **Tôi sửa lại** |
| RQ-7 Quyền theo task | *(không làm — nhường Codex)* | Rủi ro khi mở rộng | ✅ Nhận, xếp diện theo dõi |
| RQ-8 Tablet = desktop | Giữ nguyên | **Cách làm sai** | 🔴 **Codex đúng, tôi sai** |

**Tổng: 8 câu · 4 hội tụ · 2 bất đồng thật · 1 tôi bị phản bác · 1 tôi sai hẳn.**

Tôi giữ nguyên cả bốn trường hợp bất lợi cho mình trong tài liệu này thay vì viết lại cho đẹp — vì
đó chính là giá trị của việc chạy hai nhánh độc lập.

## Giới hạn của đợt nghiên cứu

- Codex ghi rõ nơi **không tìm được nguồn có ngày tháng**: trang trợ giúp hiện hành của Notion và ClickUp
  **không ghi ngày cập nhật**, nên chỉ dùng làm tham khảo yếu.
- **Không có nguồn thẩm quyền nào** giải thích được vì sao trường trạng thái của riêng sản phẩm này bị bỏ
  trống 85% — chỉ dữ liệu thật của anh mới trả lời được.
- **Không có tiêu chuẩn nào** quy định chính xác nội dung một trang 404 trong ứng dụng SaaS đã đăng nhập.
