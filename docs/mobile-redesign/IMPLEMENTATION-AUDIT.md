# IMPLEMENTATION-AUDIT — Kết quả quét Phase 0 (mobile redesign)

| | |
|---|---|
| Ngày chạy | 2026-07-10 (đang tiến hành) |
| Commit repo | `f6d8bf6` (feat: unify review player experience) — nhánh `audit/phase-0` |
| Môi trường | localhost:3000 dev · cookie `view-mode=mobile` · preview browser · iPhone thật (bước 8): **chưa** |
| Người chạy | Claude Code |
| Spec nguồn | 03-DAC-TA-KY-THUAT/AUDIT-CHECKLIST.md v1.0 |
| **Trạng thái** | **Nửa tĩnh (grep G-01→G-18 + inventory + component code + spec-diff) XONG. Nửa trực quan (screenshot 26 route × 3 viewport + JS-1→JS-8 + console/network + iPhone) CHỜ credentials đăng nhập.** |

> **Ghi chú môi trường:** (1) Nhánh `audit/phase-0` tạo từ `f6d8bf6`, `git diff src/` = rỗng. (2) 2 file `src/` **untracked có TRƯỚC audit** (không do audit tạo): `src/actions/share-document-actions.ts`, `src/components/portal/calm/DocumentsSurface.tsx` — thuộc WIP "Documents portal" đang dở, không nằm trong phạm vi audit. Các thay đổi tracked WIP khác đã `git stash` để có nền sạch. (3) `.env` trỏ DB **production** (autumn-flower) → khi chạy dev, audit CHỈ đọc (điều hướng/screenshot/inspect), **KHÔNG bấm mutation** (đổi status, xoá, tạo task) để không ghi vào prod; các bước C-11 pending-state/C-12 empty kiểm bằng route/tab sẵn có, không tạo dữ liệu.

---

## 1. Summary

### 1.0 Inventory route regenerate (Bước 0.3) — đối chiếu 05b

Glob `src/app/**/page.tsx` = **41 page**. Bảng dưới là inventory THẬT (đã giải 3 ẩn số + đánh dấu lệch 05b). "Live" = đã screenshot; "Tĩnh" = mới audit qua code/frame video.

| # | Route thật | Khác 05b? | Trạng thái audit |
|---|---|---|---|
| R-01 | `/` landing (`src/app/page.tsx`) | — | Tĩnh (chờ live) |
| R-02 | `/login` | — | Tĩnh (chờ live) |
| R-03 | `/signup` | ✅ **giải ẩn số (b)**: là route thật, không phải tab trong /login | Tĩnh (chờ live) |
| R-04 | `/profile` | — | Chờ |
| R-05 | `/workspace` | — | Chờ |
| R-06 | `/user-agreement` | ⚠ **KHÔNG tồn tại** trong repo (không có page). Có `/welcome`, `/legal/terms`, `/legal/privacy`, `/forgot-password` thay | Cập nhật inventory |
| R-07 | `/diagnostic` | — | Chờ |
| R-08 | `/[workspaceId]/dashboard` (+ `/schedule`, `/errors`, `/profile`) | — | Tĩnh (P0 theo video) |
| R-12 | `/[workspaceId]/admin` | — | Tĩnh (P0 — nặng nhất video) |
| R-13 | `/[workspaceId]/admin/queue` | — | Tĩnh (P0) |
| R-14 | `/[workspaceId]/admin/crm` (+ `/[id]`) | — | Tĩnh (P0) |
| R-15 | `/[workspaceId]/admin/schedule` | — | Chờ |
| R-16 | `/[workspaceId]/admin/payroll` | — | Chờ |
| R-17 | `/[workspaceId]/admin/finance` | — | Chờ |
| R-18 | `/[workspaceId]/admin/members` | ✅ **đổi tên** (05b ghi `/admin/users`) | Tĩnh (video f_0096–0098) |
| R-19 | `/[workspaceId]/admin/analytics` (+ `/staff/[userId]`) | — (route DUY NHẤT có `loading.tsx`) | Chờ |
| R-20 | `/[workspaceId]/admin/performance` | ⚠ **BIẾN MẤT** — không có page | Xoá dòng inventory |
| R-21 | `/[workspaceId]/admin/audit-log` | ✅ **giải ẩn số (c)**: đây là "Nhật ký hoạt động" | Tĩnh (f_0092–0093) |
| R-22 | `/[workspaceId]/admin/settings` | ✅ **giải ẩn số (c)**: đây là "Cài đặt Workspace" | Tĩnh (f_0101–0104) |
| — | `/[workspaceId]/admin/requests` | ✅ MỚI (Client Task Submission v2 inbox) | Chờ |
| — | `/[workspaceId]/admin/cancelled` · `client-trash` · `profile-trash` · `profile-members` | ✅ MỚI | Chờ |
| — | `/[workspaceId]` (root) · `/[workspaceId]/error.tsx` | ✅ MỚI | Chờ |
| — | **`/[workspaceId]/team/**`** (browser, folder/[id], shares, trash, asset/[assetId]) | ✅ MỚI — **module video review** (dự án riêng; chỉ chừa tab "Duyệt" theo spec, nhưng đã build) | Ghi nhận, audit nhẹ |
| ~~R-23→R-26~~ | ~~`/portal/[locale]/…`~~ | ⚠ **KHÔNG còn tồn tại** — thay bằng mô hình share-token | **Thay hẳn** |
| R-23′ | `/share/[token]` (+ layout, not-found) | ✅ Client portal MỚI (token, thay `/portal/[locale]`) | Chờ |
| R-24′ | `/r/[slug]` (guest review board) + `/r/unsubscribe` | ✅ MỚI | Chờ |
| R-25′ | `/portal-notify/unsubscribe` · `/account/trash` · `/velox-v4-preview` | ✅ MỚI (phụ) | Chờ (P3) |

### Top 10 lỗi hệ thống (ứng viên — chốt sau live pass; ≥3 route)

1. **Thiếu `min-w-0` trên flex item chứa text** → wrap 1-từ/dòng ("Bảo/Phúc", "Chào/mừng") — V2 · route: R-08, R-12, R-11, O-01 · **fix 1 chỗ:** thêm `min-w-0` vào cột flex + `truncate`/`line-clamp` cho title (pattern COMPONENT-PATTERNS).
2. **Thiếu padding-bottom bù BottomNav** → nút/nội dung cuối bị tab bar che (C-04) — V6 · R-08, R-11, R-12, R-18, R-21, R-22 · **fix 1 chỗ:** shell main `pb-[calc(64px+env(safe-area-inset-bottom)+16px)]` (QĐ-5.2).
3. **Contrast dưới floor** — `text-zinc-500/600/700` = **538** hit (G-11) — V8 · toàn app · **fix:** codemod zinc-500→zinc-400 (QĐ-4) + CI lint.
4. **Text quá nhỏ** — `text-[8–11px]` = **511** hit (G-02) — V8 · toàn app · **fix:** floor caption 12px + codemod.
5. **z-index trần / z-war** — `zIndex:` **31** + `z-[n]` **50** = 81 + "9999" 32 (G-01/G-14) — V4 · **fix:** token `--z-nav/sheet/dialog/toast` (QĐ-4/14).
6. **Bảng desktop-grid render dưới mobile** → row task vỡ dọc (f_0055) — V2/V3 · R-08, R-12, R-13, R-14 (dùng chung `NewDesktopTaskTable`/`TaskWorkflowTabs`) · **fix:** leaf dispatcher table↔card (QĐ-1) + `MobileTaskCard`.
7. **0 loading state** — chỉ **1/41** route có `loading.tsx` (G-13) — V9 · **fix:** thêm skeleton content-shaped mọi route dashboard/admin.
8. **Khóa zoom** — `maximumScale:1 + userScalable:false` còn trong `layout.tsx` (G-09) — V6/WCAG 1.4.4 · **fix:** gỡ (QĐ-5.1).
9. **≥2 bảng màu status lệch nhau** — hex trần **218** hit (G-03) + `MobileTaskCard #60a5fa` vs `NewDesktopTaskTable #3B82F6` — V10 · **fix:** single source `task-statuses.ts` (STATUS_META).
10. **Overlay bypass `dialog.tsx`** — `TaskDetailModal` tự đặt `zIndex 9999` + 2 Portal + framer tự chế → "X không bấm được, phải gõ lại URL" (O-01, lời phàn nàn #6) — V4 · **fix:** full-screen route mobile (QĐ-3c).

*(Ứng viên bổ sung: safelist Tailwind hợp pháp hóa mọi màu (G-17, V10); `grid-cols≥3` thiếu breakpoint 17 (G-07, V2); `h-screen/100vh` 19 (G-08, V6).)*

### Sai khác inventory / spec so với repo thật (mục anh yêu cầu)

- **Portal khách viết lại kiến trúc:** `/portal/[locale]/…` (R-23→R-26 trong spec) đã bị gỡ; thay bằng `/share/[token]` (client portal token) + `/r/[slug]` (guest review). Inventory + FR nhóm portal cần map lại.
- **Route admin:** `/admin/users`→`/admin/members`; `/admin/performance` biến mất; thêm audit-log (=Nhật ký R-21), settings (=Cài đặt Workspace R-22), requests, cancelled, các trash, profile-members.
- **`/user-agreement` không tồn tại** (thay bằng `/welcome` + `/legal/*`).
- **"Velox" là feature sản phẩm thật** (617 hit) — QĐ-6 giả định Velox chỉ là tên landing marketing → **không áp dụng được** "verify Velox = 0 trong src/". Cần chủ dự án quyết: giữ "Velox" làm tên tính năng nội bộ (quét/quick-create) hay đổi tên. `AgencyManager` thì gần sạch (chỉ 2 hit).
- **Repo đã ĐI TRƯỚC spec:** `next/font subsets:['latin','vietnamese']` (G-06) ĐÃ có; `viewportFit:'cover'` ĐÃ set; header `x-device-type` ĐÃ chết (chỉ còn `isMobileDevice()` cookie/UA + `AppSidebar:141 window.innerWidth<768`); `dashboard/layout.tsx` inline-style = 0 (spec nói "nhiều"). → Một số task P0.B (G-06, gỡ inline-style) đã hoàn thành sẵn, cần trừ khỏi kế hoạch.
- **Module `/team/**` (video review)** đã build đầy đủ (spec bảo chỉ chừa tab "Duyệt") — cần thống nhất phạm vi mobile cho cụm này.

---

## 2. Kết quả từng route

> Chờ live pass (screenshot 375/390/430 + JS-1→JS-8 + overlay). Các route P0 dưới đây pre-fill bằng bằng chứng frame video `04-timeline` + đọc code; sẽ bổ sung screenshot + output script sau khi đăng nhập.

### R-12 · /[workspaceId]/admin — Overview admin (tab Task) — **P0**
- Bằng chứng video: greeting vỡ 1-từ/dòng (f_0034–0042); "Bảo Phúc" quá khổ (f_0034); subtitle đè badge "49 Khách hàng" (f_0043); bảng khách 6 cột tràn + header dính "VƯỠNGTRANG" (f_0043, f_0076); "+ Thêm Khách"/thùng rác cắt mép; nested scroll bảng (f_0078); "$107,5…" cắt (f_0077); row task vỡ dọc (f_0055–0063); chip đè chip (f_0055); filter default tab 0 task (f_0053); podium ID thô + bị tab bar cắt (f_0049).
- Code: `admin/page.tsx` truyền `isMobile={await isMobileDevice()}` vào `TaskWorkflowTabs` **nhưng không đổi layout** (05a §4.1) → xác nhận nguồn row vỡ.
- Checklist C-01→C-16: **chờ live** (screenshot + JS scripts).

*(R-08, R-13, R-14, R-18, R-21, R-22, O-01 + toàn bộ còn lại: chờ live pass — block per-route table điền sau.)*

---

## 3. Component findings

| Component | File | Kết quả (code-review) | Sev. | Nhóm V |
|---|---|---|---|---|
| Button size icon | `src/components/ui/button.tsx` | `icon = h-10 w-10 = 40px < 44px` (05b §3.1) → mọi nút icon fail C-07 | P1 | V6 |
| TaskDetailModal | `src/components/tasks/TaskDetailModal.tsx` | Tự đặt `zIndex 9999` (×2), `z-[…]` (×3), bypass `dialog.tsx`, 2 Portal + framer tự chế → O-01 sập, X không bấm được | P0 | V4 |
| Dialog | `src/components/ui/dialog.tsx` | `max-w-lg = 512px > 375px` viewport → kiểm margin ngang; nhiều modal lớn bypass component này | P1 | V4 |
| Bảng màu status | `MobileTaskCard.tsx` vs `NewDesktopTaskTable.tsx` | 2 bảng hex lệch (`#60a5fa` vs `#3B82F6`); hex trần 218 hit toàn repo (G-03) | P1 | V10 |
| Root `layout.tsx` | `src/app/layout.tsx` | ✅ subset VN có · ✅ viewportFit cover · ❌ **còn maximumScale/userScalable** (zoom lock) · Toaster top-center | P1 | V6 |
| Detection | `src/lib/device.ts` + `AppSidebar.tsx:141` | `isMobileDevice()` (cookie→UA) server + `window.innerWidth<768` client (AppSidebar) = 2 nguồn; header `x-device-type` chết | (nền) | V1 |
| Tailwind safelist | `tailwind.config.ts:162` | Pattern hợp pháp hóa `bg-{mọi palette}-{mọi shade}` → vô hiệu hóa token discipline (G-17) | P2 | V10 |

*(Bổ sung sau live: Badge/chip stack, Sheet, Card glass count, Table nested-scroll, BottomNav, Input 16px, Toast safe-area, MobileTaskCard line-clamp, TaskDrawer.)*

---

## 4. Grep findings (baseline định lượng — XONG 18/18)

| Mã | Mục đích | Số kết quả | File nổi bật (top) | Nhóm V | Ghi chú |
|---|---|---|---|---|---|
| G-01 | inline zIndex + `z-[n]` | **81** (31 + 50) | TaskDetailModal, TaskCommentThread, RadialMenu(4), GuestReviewApp(3) | V4 | Kỳ vọng 0 (token z) |
| G-02 | `text-[8/9/10/11px]` | **511** / 130 file | InvoiceModal(26), FinanceDashboardClient(18), VeloxDiagnosticPanel(18), QuickCreateMode(15) | V8 | Cần lọc tay label chart hợp lệ |
| G-03 | hex màu/status trần | **218** / 54 file | NewDesktopTaskTable(21), TaskWorkflowTabs(20), UserWorkflowTabs(17), TaskDetailModal(13) | V10 | ≥2 bảng màu status |
| G-04 | tiếng Việt mất dấu hardcode | 14 / 3 file | NotificationSettings(12) | V8 | Đa số false-positive (key setting/tên biến) — lỗi mất-dấu THẬT là runtime (f_0086/0088) |
| G-05 | `normalize('NFD')` | 1 | `src/lib/utils.ts:65` | V8 | OK (util search/slug, không render) |
| G-06 | `subsets` vietnamese | **✅ ĐÃ CÓ** | `layout.tsx:17 ['latin','vietnamese']` | V8 | Repo đi trước spec |
| G-07 | `grid-cols-[3-9]` | 17 / 13 file | AdminKPIWidgets, BentoGrid, WidgetUpcomingDeadlines | V2 | Kiểm nhánh mobile tay |
| G-08 | `h-screen/100vh` | **19** / 17 file | DesktopLayoutShell(2), page.module.css(2), globals.css | V6 | Thay `min-h-dvh`/`svh` |
| G-09 | khóa zoom | **CÒN** | `layout.tsx:41-42 maximumScale:1, userScalable:false` | V6 | Gỡ (QĐ-5.1) |
| G-10 | nguồn detect mobile | **2 nguồn** | `device.ts isMobileDevice`, `AppSidebar:141 innerWidth<768`; **0 `x-device-type`** | V1 | Header đã chết (05a §2.3) |
| G-11 | `text-zinc-500/600/700` | **538** / 116 file | FinanceDashboardClient(24), AuditLogViewer(15), NotificationSettings(15), QuickCreateMode(15) | V8 | Floor = zinc-400 |
| G-12 | `leading-none` | 24 / 17 file | AdminKPIWidgets(7), FinanceDashboardClient(2) | V8 | Bỏ trên text VN |
| G-13 | `loading.tsx` | **1 / 41 route** | chỉ `admin/analytics/loading.tsx` | V9 | Gần như 0 skeleton |
| G-14 | "9999" | 32 / 23 file | RadialMenu(4), TaskDetailModal(2) | V4 | Cần lọc (một số không phải z) |
| G-15 | inline `style={{` ở dashboard layout | **0** | — | V2 | ✅ Đã sạch (spec nói "nhiều") |
| G-16 | `absolute` (mobile/) | 5 / 4 file | SwipeableCard(2), skeleton, PullToRefresh | V2 | Đa số hợp lệ (swipe/skeleton) |
| G-17 | safelist Tailwind | **CÓ (rộng)** | `tailwind.config.ts:162` pattern mọi palette×shade | V10 | Xoá sau khi xác nhận Tremor |
| G-18 | `AgencyManager` / `Velox` | AgencyManager **2** · Velox **617** | AgencyManager: email-templates, xlsx-route; Velox: velox-helpers(46), QuickCreateMode(43) | V10 | AgencyManager gần sạch; **Velox = feature thật → cần quyết định** |

---

## 5. Console / network findings

> Chờ live pass (`preview_console_logs` error+warn, `preview_network` failed) sau mỗi nhóm route. Đặc biệt soi hydration mismatch (V1 — detect lệch pha).

---

## 6. Ghi nhận ngoài phạm vi UI (không block Phase 0)

- **Session iOS (V7):** chưa test (bước 8 iPhone thật).
- **Working-tree WIP:** feature "Documents portal" (share-document-actions.ts, DocumentsSurface.tsx + sửa TeamBrowser/Cards/ListView/Toolbar/Upload, portal Sidebar/types/PortalApp/SharePortalClient, study-place FlashcardMode) đang dở — đã stash phần tracked, 2 file untracked còn lại. Không thuộc mobile-redesign.
- **`.env` = prod DB:** audit chạy read-only, không mutation.

---

## 7. Sign-off Phase 0

- [x] Inventory regenerate + 3 ẩn số giải quyết (signup route, audit-log=Nhật ký, settings=Cài đặt WS) + lệch 05b ghi rõ
- [x] 18/18 grep pattern có số baseline
- [ ] 100% route (R-01→…) audit trên 3 viewport — **CHỜ live pass (credentials)**
- [ ] 100% overlay O-01→O-07 test C-10 — **CHỜ live pass**
- [ ] Screenshot 390/route + đáy + overlay — **CHỜ live pass**
- [x] Top 10 lỗi hệ thống (ứng viên) đã viết — chốt sau live pass
- [ ] Console findings — **CHỜ live pass**
- [x] Không thay đổi tracked trong `src/` trên `audit/phase-0` (git diff src/ rỗng; 2 file untracked pre-existing đã ghi chú)
