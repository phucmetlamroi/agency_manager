// [Tệp closure 2026-08-04] CÔNG TẮC đóng dần module Tệp/review theo quyết định chủ sản phẩm.
//
// Quyết định (04/08/2026, sau quyết định bỏ R2/Mux): dịch vụ Tệp ĐÓNG vào 03/09/2026
// (= hôm nay + 30 ngày báo trước). Từ BÂY GIỜ:
//   · KHÔNG tải lên  (upload = tốn lưu trữ mới)
//   · KHÔNG xem trực tuyến (mỗi lượt phát = tiền delivery Mux)
//   · CHỈ TẢI VỀ — panel vẫn hiện, dữ liệu GIỮ NGUYÊN, không xoá gì trước ngày đóng.
//
// Phạm vi từng công tắc:
//   REVIEW_UPLOAD_MAINTENANCE — chặn ghi byte mới (server: initiateUpload/initiateTaskUpload;
//     client: uploadEngine.enqueue + các UI). Đã bật từ commit 383d7a8.
//   REVIEW_PLAYBACK_DISABLED — chặn mint token phát Mux (2 route playback-token: nội bộ + /r)
//     + short-circuit useHlsPlayer (mọi trình phát: Tệp, task drawer, /r khách, So sánh).
//     Poster/thumbnail GIỮ (ảnh tĩnh, phí không đáng kể — panel "vẫn hiện" cần nó).
//     Ảnh (IMAGE) xem qua presigned R2 — egress R2 miễn phí — KHÔNG chặn.
// KHÔNG khoá: tải về (download-url, download-zip, tải thư mục), bình luận, trạng thái,
// thư mục, thùng rác.
//
// Mở lại (nếu đổi ý): đặt cả hai cờ về false — một chỗ duy nhất.

export const REVIEW_UPLOAD_MAINTENANCE = true
export const REVIEW_PLAYBACK_DISABLED = true

/** Ngày dịch vụ đóng — 30 ngày kể từ ngày công bố 04/08/2026. */
export const REVIEW_SERVICE_CLOSE_DATE_LABEL = '03/09/2026'

/** Toast/lỗi khi cố TẢI LÊN. */
export const REVIEW_UPLOAD_MAINTENANCE_MESSAGE =
    `Tính năng Tệp sẽ ngừng hoạt động vào ${REVIEW_SERVICE_CLOSE_DATE_LABEL} — không thể tải video lên nữa. ` +
    `Hãy tải các video hiện có về máy để lưu trữ trước ngày đó.`

/** Thông báo thay chỗ trình phát khi cố XEM (nội bộ, tiếng Việt). */
export const REVIEW_CLOSURE_MESSAGE =
    `Xem trực tuyến đã tắt — tính năng Tệp sẽ ngừng hoạt động vào ${REVIEW_SERVICE_CLOSE_DATE_LABEL}. ` +
    `Hãy TẢI VIDEO VỀ MÁY để xem và lưu trữ. Dữ liệu không bị xoá trước ngày đóng.`

/** Bản tiếng Anh cho khách xem qua link chia sẻ (/r — UI tiếng Anh). */
export const REVIEW_CLOSURE_MESSAGE_EN =
    `Online playback has been turned off — this review service is closing on Sep 3, 2026. ` +
    `Please DOWNLOAD the video to watch and keep a copy. Nothing is deleted before that date.`
