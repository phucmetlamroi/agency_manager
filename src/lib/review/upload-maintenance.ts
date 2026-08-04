// [Tệp maintenance 2026-08-04] CÔNG TẮC khoá đường TẢI LÊN của module Tệp/review.
//
// Chủ sản phẩm yêu cầu (04/08/2026): tính năng Tệp chưa ổn định → khoá upload lại,
// panel vẫn hiện, dữ liệu GIỮ NGUYÊN 100% (xem + tải về + bình luận + duyệt vẫn chạy),
// bàn giao task chỉ còn "Cập nhật link". Cổng khách (/share, /r) KHÔNG đổi.
//
// Phạm vi khoá — chỉ đường ghi byte mới vào R2/Mux:
//   · server: initiateUpload + initiateTaskUpload (upload-service.ts) — chốt thật
//   · client: uploadEngine.enqueue (lưới an toàn cho mọi UI kể cả chỗ quên vá)
//   · UI: TeamBrowser (banner + chặn picker/drop), TaskReviewUploadSection (ẩn nút),
//     ReviewPlayerShell (chặn tải phiên bản mới)
// KHÔNG khoá: tải về, xem, đính kèm ảnh trong bình luận, thao tác thư mục/trạng thái.
//
// Mở lại: đổi hằng dưới thành false (một dòng, một chỗ).

export const REVIEW_UPLOAD_MAINTENANCE = true

export const REVIEW_UPLOAD_MAINTENANCE_MESSAGE =
    'Tính năng tải video lên đang tạm bảo trì để nâng cấp trải nghiệm. ' +
    'Toàn bộ video và dữ liệu hiện có được giữ nguyên — bạn vẫn xem và tải về bình thường. ' +
    'Vui lòng tải các video quan trọng về máy để sao lưu.'
