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
- [x] **M13 Tạo hóa đơn** ✅ — `/mc/hoa-don` (full-bleed, không rail — màn tác vụ tập trung như M10) = `McInvoiceBoard` bọc `InvoiceModal` (embedded): trái task-picker + thuế/trả trước/hồ sơ TT, phải live PDF preview. InvoiceModal tự hydrate task chưa xuất + billing profiles + giá. Cần 1 clientId → picker khách khi vào thẳng, hoặc `?clientId=X` (từ nút CRM). Đóng → /mc/crm. Admin-gated fail-closed; DTO khách chỉ id/name/depositBalance (không jobPriceUSD). tsc+build xanh.
- [x] **M14 Hồ sơ thanh toán** ✅ — M14 vốn là MODAL mở từ M13 ("Quản lý hồ sơ") → đã sống sẵn trong `InvoiceModal` ở /mc/hoa-don. Thêm `/mc/ho-so-thanh-toan` = màn độc lập bọc `BillingProfileManager` (reuse: list ⇄ form tạo/sửa, getBillingProfiles + CRUD). Thêm props defaulted-off `open`/`onOpenChange`/`hideTrigger` vào BillingProfileManager (controlled-open) → GĐ1 byte-identical. Đóng → /mc/hoa-don. Admin-gated. tsc+build xanh.
- [x] **M15 Hồ sơ cá nhân** ✅ — `/mc/ho-so` = MIRROR composition của /dashboard/profile trong vỏ MC (reuse AvatarUpload + ProfileForm + NotificationSettings + PaymentQrUpload; self-service actions đã hardened IDOR) + dải "Chỉ số cá nhân" read-only (task hoàn tất + rank + lỗi TB thật, qua getWorkspacePrisma). User = bản ghi global (prisma). Admin-gated fail-closed. Đóng → /mc. tsc+build xanh.
- [ ] M16 Vận hành bảng · M17 Bulk · M18 Phiên Chợ · M19 Sửa task · M20 Velox+HookMap
- [ ] M21 Shares · M22 Trash+Versions · M23 Compare · M24 Payroll thưởng · M25 CRM tiền · M26 Thùng rác gộp
- [ ] M27–M31 (stubs — bám spec DAC-TA-CHUC-NANG-ADMIN.md)

Kế tiếp: build M5 → tsc+build → commit → M6.
