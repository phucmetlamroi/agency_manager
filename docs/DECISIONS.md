# DECISIONS — Mission Control autonomous build (M5→M31)

Ghi mỗi quyết định tự-quyết khi chạy tự động. Format: **[Phase] câu hỏi → chọn → lý do**.
Nguyên tắc: (1) đúng plan, (2) theo pattern repo, (3) an toàn & hoàn tác được. Commit-only, KHÔNG push.

## [M5 — Finance]
- **Route riêng `/mc/finance`** (không dùng `?tab=`) → theo pattern M2/M3/M4 (mỗi màn 1 route); tab Payroll/Finance trong header điều hướng qua lại. An toàn, nhất quán.
- **Rail active = wallet** (cụm Tiền) thay vì `building-2` như frame → giữ mô hình rail của tôi (wallet = cụm Tiền gồm Payroll+Finance); `building-2` để dành CRM/Tổ chức. Nhất quán rail M1/M2/M4.
- **Transaction rows**: compute `revenueVND/wageVND/profitVND` server-side, KHÔNG pass `jobPriceUSD`/`exchangeRate` thô xuống client → money-safety (strip jobPriceUSD như M1).
- **M4 Finance tab** repoint `/admin/finance` → `/mc/finance` vì M5 đã có bản Giao diện 2.

## [M6 — Lịch]
- **2 chế độ**: **Nhân sự (rảnh/bận)** reuse `getAdminAvailabilityWeek` READ-ONLY (week matrix staff×7 ngày, đếm ca rảnh/ngày) + **Deadline** data-wired từ Task (assignee+deadline+status), week + month. Đúng brainstorm #1 (2 chế độ).
- **KHÔNG rebuild editor rảnh/bận** (ScheduleRule/ScheduleException + AdminAvailability* đã có, phức tạp) → sửa lịch rảnh/bận **bắc cầu sang Giao diện 1**. Lý do: dangerous-op (không đụng schema/không đoán format slot), an toàn, reversible.
- Route `/mc/lich`; rail `calendar-days` active. Week nav client-side cho Deadline; Nhân sự hiển thị tuần hiện tại (server-fetched).
