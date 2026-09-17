# Bộ câu hỏi nghiên cứu chung — Phase 5

> **Ngày:** 2026-07-28 · Do Claude lập, giao cho **cả Claude và Codex** nghiên cứu **ĐỘC LẬP**.
> Mỗi bên hoàn thành kết luận riêng **TRƯỚC KHI** nhìn kết luận của bên kia.
> Hai bên dùng **tập nguồn khác nhau** ở mức hợp lý.

## Nguyên tắc bắt buộc cho cả hai bên

1. Mỗi kết luận phải có **liên kết + nhà xuất bản + ngày xuất bản/cập nhật + ngày truy cập**.
2. **Không** dùng bài tổng hợp SEO làm bằng chứng chính.
3. **Không** dùng ảnh giao diện không xác định được phiên bản.
4. **Không** coi một cách làm là tốt chỉ vì đối thủ đang dùng — phải có lý do.
5. Phải **chủ động tìm bằng chứng phản chứng**, không chỉ tìm cái ủng hộ.

## Vì sao chỉ có 8 câu hỏi

Mỗi câu bám vào **một phát hiện có thật** trong Phase 3–4, không hỏi chung chung. Nghiên cứu chỉ có
giá trị khi nó trả lời được một quyết định đang phải đưa ra.

---

### RQ-1 · Có nên hiển thị mục menu mà người dùng không có quyền dùng?
**Gắn với F-07** — 9/15 mục thanh bên đá nhân sự về, không lời giải thích. Mã nguồn ghi rõ đây là chủ đích
("Unified nav: USER view shows ALL items same as ADMIN view").
**Cần tìm:** các sản phẩm cộng tác lớn xử lý ra sao — ẩn hẳn, làm mờ + khoá, hay cho bấm rồi giải thích?
Có nghiên cứu nào về "khám phá tính năng" so với "bực bội vì ngõ cụt" không?

### RQ-2 · Trạng thái rỗng: phân biệt "chưa có gì" với "bộ lọc đang giấu" và "không có quyền"
**Gắn với F-16 và T-04** — cùng một câu *"Chưa có task nào ở đây"* cho cả hai trường hợp; và editor
chưa có task thấy Tệp trống trơn không giải thích.
**Cần tìm:** khuyến nghị chuẩn cho ba loại trạng thái rỗng; cách viết câu và lối thoát kèm theo.

### RQ-3 · Phản hồi khi mất mạng / thao tác thất bại
**Gắn với F-15** — bấm nút khi mất mạng: hệ thống im lặng hoàn toàn.
**Cần tìm:** chuẩn về phản hồi thao tác (thời gian tối đa trước khi phải hiện gì đó), và cách xử lý
thao tác lạc quan (optimistic) khi mạng rớt — vì dự án này chơi hệ optimistic UI.

### RQ-4 · Trang 404 trong sản phẩm SaaS đã đăng nhập
**Gắn với F-14** — 404 mặc định tiếng Anh, không lối ra.
**Cần tìm:** trang 404 trong ứng dụng nên có gì; có nên giữ người dùng bên trong lớp vỏ ứng dụng không.

### RQ-5 · Chồng phiên bản khi 71% chỉ có MỘT bản
**Gắn với T-02** — 94/132 video chỉ 1 phiên bản; chỉ 9% có từ 3 bản.
**Cần tìm:** Frame.io và các công cụ duyệt video hiện hành trình bày phiên bản thế nào cho **trường hợp
phổ biến** (1 bản) so với **trường hợp hiếm** (nhiều bản)? Có ai để giao diện phiên bản chiếm chỗ chính không?

### RQ-6 · Trường trạng thái bị bỏ trống 85% — nguyên nhân nào?
**Gắn với T-01.**
**Cần tìm:** điều gì khiến một trường trạng thái được dùng hay bị bỏ? (bắt buộc, mặc định thông minh,
tự suy ra từ hành động, hay đặt sai chỗ). Tìm cả bằng chứng phản chứng: có khi nào **bỏ hẳn** trường đó
là đúng không?

### RQ-7 · Quyền theo "task được giao" so với quyền theo vai trò
**Gắn với mô hình `folder-scope.ts`** — nhân sự chỉ thấy thư mục của task giao cho mình.
**Cần tìm:** các sản phẩm tương đương dùng mô hình nào; ưu/nhược khi đội nhóm lớn dần; nó có gây ra
tình trạng "không biết cái mình không thấy" không?

### RQ-8 · Công cụ agency trên điện thoại nên lộ ra bao nhiêu?
**Gắn với F-13** — 18 nút trên máy tính xuống 2 nút trên điện thoại; máy tính bảng **cố ý** nhận giao diện máy tính.
**Cần tìm:** khuyến nghị về việc cắt giảm chức năng trên di động cho công cụ làm việc chuyên sâu;
"tablet = desktop" có phải cách làm được chấp nhận không.

---

## Phân công tập nguồn (để hai bên không lặp nhau)

| | **Claude** | **Codex** |
|---|---|---|
| Trọng tâm | Khả năng hiểu, tâm lý người dùng, logic sản phẩm, mức phù hợp định hướng VN-first | Tài liệu chính thức, tiêu chuẩn gốc, phiên bản hiện hành của Notion/ClickUp/Frame.io |
| Ưu tiên nguồn | Nghiên cứu có phương pháp, sách/bài viết của tác giả có tên tuổi, bằng chứng phản chứng | Help center chính chủ, changelog, tài liệu API, tiêu chuẩn W3C/WCAG |
| Nhiệm vụ riêng | Đánh giá mức phù hợp với **SaaS / MVP / bán được hàng** | Tự phản biện kết luận của chính mình |
