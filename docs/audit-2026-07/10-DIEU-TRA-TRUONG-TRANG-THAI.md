# D4 — Điều tra trường trạng thái của video (`ReviewAsset.statusId`)

> Trả lời Q2. **Không sửa một dòng mã nào** ở bước này, đúng như kế hoạch.
> Kiểm kê bằng 2 tác nhân độc lập (một lập bản đồ, một phản biện tự tìm lại từ đầu).

## Kết luận: **GIỮ** — và lý do "85% rỗng" là một lý do sai

Trường này **không chết**. Nhưng nó cũng không lành mạnh: vấn đề thật là **mặt ghi quá rộng**,
không phải dữ liệu thưa.

## Vì sao "85% rỗng ⇒ bỏ được" là suy luận hỏng

Khung đó ngầm giả định trường này chỉ là bản sao dư của `ReviewVersion.reviewState`. Đọc mã thì
không phải:

| | `ReviewAsset.statusId` | `ReviewVersion.reviewState` |
|---|---|---|
| Miền giá trị | **14** trạng thái task | **4** giá trị enum |
| Ra cổng khách thành | **9 nhãn tiếng Anh** khác nhau | 4 |
| Ai ghi được | **nhân viên**, qua ô chọn trên từng video | **chỉ khách** |

`reviewState` **không biểu diễn nổi** *Đã hủy*, *Quá hạn*, *Đã gửi video (khách)*… Nên "tự suy
ra từ hành động" là **mất ngữ nghĩa ở tầng kiểu**, không chỉ mất dữ liệu ở tầng bản ghi. Con số
85% chỉ mô tả **ảnh chụp hiện tại**, không mô tả trường.

## Ba hậu quả nếu bỏ cột

1. **Tắt hẳn một loại email gửi khách.** `task-sync.ts` là **nhà sản xuất duy nhất** của sự kiện
   `status_update`, và nó nằm sau đúng cái cổng đọc cột này.
2. **Đổi quyền, không phải dọn dẹp.** Thay cổng bằng `reviewState === APPROVED` sẽ **âm thầm
   tước** khả năng nhân viên tự kích hoạt luồng "task hoàn tất" — vì `APPROVED` **chỉ khách ghi
   được**. Đây trùng đúng phát hiện *editor tự hoàn tất* đã biết: một **quyết định chính sách**,
   phải hỏi chủ sản phẩm, không đổi lén trong một bản refactor.
3. **Gãy biên dịch ở ~6 file** cộng route `/desk-preview`.

## Việc đáng làm (nếu muốn dọn)

Không phải xoá cột, mà **thu hẹp chỗ ghi**: hôm nay một ô chọn **14 giá trị** gắn trên từng
video, cho nhân viên. Chính nó tạo ra dữ liệu vừa thưa vừa lệch. Thu hẹp mặt ghi trước; sau đó
mới có cơ sở nói trường này còn cần bao nhiêu.

## Hai ghi chú vận hành phát hiện kèm

- Cột **không có index**, nhưng đang bị `orderBy` và một truy vấn `where` quét.
- Bảng `ReviewAsset` **chưa từng được tạo bằng migration nào** trong repo (chạy bằng `db push`),
  và `DROP COLUMN` không có tiền lệ ở đây. **Đừng giả định production khớp `schema.prisma`.**

## Đã kiểm và SẠCH (không cần làm lại)

`mcp-server` · payload cổng khách `/r` · cổng tải về của khách · lịch sử trạng thái ·
Mission Control · không có raw SQL nào chạm cột · không có backfill trong `prisma/migrations`.
