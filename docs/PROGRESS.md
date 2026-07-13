# PROGRESS — Mission Control (Giao diện 2)

Branch: `claude/mission-control` · **commit-only, KHÔNG push** · design = 31 màn (handoff bundle).
Done trước autoloop: M1–M4 + cosmetic pass (`7eb4a4d`).

## Autoloop M5 → M31 (tự chạy)
- [x] **M5 Finance** ✅ `7e227f8` — `/mc/finance` + `McFinanceBoard`, reuse `computeWorkspaceFinance`
- [x] **M6 Lịch** ✅ — `/mc/lich` + `McCalendarBoard`; Nhân sự (reuse `getAdminAvailabilityWeek` read-only) + Deadline (Task, week/month); sửa lịch bắc cầu GĐ1
- [x] **M7 Hộp thư** ✅ — `/mc/requests` = MC-shell bọc `RequestsInbox` (reuse getClientRequests + accept/reject/Velox); rail Inbox repoint → /mc/requests
- [x] **M8 Tệp/Review** ✅ — `/mc/tep` = MC-shell bọc `TeamBrowser` (reuse toàn bộ 3-pane review; thêm prop `chromeless` ẩn title nội bộ; admin-gated). Repoint Clapperboard → /mc/tep trên 6 màn MC. tsc+build xanh, route trong tree.
- [x] **M9 Thành viên** ✅ — `/mc/members` + `McMembersBoard`; roster `getProfileMembers` + metric `wp.user.findMany` (lương gộp VND server-side, rank+errorRate, presence, active count relative-max); reuse `InviteToProfileModal`; wire M1 UsersRound → /mc/members. tsc+build xanh.
- [x] **M10 Add Task** ✅ — `/mc/add` + `McAddScreen`; reuse `AddTaskModal` qua `DashboardActionWrapper` (controlled+hideBar, money-safe submit routing) trên backdrop MC; đóng → /mc. tsc+build xanh.
- [x] **M11 Player** ✅ — `/mc/asset/[assetId]` mirror của player GĐ1 (reuse `ReviewPlayerShell` full-bleed); thêm prop `playerBase` cho `TeamBrowser` → /mc/tep mở player MC-namespace. tsc+build xanh.
- [x] **M12 CRM** ✅ — `/mc/crm` = MC-shell (rail đầy đủ, Building2 active) bọc `ClientsManagerPanel` (reuse toàn bộ orchestrator: danh sách ↔ chi tiết ↔ tạo hóa đơn ↔ sổ thu tiền · kéo-gộp brand con · tách ra · ghi nhận thu · link chia sẻ). Panel tự mang header/breadcrumb khớp M12 → không thêm header MC. Admin-gated fail-closed; getClients cổng verifyFinanceAccess. tsc+build xanh, route trong tree.
- [ ] M13 Hóa đơn · M14 Hồ sơ TT · M15 Hồ sơ cá nhân
- [ ] M16 Vận hành bảng · M17 Bulk · M18 Phiên Chợ · M19 Sửa task · M20 Velox+HookMap
- [ ] M21 Shares · M22 Trash+Versions · M23 Compare · M24 Payroll thưởng · M25 CRM tiền · M26 Thùng rác gộp
- [ ] M27–M31 (stubs — bám spec DAC-TA-CHUC-NANG-ADMIN.md)

Kế tiếp: build M5 → tsc+build → commit → M6.
