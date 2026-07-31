# Phase 5 — Kết luận nghiên cứu ĐỘC LẬP của Claude

> **Ngày truy cập mọi nguồn:** 2026-07-28
> ⚠️ **Viết XONG trước khi xem kết quả của Codex.** Codex nghiên cứu song song cùng bộ câu hỏi bằng
> tập nguồn khác (tài liệu chính chủ + tiêu chuẩn gốc). Đối chiếu chéo sẽ làm ở Phase 6.
> **Trọng tâm nhánh này:** khả năng hiểu, tâm lý người dùng, logic sản phẩm, và **bằng chứng phản chứng**.

---

## RQ-1 · Có nên hiện mục menu mà người dùng không có quyền dùng?

**Gắn với F-07** — 9/15 mục thanh bên đá nhân sự về, im lặng.

### Điều tôi tìm được

Tài liệu chuyên môn **không** đưa ra câu trả lời một chiều. Nguyên tắc chia theo **ý định**:

> *"Disable if you want the user to know a feature exists but is unavailable. Hide if the value shown
> is currently irrelevant and can't be used."*

Và điểm mấu chốt cho đúng trường hợp của chúng ta:

> *"If a user cannot enable a button due to lacking permissions, seeing it disabled without explanation
> will just waste their mental effort."*

Kèm một hướng thứ ba mà tôi cho là hợp nhất với sản phẩm này:

> *"For cases where the user does not have permission but might know it's an option, show a disabled
> feature with some type of link or Call to Action that allows them to request access."*

### 🔻 Bằng chứng phản chứng (bắt buộc tự tìm)

Có lập luận **chống lại việc ẩn**: *"Disabled states offer better discoverability — many users learn to
use an application by exploring and reading labels."* Với sản phẩm bán cho agency, việc nhân sự **biết**
hệ thống có phần Tài chính, Bảng lương, Phân tích lại là **có lợi** — nó cho họ thấy sản phẩm đầy đủ,
và cho người quản lý thấy lý do nâng quyền.

Nói cách khác: **quyết định "unified nav" trong mã nguồn KHÔNG sai về ý định.** Nó sai ở chỗ **thiếu vế thứ hai** —
không làm mờ, không khoá, không giải thích, không có đường xin quyền. Nó chỉ có phần "hiện ra" mà thiếu
phần "nói cho biết".

### Kết luận của tôi
**Giữ nguyên việc hiện đủ 15 mục, nhưng làm mờ + khoá 9 mục không dùng được, kèm chú giải ngắn
"Cần quyền quản trị".** Đây là phương án duy nhất giữ được cả tính khám phá lẫn sự tôn trọng công sức
người dùng, và không cần đụng vào tầng quyền.

**Độ chắc chắn: CAO** — có nguồn cả hai chiều, và phương án chọn giải quyết đúng vế đang thiếu.

**Mức phù hợp định hướng (VN-first):** rất phù hợp. Agency Việt Nam thường có 3–10 người, ranh giới
vai trò lỏng; việc nhìn thấy toàn bộ năng lực sản phẩm có giá trị bán hàng nội bộ.

---

## RQ-2 · Trạng thái rỗng: ba loại khác nhau, không thể dùng chung một câu

**Gắn với F-16** (*"Chưa có task nào ở đây"* cho cả khi tìm không ra) **và T-04** (editor chưa có task
thấy Tệp trống trơn, không chữ nào).

### Điều tôi tìm được

Nguồn có thẩm quyền nhất là NN/g, và họ liệt kê **các loại trạng thái rỗng khác nhau** — trong đó có
đúng ba loại đang lẫn lộn trong sản phẩm này: **chưa có dữ liệu lần đầu**, **lọc ra rỗng**, và
**không có quyền** (*"data is present but can't be accessed by the user"*).

Nguyên tắc viết:

> *"Provide guidance about why there is no data, and either what the user can do to address the lack
> of data, or the circumstances under which the data would appear."*

Và nó gắn thẳng vào heuristic số 9 của Jakob Nielsen: nói rõ **vấn đề**, bằng **ngôn ngữ thường**, kèm
**giải pháp**.

### Kết luận của tôi
Sản phẩm cần **ba câu khác nhau**, không phải một:

| Tình huống | Câu hiện tại | Câu nên có |
|---|---|---|
| Thật sự chưa có task | *"Chưa có task nào ở đây."* | Giữ nguyên — đúng |
| Tìm/lọc không ra | *"Chưa có task nào ở đây."* ❌ | *"Không tìm thấy task nào khớp «…»"* + nút **Xoá bộ lọc** |
| Chưa được giao task (Tệp) | **(không có chữ nào)** ❌ | *"Bạn chưa được giao task nào. Video sẽ hiện ở đây khi bạn nhận task."* |

**Độ chắc chắn: RẤT CAO** — nguồn thẩm quyền cao, nguyên tắc rõ, và sản phẩm đang vi phạm rõ ràng.

---

## RQ-3 · Mất mạng: im lặng là hỏng, không phải là an toàn

**Gắn với F-15** — bấm nút khi mất mạng, không một ký tự nào thay đổi trên màn hình.

### Điều tôi tìm được — đúng một câu mô tả chính xác lỗi này

> *"A silent rollback looks like a broken button rather than a rejected request."*

Đây gần như là mô tả nguyên văn hiện trạng: người dùng bấm, không có gì xảy ra, và **kết luận nút hỏng**.

Nguyên tắc kèm theo: hoàn tác tự động phải đi **cùng** một thông báo nổi (toast) — *"pairing automatic
rollback with a visible toast ensures the user understands both that the action failed and that the UI
has reverted."*

### 🔻 Bằng chứng phản chứng — và nó chỉ ra một rủi ro NẶNG HƠN

Tài liệu cảnh báo **không nên** dùng giao diện lạc quan cho **thao tác phá huỷ không hoàn tác được**
và cho **số tiền**:

> *"Destructive actions like permanent deletes without an undo mechanism should not show instant
> success… Financial balances are poor candidates too: showing a briefly incorrect balance could cause
> a user to place an order against a phantom balance."*

⚠️ **Đây là điều tôi phải nêu thành cảnh báo riêng.** Quy định nội bộ của dự án (`CLAUDE.md`) ghi rõ
*"Chơi hệ Optimistic UI"* như một nguyên tắc chung. Nhưng sản phẩm này có **hai vùng** mà tài liệu
khuyến cáo **không** được lạc quan:
- **"Xóa vĩnh viễn"** trong thùng rác Tệp — không hoàn tác được
- **Bảng lương và Tài chính** — hiển thị số tiền

Tôi **chưa kiểm chứng** hai vùng này có đang dùng optimistic UI hay không. Ghi là **rủi ro cần kiểm riêng**,
không phải phát hiện đã xác nhận.

**Độ chắc chắn về F-15: RẤT CAO.** **Về cảnh báo optimistic ở vùng tiền/xoá: CHƯA KIỂM CHỨNG.**

---

## RQ-8 · "Máy tính bảng dùng giao diện máy tính" — đúng, nhưng chưa đủ

**Gắn với F-13 và phát hiện `"tablet + undefined ⇒ desktop"`.**

### Điều tôi tìm được — quyết định của dự án là ĐÚNG

Hướng dẫn của chính Apple đứng về phía dự án:

> *"Safari on iPad is capable of delivering a 'desktop' web experience, and users will expect this…
> if you have a version optimized for mobile devices with small screens, you should NOT serve this
> mobile version to iPad users."*

Và lý do kỹ thuật trong mã nguồn cũng khớp thực tế đã được ghi nhận rộng rãi: iPadOS **tự khai là máy Mac**,
gây nhầm lẫn cho mọi hệ nhận diện thiết bị (có báo cáo hơn 60% lượt truy cập từ máy tính bảng bị đếm nhầm
thành máy tính).

➡️ **Vậy quyết định `tablet ⇒ desktop` không phải lỗi. Nó là lựa chọn đúng và có căn cứ.**

### 🔑 Nhưng kết hợp với số đo của tôi thì lộ ra một vấn đề MỚI

Đây là chỗ nghiên cứu và đo đạc gặp nhau, và nó là phát hiện riêng của đợt này:

> **Máy tính bảng nhận giao diện máy tính (đúng) — nhưng giao diện máy tính có 61 nút dưới 24px và
> 90% số nút dưới 44px. Trên iPad, người ta bấm bằng NGÓN TAY, không phải chuột.**

Nghĩa là: quyết định về **bố cục** đúng, nhưng nó **thừa hưởng một hệ kích thước dành cho chuột** và đem
đặt lên một thiết bị cảm ứng. Hai nút **"Thu gọn" / "Mở rộng" 20px trong module Tệp** là ví dụ cụ thể —
trên iPad, đó là mục tiêu bấm rất khó trúng.

Tài liệu cũng cảnh báo đúng hướng này: *"iPad UX design requires a tablet-first design strategy rather
than simply scaling up"*, và giao diện iPad tốt dựa vào sidebar, split view, popover.

### Kết luận của tôi
**Giữ nguyên `tablet ⇒ desktop`.** Nhưng nếu agency có người dùng iPad, phải **nâng kích thước vùng bấm
trong giao diện máy tính lên tối thiểu 44px cho các nút chính**, hoặc thêm một chế độ "cảm ứng".
❓ **Cần anh cho biết:** nhân sự/khách có ai dùng iPad để duyệt video không? Nếu không, hạng mục này
tụt xuống mức thấp ngay.

**Độ chắc chắn: CAO** về quyết định bố cục · **CAO** về mâu thuẫn kích thước · **phụ thuộc câu trả lời của anh** về mức ưu tiên.

---

## Những câu tôi CHƯA trả lời trong nhánh này

Ghi rõ để không ai tưởng là đã nghiên cứu đủ:

- **RQ-4 (trang 404)**, **RQ-5 (chồng phiên bản Frame.io)**, **RQ-6 (trường trạng thái bỏ trống)**,
  **RQ-7 (quyền theo task được giao)** — tôi **cố ý chưa làm** ở nhánh này. Bốn câu này cần **tài liệu
  chính chủ và phiên bản hiện hành**, đúng tập nguồn đã phân cho Codex. Làm cả hai bên sẽ phá vỡ tính
  độc lập và tạo cảm giác "hai nguồn xác nhận nhau" giả tạo.
- Sẽ hợp nhất ở Phase 6.

## Ma trận nguồn — nhánh Claude

| Nguồn | Nhà xuất bản | Dùng cho |
|---|---|---|
| [Hidden vs. Disabled In UX](https://www.smashingmagazine.com/2024/05/hidden-vs-disabled-ux/) | Smashing Magazine | RQ-1 — nguyên tắc ẩn vs khoá |
| [Inactive GUI Controls: Show, Disable, or Hide?](https://www.uxtigers.com/post/inactive-buttons) | UX Tigers (Jakob Nielsen) | RQ-1 — tính khám phá của trạng thái khoá |
| [Disable, Hide, or Grey Out?](https://www.theusabilitypeople.com/thought_leadership/disable-hide-or-grey-out) | The Usability People | RQ-1 — trường hợp quyền hạn + đường xin quyền |
| [Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/) | Nielsen Norman Group | RQ-2 — phân loại trạng thái rỗng |
| [Carbon Design System — Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/) | IBM | RQ-2 — các loại trạng thái rỗng gồm "permission denied" |
| [React 19 useOptimistic: Roll Back UI After an API Error](https://www.machinelearningx.com/reactjs/react-19-useoptimistic-rollback-error) | machinelearningx | RQ-3 — "silent rollback looks like a broken button" |
| [Optimistic UI Updates: Patterns](https://murtazaweb.com/blog/2026-03-22-optimistic-ui-updates-patterns/) | murtazaweb | RQ-3 — khi KHÔNG nên dùng optimistic (xoá vĩnh viễn, số tiền) |
| [Optimize Your Website for iPad](https://www.gravityjack.com/news/how-to-optimize-your-website-for-ipad-mobile-responsiveness-for-tablets/) | Gravity Jack | RQ-8 — không phục vụ bản mobile cho iPad |
| [Tablet User Interface Design (2026)](https://superdesign.dev/blog/tablet-user-interface-design) | Superdesign | RQ-8 — tablet-first, không phóng to từ mobile |

⚠️ **Giới hạn của ma trận này:** một số nguồn là bài viết chuyên môn có tác giả, **không phải tiêu chuẩn gốc**.
Tôi đánh dấu để anh biết mức tin cậy: NN/g và IBM Carbon là nguồn thẩm quyền cao; các nguồn còn lại là
tham khảo có lý lẽ. Codex đang phụ trách tầng tiêu chuẩn gốc (W3C/WCAG/HIG) — sẽ bổ sung ở Phase 6.
