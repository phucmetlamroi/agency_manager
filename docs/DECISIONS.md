# DECISIONS — Mission Control autonomous build (M5→M31)

Ghi mỗi quyết định tự-quyết khi chạy tự động. Format: **[Phase] câu hỏi → chọn → lý do**.
Nguyên tắc: (1) đúng plan, (2) theo pattern repo, (3) an toàn & hoàn tác được. Commit-only, KHÔNG push.

## [M5 — Finance]
- **Route riêng `/mc/finance`** (không dùng `?tab=`) → theo pattern M2/M3/M4 (mỗi màn 1 route); tab Payroll/Finance trong header điều hướng qua lại. An toàn, nhất quán.
- **Rail active = wallet** (cụm Tiền) thay vì `building-2` như frame → giữ mô hình rail của tôi (wallet = cụm Tiền gồm Payroll+Finance); `building-2` để dành CRM/Tổ chức. Nhất quán rail M1/M2/M4.
- **Transaction rows**: compute `revenueVND/wageVND/profitVND` server-side, KHÔNG pass `jobPriceUSD`/`exchangeRate` thô xuống client → money-safety (strip jobPriceUSD như M1).
- **M4 Finance tab** repoint `/admin/finance` → `/mc/finance` vì M5 đã có bản Giao diện 2.

## [M9 — Thành viên]
- **Roster = `getProfileMembers(profileId)`** (vai trò tổ chức OWNER/ADMIN/USER; CLIENT đã bị lọc) + **hydrate metric** từ `wp.user.findMany` (tasks 'Hoàn tất' → lương, bonuses, monthlyRanks rank+errorRate, presence, isTreasurer) — đúng pattern `mc/tien`. Join theo `userId`.
- **Money-safety**: `salaryVND` được **tính gộp 1 số VND server-side** (Σ task.value 'Hoàn tất' + bonusAmount) → DTO KHÔNG mang `jobPriceUSD`/mảng task value thô. Admin-gate fail-closed (lương chỉ admin).
- **Rank S/A/B/C + "Lỗi tháng"** đi kèm nhau: chỉ hiện khi có `MonthlyRank` với rank ≠ 'UNRANKED' (kỳ đã "Tính thưởng"); chưa tính → ẩn cả hai. Nguồn: `MonthlyRank.rank` + `.errorRate`.
- **"Đang làm"**: `wp.task.groupBy(assigneeId)` where `isArchived:false, status notIn ['Hoàn tất','Đã hủy']`. **Thanh tải (%)**: KHÔNG có field capacity → dùng **tương đối theo max active của team** (không bịa hằng số cap); nhãn "đầy tải" (max, amber) / "rảnh" (≤1, emerald).
- **Online/last-active**: từ `UserPresence.status`+`lastHeartbeat` → nhãn VI ("ONLINE"/"Xh trước"/"X ngày trước") tính server-side; chấm xanh nếu ONLINE <5'.
- **Mời thành viên**: reuse `InviteToProfileModal` (đúng luồng invite GĐ1 đã hardened); onSuccess → `router.refresh()`.
- **"Thùng rác tổ chức"**: KHÔNG có member soft-delete trong schema → bắc cầu sang `/admin/profile-trash` (GĐ1, list org đã xoá), **bỏ số đếm bịa**. "Hồ sơ"/"Quyền" bắc cầu `/admin/profile-members` tới khi M14/M15 ra đời.
- **Rail**: dùng bộ rail **đầy đủ** khớp frame M9 (users-round active + trash/activity/scroll-text placeholder chưa có route). Wire `UsersRound` của M1 → `/mc/members` (M1 đã sẵn icon). Các màn rail-ngắn (M2/M4/M5/M6/M7/M8) giữ nguyên — Members tới được từ M1 & chính M9.

## [M8 — Tệp / Review]
- **Reuse toàn bộ `TeamBrowser`** (module Video Review 3-pane có sẵn) trong vỏ MC, KHÔNG dựng lại. Frame M8 chính là bản vẽ lại của `TeamBrowser` (folder tree + asset list + status pill + InfoPanel "Gửi khách duyệt"/share/tải). Đúng pattern M7 (bọc component sẵn có). Nhanh + trung thực + 0 rủi ro logic.
- **Thêm prop `chromeless?: boolean` (mặc định false)** vào `TeamBrowser` — chỉ ẩn khối tiêu-đề-module nội bộ (Clapperboard + "Review" h1) để header MC không nhân đôi. Thuần presentational, defaulted off → GĐ1 `/team` + `/team/folder/[id]` giữ **byte-identical**. Reversible.
- **Admin-gate fail-closed** (`verifyProfileAdminAccess` → redirect dashboard) như mọi route `/mc/*`, **dù** module này không có field tiền và ở GĐ1 chỉ cần membership. Lý do: nhất quán namespace MC (cockpit admin) + fail-closed an toàn nhất; editor vẫn dùng `/team` GĐ1 nên không mất quyền. `isAdmin={true}` (đã qua cổng admin).
- **Rail `clapperboard` active** (đúng frame M8 line 1627). Repoint slot Clapperboard → `/mc/tep` trên toàn bộ 6 màn MC đã dựng (M1 nav `tep`, M2/M5/M6/M4 railHref `"TEP"`, M7 href tuyệt đối).
- **Money-safety**: xác nhận `AssetDto`/`FolderDto`/`VersionDto`/`ShareDto` KHÔNG mang `jobPriceUSD`/wage (comment trong `folders.ts:5` khẳng định) → reuse verbatim, 0 rò rỉ.

## [M6 — Lịch]
- **2 chế độ**: **Nhân sự (rảnh/bận)** reuse `getAdminAvailabilityWeek` READ-ONLY (week matrix staff×7 ngày, đếm ca rảnh/ngày) + **Deadline** data-wired từ Task (assignee+deadline+status), week + month. Đúng brainstorm #1 (2 chế độ).
- **KHÔNG rebuild editor rảnh/bận** (ScheduleRule/ScheduleException + AdminAvailability* đã có, phức tạp) → sửa lịch rảnh/bận **bắc cầu sang Giao diện 1**. Lý do: dangerous-op (không đụng schema/không đoán format slot), an toàn, reversible.
- Route `/mc/lich`; rail `calendar-days` active. Week nav client-side cho Deadline; Nhân sự hiển thị tuần hiện tại (server-fetched).
