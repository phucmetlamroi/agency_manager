# OPEN_QUESTIONS.md — Mơ hồ về ý định nghiệp vụ (không chặn loop)

> Audit không tự quyết logic nghiệp vụ. Các câu hỏi dưới cần chủ dự án trả lời TRƯỚC khi sửa các finding liên quan. Không cản việc phát hiện.

## Q1 — Khách duyệt (portal) có nên tự "Hoàn tất" task (= tính lương editor) không? [liên quan HT-006, HT-014, HT-016]
Hiện `approveDeliverableViaToken` đặt thẳng `Task.status='Hoàn tất'` chỉ bằng client-portal token → kích hoạt payroll, `actorUserId=null`. Điều này MÂU THUẪN với quyết định H3 trong phiên gần đây ("chỉ admin mới đưa task sang Hoàn tất/terminal").
- **Ý định đúng là gì?** (a) Khách duyệt → chỉ đặt `clientReview='APPROVED'` + trạng thái "chờ admin xác nhận hoàn tất" (KHÔNG tính lương), admin bấm xác nhận mới thành 'Hoàn tất'; HAY (b) khách duyệt = hoàn tất luôn = tính lương (chấp nhận rủi ro)?
- Khuyến nghị audit: (a) — để trạng thái tính-lương luôn do admin kiểm soát, khớp H3.

## Q2 — Impersonation nên bó theo workspace/profile hay toàn cục? [liên quan HT-003/HT-004, HT-019]
Hiện phiên impersonation là danh tính TOÀN CỤC (cookie ghi đè), không bó workspace, TTL thực 1 tuần.
- **Ý định:** impersonation chỉ để hỗ trợ trong 1 workspace/profile, hay toàn quyền như user đó ở mọi nơi? Có cần giới hạn thời gian (2h) + log đầy đủ mutation không?
- Khuyến nghị: bó theo profile gốc + TTL ngắn + chặn impersonate user có OWNER/ADMIN ở profile khác.

## Q3 — Các endpoint chẩn đoán/nhất-thời còn cần trong prod không? [liên quan BACKLOG P1-026/033/048, import-jan-2026]
`/api/test-email` (rò env + CRON_SECRET qua query), `/api/import-jan-2026`, `/api/log-client-error` (unauth). 
- **Còn dùng không?** Nếu không → xoá khỏi prod. Nếu còn → siết auth + bỏ rò env + timing-safe compare.

## Q4 — "custom formula" trong pricing có thực sự cần chạy code động? [liên quan HT-008]
`new Function` để chạy công thức giá do admin nhập. 
- **Có admin nào thực sự dùng custom-formula chưa?** Nếu không → bỏ hẳn tính năng (xoá lỗ RCE). Nếu có → cần parser biểu thức an toàn (không eval).

## Q5 — SVG trong comment-attachment có cần hiển thị inline không? [liên quan HT-020]
Cho `image/svg+xml` mở đường stored-XSS.
- **Khách/nhân sự có cần upload SVG?** Nếu không → bỏ khỏi allowlist. Nếu có → phục vụ như tải-về (attachment) + sandbox CSP.

## Q6 — FSM vòng đời task bị tắt toàn cục (fsm-config.ts:122) là CỐ Ý? [liên quan HT-016, BACKLOG P1-036]
Chủ dự án đã tắt FSM (validateTransition luôn hợp lệ). Điều này khiến nhiều "workflow bypass" trở nên khả thi (không có ràng buộc thứ tự trạng thái).
- **Tắt FSM là quyết định lâu dài?** Nếu có → chấp nhận rủi ro state-jump; nếu không → cân nhắc bật lại ràng buộc tối thiểu cho các trạng thái nhạy cảm (terminal/tính lương/gửi khách).
