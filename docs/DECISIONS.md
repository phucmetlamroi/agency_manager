# DECISIONS — Mission Control autonomous build (M5→M31)

Ghi mỗi quyết định tự-quyết khi chạy tự động. Format: **[Phase] câu hỏi → chọn → lý do**.
Nguyên tắc: (1) đúng plan, (2) theo pattern repo, (3) an toàn & hoàn tác được. Commit-only, KHÔNG push.

## [M5 — Finance]
- **Route riêng `/mc/finance`** (không dùng `?tab=`) → theo pattern M2/M3/M4 (mỗi màn 1 route); tab Payroll/Finance trong header điều hướng qua lại. An toàn, nhất quán.
- **Rail active = wallet** (cụm Tiền) thay vì `building-2` như frame → giữ mô hình rail của tôi (wallet = cụm Tiền gồm Payroll+Finance); `building-2` để dành CRM/Tổ chức. Nhất quán rail M1/M2/M4.
- **Transaction rows**: compute `revenueVND/wageVND/profitVND` server-side, KHÔNG pass `jobPriceUSD`/`exchangeRate` thô xuống client → money-safety (strip jobPriceUSD như M1).
- **M4 Finance tab** repoint `/admin/finance` → `/mc/finance` vì M5 đã có bản Giao diện 2.

## [M16 — Vận hành bảng task]
- **Reuse nguyên `TaskWorkflowTabs`** (bảng admin THẬT ở `/admin`) trong vỏ MC — đúng pattern bọc-component-vetted (M7 RequestsInbox / M8 TeamBrowser / M12 ClientsManagerPanel). Frame M16 chỉ ANNOTATE 4 tác vụ (popup dropdown status / dialog Revision / menu ⋯ / thanh bulk) — CẢ 4 đã wire sẵn bên trong TaskWorkflowTabs (StatusCell = dropdown-nhóm-phase + dialog "Phân loại Revision" Khách/Nội bộ; ⋯ menu = Sao chép ID/Sửa chi tiết/Trả lại/Xoá cứng; bulk bar = Sửa hàng loạt→BulkEditTaskModal + Xoá; Giao hàng loạt = AssigneeCell). Bọc lại = có hết, 0 rebuild logic (FSM/mutation/pagination/selection). KHÔNG dựng bảng mới.
- **Route mới `/mc/board`** — phân biệt rõ 3 surface: `/mc` = tổng quan read-only (6 cột, MissionControlBoard), `/mc/queue` = triage việc-chờ-giao (McQueueBoard), `/mc/board` = **bảng vận hành đầy đủ mọi status** (nơi thao tác thật). TaskWorkflowTabs props-driven (KHÔNG self-fetch) → page bơm đúng shape fetch của /admin.
- **Fetch y hệt `/admin`**: `wp.task.findMany({ isArchived:false, include:{ assignee(+rank), assignedBy, client.parent, taskTags, rawFootage }})` + `wp.user.findMany` + `checkOverdueTasks`; thứ tự **assigned-first rồi unassigned** (concat) khớp /admin (mỹ thuật trong mỗi tab). `serializeDecimal` trước khi bơm.
- **Money-safety**: `isAdmin={true}` → bảng hiện lương (đúng bản chất cockpit admin, đồng nhất GĐ1 /admin). Route cổng `verifyProfileAdminAccess` fail-closed (non-admin redirect TRƯỚC khi serialize tiền); mọi mutation của bảng re-check ADMIN server-side. USD chỉ tới admin — đúng bất biến jobPriceUSD-leak.
- **Rail: ListTodo active** (bảng task = "danh sách task"; queue triage là tập-con) — trên các màn khác ListTodo vẫn → /mc/queue, KHÔNG đổi nghĩa toàn cục (tránh scope-creep). Header mỏng "Vận hành bảng task" + đếm task + link "← Tổng quan" để phân biệt với /mc overview.
- **Wire vào M1**: footer "+N nữa" mỗi cột dashboard (trước là text tĩnh) → **Link `/mc/board`** ("xem hết task trong phase → bảng đầy đủ"). Thay đổi thuần presentational trong MC (Giao diện 2 — không thuộc ràng buộc byte-identical của /admin,/team). KHÔNG sửa `TaskWorkflowTabs` → `/admin` **byte-identical**.
- `isMobile={false}` (MC = desktop-only; prop hiện không dùng trong body TaskWorkflowTabs → an toàn).

## [M15 — Hồ sơ cá nhân]
- **MIRROR nguyên composition `/dashboard/profile`** (đã có sẵn, self-service hoàn chỉnh) trong vỏ MC — reuse `AvatarUpload` + `ProfileForm` (nickname/email/phone + đổi mật khẩu) + `NotificationSettings` + `PaymentQrUpload` (tài khoản nhận lương + QR — khớp section "Tài khoản nhận lương" của frame). KHÔNG dựng lại form (đụng mật khẩu/bank — nhạy cảm). Server action tự-phục-vụ đã hardened IDOR (bám `session.user.id`, bỏ qua userId client gửi) → 0 rủi ro account-takeover.
- **User là bản ghi GLOBAL** (bypassModels, không workspace-scope) → đọc bằng `prisma` global `findUnique({ id })`, KHÔNG cần getWorkspacePrisma cho hồ sơ. Chỉ KPI (task count + MonthlyRank) mới dùng `getWorkspacePrisma` (như M9).
- **Dải "Chỉ số cá nhân" READ-ONLY, DỮ LIỆU THẬT**: task hoàn tất (count `SALARY_COMPLETED_STATUS`) + rank + errorRate (MonthlyRank kỳ mới nhất). BỎ "đúng hạn %" và "#2 leaderboard" của frame — không tính được đáng tin từ dữ liệu hiện có → **thà hiển thị tập-con trung thực còn hơn bịa số**. Rank ẩn khi UNRANKED/chưa có (`—`), khớp bất biến M9.
- **Admin-gate fail-closed** dù là hồ sơ cá nhân — nhất quán constraint "mọi route /mc/* admin-gated"; hồ sơ hiện là của CHÍNH admin (0 rò rỉ), non-admin dùng `/dashboard/profile` GĐ1. Đóng → /mc (M15 mở "từ menu avatar", không thuộc rail → back thẳng MC).
- Không sửa các component profile GĐ1 → `/dashboard/profile` **byte-identical**.

## [M14 — Quản lý hồ sơ thanh toán]
- **M14 vốn là MODAL** ("mở khi bấm 'Quản lý hồ sơ' ở Màn 13" — frame vẽ M13 mờ phía sau) = `BillingProfileManager`, ĐÃ mount sẵn trong `InvoiceModal` → **đã sống ở /mc/hoa-don** (M13). Không dựng lại form (đụng bank info — nhạy cảm).
- **Thêm entry độc lập `/mc/ho-so-thanh-toan`** để quản lý hồ sơ TT trực tiếp (không cần chọn khách + tạo hóa đơn — hữu ích khi set-up trước). Reuse nguyên `BillingProfileManager`.
- **Thêm props defaulted-off `open`/`onOpenChange`/`hideTrigger`** vào `BillingProfileManager` (controlled-open + ẩn nút trigger) — cùng pattern `chromeless`/`playerBase` đã dùng cho TeamBrowser. Bỏ trống = hành vi cũ (dialog tự quản + trigger) → InvoiceModal (M13) + mọi caller GĐ1 **byte-identical**. Reversible.
- **Money-safety**: BillingProfile = bank wiring (beneficiary/account/swift/currency), KHÔNG có jobPriceUSD. Route cổng `verifyProfileAdminAccess` fail-closed; getBillingProfiles cổng `verifyFinanceAccess`, CRUD cổng ADMIN. Đóng modal → /mc/hoa-don.

## [M13 — Tạo hóa đơn]
- **Reuse nguyên `InvoiceModal` (embedded)** — frame M13 CHÍNH LÀ layout của InvoiceModal (trái task-picker + thuế/trả trước/hồ sơ TT · phải live PDF preview, sửa inline). Embedded mode fill `w-full h-full`, caller tự lo chrome quay-lại → khớp hoàn hảo. InvoiceModal tự hydrate `getUnbilledTasks`+`getBillingProfiles`+giá (jobPriceUSD) qua server action → chỉ cần bơm `{clientId, clientName, depositBalance, workspaceId}`. KHÔNG dựng lại luồng hóa đơn (persist tx + PDF).
- **Full-bleed, KHÔNG rail** — đúng frame M13 (chỉ 2 panel, không có rail 64px); màn tác vụ tập trung như M10 Add Task. Top bar mỏng: nút ← về /mc/crm + tiêu đề + "Đổi khách".
- **Cần 1 clientId** (InvoiceModal client-scoped) + **KHÔNG có invoice-list admin toàn workspace** (chỉ có `getClientInvoices` per-client + portal InvoicesSurface). → `/mc/hoa-don` không clientId thì hiện **picker khách** (search, phẳng parent+brand con vì getUnbilledTasks gộp cả sub); có `?clientId=X` thì mở thẳng (khớp nút "Tạo hóa đơn ▸ Màn 13" của CRM detail).
- **Money-safety**: route cổng `verifyProfileAdminAccess` fail-closed; mọi action hóa đơn cổng `verifyFinanceAccess`/`recordPayment` cổng ADMIN. DTO khách bơm xuống client **chỉ id/name/depositBalance** (map thủ công) — KHÔNG mang mảng task/`jobPriceUSD` thô. USD chỉ sống trong InvoiceModal (admin).
- **KHÔNG sửa `ClientsManagerPanel`** (M12) để trỏ sang M13 — panel mở invoice IN-PLACE (embedded, đã byte-identical GĐ1). M13 là entry standalone song song; hai lối cùng tồn tại, không đụng panel (an toàn).

## [M12 — Quản lý khách hàng (CRM)]
- **Reuse nguyên `ClientsManagerPanel`** (orchestrator CRM đã có: điều hướng in-place danh sách→chi tiết→hóa đơn→sổ thu tiền, bọc `ClientList`/`ClientAnalytics`/`PaymentLedger`/`RecordPaymentModal`/`InvoiceModal`/`ShareLinkSection`/`CreateClientButton`) — đúng pattern M7/M8 (bọc component thật). Panel đã được `DashboardClientsRow` tái dùng ở path ≠ /admin/crm → refresh/merge/mutation chạy tốt ngoài route admin. Nhanh + trung thực + 0 rủi ro logic.
- **KHÔNG thêm header MC** — panel TỰ mang header/breadcrumb (Building2 + "Quản lý khách hàng" + count + Sổ thu tiền + nút Khách hàng) khớp **chính xác** thiết kế M12 (line 2404-2417). Thêm header MC sẽ nhân đôi (như bài toán `chromeless` của TeamBrowser) → chỉ cấp vỏ MC = rail + vùng chính chứa panel full-height. Không sửa panel (an toàn tối đa, reversible).
- **Money-safety**: DTO `getClients` mang `jobPriceUSD`/`wageVND`/`profitVND` (nested tasks, không `select`) NHƯNG đây là cockpit **admin** — đồng nhất GĐ1 `/admin/crm`. Cổng 2 lớp: `verifyProfileAdminAccess` (fail-closed → redirect dashboard) ở route + `getClients` cổng `verifyFinanceAccess` + mọi mutation cổng `verifyWorkspaceAccess ADMIN`. USD chỉ tới admin — đúng bất biến jobPriceUSD-leak-discipline (admin được phép).
- **Rail đầy đủ 11 icon** khớp frame M12 (Building2 active), railHref khớp M9: wire `UsersRound → /mc/members`. **Bỏ "ledger strip"** (dải "Còn nợ $1,056 / Đã thu $4,480" ở đầu frame) — panel không có sẵn, dựng lại sẽ phải tự tính tổng nợ/thu toàn KH ngoài component đã vetted (rủi ro money-math); "Sổ thu tiền" trong panel đã cho đủ số liệu chi tiết. An toàn > trang trí.
- **Rail `Trash2` để title-only** (không href) — nhất quán M9 (placeholder tới M26 "Thùng rác gộp"); client-trash vẫn tới được qua GĐ1 `/admin/client-trash`. Không bịa/không lệch rail giữa các màn.

## [M11 — Review Player]
- **Reuse nguyên `ReviewPlayerShell`** (player full-bleed frame.io-parity đã build sẵn) — player namespace-agnostic. Tạo `/mc/asset/[assetId]` = bản mirror của `/team/asset/[assetId]` (cùng props), admin-gated fail-closed.
- **Cho `/mc/tep` mở player trong namespace MC**: thêm prop **`playerBase?: string`** vào `TeamBrowser` (mặc định `/[ws]/team/asset` → GĐ1 byte-identical); `/mc/tep` truyền `/[ws]/mc/asset`. Chỉ đổi ĐÍCH điều hướng của `openAsset`, không đụng logic khác. → M8→M11 liền mạch trong MC.
- Editor không-admin vẫn dùng player GĐ1 `/team/asset` (họ không vào namespace MC).

## [M10 — Add Task (Velox)]
- **Reuse nguyên `AddTaskModal` qua `DashboardActionWrapper`** (controlled + `hideBar`) — ĐÚNG pattern đã có sẵn ở `McTopbarActions`. KHÔNG mount modal thô (sẽ phải viết lại ~280 dòng handleSubmit money-safe: single/batch/Velox V1+V3/Multi-Hook Map/accept-request). Tất cả submit đi qua server action `createTask/…` (re-check ADMIN).
- **Route riêng `/mc/add`** (đúng design M10 = modal-as-screen). Server page fetch đúng khối add-task của `mc/page.tsx` (clients dedupe + users + pricingRules + exchangeRate) + role. Client `McAddScreen` vẽ backdrop MC mờ (skeleton board như frame) + mở modal; đóng modal → `router.push('/mc')`.
- **Velox**: giữ nguyên (toggle nội bộ modal); không cần prop — nếu sau này cần mở thẳng Velox thì truyền `veloxInitialFolderUrl` (đã có sẵn đường forward).
- **Money-safety**: admin-gate fail-closed ở route + `createTask` verify ADMIN server-side; đây là form TẠO (không đọc ngược giá cũ) → không rò rỉ USD.

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
