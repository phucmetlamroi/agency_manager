# HustlyTasker — Bản mô tả hệ thống chi tiết

> **Tài liệu Kỹ thuật + Sản phẩm**
> Phiên bản tài liệu: 1.0 · Cập nhật: 2026-05-30
> Mã nội bộ: `blazing-station` v0.1.4 · Thương hiệu: **HustlyTasker** · Domain: `hustlytasker.xyz`

---

## Mục lục

1. [Giới thiệu sản phẩm](#1-giới-thiệu-sản-phẩm)
2. [Kiến trúc tổng thể](#2-kiến-trúc-tổng-thể)
3. [Mô hình đa người thuê (Multi-tenancy)](#3-mô-hình-đa-người-thuê-multi-tenancy)
4. [Xác thực & Phân quyền](#4-xác-thực--phân-quyền)
5. [Mô hình dữ liệu](#5-mô-hình-dữ-liệu)
6. [Các phân hệ chức năng](#6-các-phân-hệ-chức-năng)
7. [Hệ thống thiết kế (Design System)](#7-hệ-thống-thiết-kế-design-system)
8. [Nền tảng vận hành & Tự động hóa](#8-nền-tảng-vận-hành--tự-động-hóa)
9. [Bảo mật](#9-bảo-mật)
10. [Đóng gói đa nền tảng (Web · MCP · Desktop)](#10-đóng-gói-đa-nền-tảng-web--mcp--desktop)
11. [Lộ trình & Tính năng Pro](#11-lộ-trình--tính-năng-pro)

---

## 1. Giới thiệu sản phẩm

**HustlyTasker** là một nền tảng SaaS **quản lý công việc chuyên biệt cho agency dựng video** (video production / talking-head). Khác với các công cụ quản lý task tổng quát (Asana, Trello, Monday), HustlyTasker được thiết kế quanh đúng quy trình sản xuất video của agency: nhận footage thô → phân loại → giao editor → revision → sửa frame → bàn giao → tính tiền khách (USD) → trả lương nhân sự (VND).

### Bài toán giải quyết
- **Khối lượng task lớn, lặp lại theo tháng**: mỗi tháng agency tạo lại hàng trăm task cho cùng nhóm khách hàng. HustlyTasker tự động hóa khâu này bằng **Velox** (quét folder cloud → tạo task hàng loạt) và **sao chép khách hàng giữa workspace**.
- **Hai luồng tiền tệ song song**: khách trả USD, nhân sự nhận lương VND. Hệ thống chốt **tỷ giá tại thời điểm tạo task** và tách bạch định giá khách (`jobPriceUSD`) với chi phí nhân công (`wageVND`).
- **Vòng đời task đặc thù ngành**: trạng thái như *Revision*, *Sửa frame*, *Gửi lại* — không có trong tool generic.
- **Minh bạch với khách**: Client Portal đa ngôn ngữ cho khách tự xem tiến độ, hóa đơn, đánh giá chất lượng.

### Đối tượng người dùng
| Vai trò | Mô tả |
|---|---|
| **Chủ agency / Quản lý (Admin/Owner)** | Tạo workspace theo tháng, định giá, giao task, duyệt lương, xem analytics. |
| **Editor / Nhân sự (User/Member)** | Nhận task (được giao hoặc tự claim ở Marketplace), cập nhật trạng thái, bàn giao. |
| **Khách hàng (Client)** | Truy cập Client Portal (giới hạn) để theo dõi task, xem hóa đơn, đánh giá. |
| **Thủ quỹ (Treasurer)** | Cờ quyền riêng để xác nhận thanh toán lương. |

---

## 2. Kiến trúc tổng thể

### 2.1 Stack công nghệ

| Lớp | Công nghệ | Phiên bản |
|---|---|---|
| **Framework** | Next.js (App Router, RSC, Server Actions, `output: standalone`) | 16.1.6 |
| **UI runtime** | React | 19.2.3 |
| **Ngôn ngữ** | TypeScript (strict) | 5.x |
| **Database** | PostgreSQL (Neon serverless) | — |
| **ORM** | Prisma + `@prisma/adapter-neon` (preview `driverAdapters`) | 5.22.0 |
| **Xác thực** | JWT tự quản qua `jose` + cookie httpOnly | 6.1.3 |
| **Hashing** | `bcryptjs` (cost 12) | 3.0.3 |
| **CSS** | TailwindCSS + `tailwindcss-animate` + typography | 3.4.17 |
| **Animation** | Framer Motion | 12.38.0 |
| **UI primitives** | Radix UI (dialog, dropdown, popover, select, switch, tooltip…) | — |
| **Icon** | `lucide-react` | 0.563.0 |
| **Toast** | `sonner` | 2.0.7 |
| **Bảng dữ liệu** | `@tanstack/react-table` | 8.21.3 |
| **Biểu đồ** | `@tremor/react`, `recharts` | — |
| **Kéo-thả / Lưới** | `@dnd-kit/*`, `react-grid-layout` | — |
| **Realtime** | `@supabase/supabase-js` (+ `ws`) | 2.105.3 |
| **Email** | `resend` | 6.12.3 |
| **Rate-limit / Bot** | `@upstash/ratelimit` + `@upstash/redis`, `botid` (Vercel BotID) | — |
| **Validation** | `zod` | 3.23.8 |
| **Rich text** | TipTap (`@tiptap/*`) + `handlebars` + `isomorphic-dompurify` | — |
| **Đa ngôn ngữ** | `next-intl` | 4.8.3 |
| **Media / AI** | `sharp`, ffmpeg, `puppeteer-core` + `@sparticuz/chromium`, `@zxing` (QR), `@vercel/blob`, `@google/generative-ai` (Gemini), `openai`, `exceljs` | — |

### 2.2 Mô hình thực thi

- **Server Components + Server Actions** là xương sống: phần lớn nghiệp vụ chạy qua **45+ server actions** trong `src/actions/`, không phải REST API truyền thống. API routes (`src/app/api/`) chỉ dùng cho OAuth callback, cron, webhook, integrations, export file.
- **Render**: Mặc định RSC; component tương tác gắn `"use client"`. Layout lồng nhau theo route group.
- **Triết lý Optimistic UI**: tương tác (đổi trạng thái, tick chọn…) phản hồi tức thì ở client (`useState`/`useOptimistic`) trước khi server xác nhận, đúng tinh thần "không chờ server mới đổi UI".

### 2.3 Sơ đồ phân lớp (rút gọn)

```
┌─────────────────────────────────────────────────────────┐
│  Client (React 19 + Framer Motion + Tailwind glass UI)   │
│  · Admin Shell · User Dashboard · Client Portal (i18n)   │
└───────────────┬─────────────────────────────────────────┘
                │ Server Actions / fetch
┌───────────────▼─────────────────────────────────────────┐
│  Next.js 16 (App Router · RSC · middleware auth guard)   │
│  · 45+ server actions · API routes (oauth/cron/webhook)  │
└───────────────┬─────────────────────────────────────────┘
        ┌───────┼───────────┬───────────────┬─────────────┐
        ▼       ▼           ▼               ▼             ▼
   getWorkspacePrisma   Supabase       Resend        Upstash
   (Prisma + Neon)      Realtime       (email)       (rate-limit)
        │                  │              │              │
        ▼                  ▼              ▼              ▼
   PostgreSQL          Notification    Digest         BotID
   (multi-tenant)      broadcast       cron           (Vercel)
```

---

## 3. Mô hình đa người thuê (Multi-tenancy)

Hệ thống cô lập dữ liệu theo **2 tầng**:

```
Profile (tổ chức / agency)
  ├── User[]                       (thành viên của profile)
  ├── ProfileAccess[]              (quyền: OWNER / ADMIN / USER)
  └── Workspace[]                  (thường = 1 tháng làm việc)
        ├── WorkspaceMember[]      (ai trong workspace + vai trò)
        ├── Task[]      ─┐
        ├── Client[]     │  tất cả mang
        ├── Project[]    ├─ workspaceId + profileId
        ├── Invoice[]    │  (cô lập tuyệt đối)
        ├── Payroll[]   ─┘
        └── PricingRule[], Schedule…, Tag…, ErrorLog…
```

### 3.1 Cơ chế cô lập — `getWorkspacePrisma(workspaceId, profileId)`
- Bọc Prisma Client, **tự động chèn `workspaceId` (và `profileId`)** vào mọi `where` khi đọc và mọi `data` khi tạo → không thể vô tình truy vấn xuyên workspace.
- **Danh sách bypass** (model toàn cục, không lọc workspace): `Profile`, `User`, `Workspace`, `WorkspaceMember`, `BillingProfile`, `ErrorDictionary`, `Contact`…
- Trường hợp đặc biệt `User`: cho phép truy cập qua `profileId` **hoặc** `profileAccesses` (hỗ trợ truy cập chéo profile).

### 3.2 Đặc thù: Client tái tạo theo workspace
Vì `Client` gắn `workspaceId`, **mỗi workspace (tháng) mới phải tạo lại khách hàng** — cùng tên "Jacob" ở 2 tháng sẽ có **2 client id khác nhau**. Đây là lý do tồn tại 2 tính năng bù trừ:
- **Sao chép khách hàng giữa workspace** (clone cây cha/con + bảng giá) khi tạo workspace mới.
- **Kế thừa ghi chú theo "đường dẫn tên" (name-path)** thay vì theo id — xem [§6.3](#63-velox--deep-scan-v31).

---

## 4. Xác thực & Phân quyền

### 4.1 Phương thức đăng nhập
| Phương thức | Mô tả |
|---|---|
| **Email + mật khẩu** | Đăng ký có honeypot + BotID + rate-limit theo IP/email, kiểm tra mật khẩu lộ (HIBP), hash bcrypt cost 12, xác minh email qua token (TTL 24h). Phản hồi có **padding thời gian ~600ms** chống dò tài khoản (timing attack). |
| **Google Sign-In (OAuth)** | Luồng `authorize → consent → callback`: đổi code lấy token, **bắt buộc `verified_email`**, sau đó **liên kết theo email đã xác minh** (đã có tài khoản → gắn `googleId`; chưa có → tạo mới, `password = null`, `emailVerified = true`, cấp username tạm → buộc qua **Username Migration Modal**). |
| **Quên / Đặt lại mật khẩu** | 3 bước: yêu cầu OTP → xác minh OTP (hash SHA-256, TTL 10', tối đa 5 lần) → đặt lại bằng reset-token (hash 32-byte, TTL 5', dùng một lần). Đặt lại xong **tăng `sessionVersion`** để vô hiệu mọi JWT cũ. |
| **Email Migration** | Cho user cũ (username tiếng Việt, chưa có email) gắn email qua OTP, cập nhật nguyên tử + audit. |
| **Impersonation** | Chỉ ADMIN toàn cục, ghi audit `auth.impersonation_started/ended`, hiển thị banner. |

Session là **JWT ký bằng `jose`**, lưu trong cookie `session` httpOnly (`secure` ở production, tắt khi build Electron desktop).

### 4.2 RBAC — 3 chiều quyền
1. **`User.userRole`** (toàn cục): `ADMIN` · `USER` · `AGENCY_ADMIN` · `CLIENT` · `LOCKED`.
   - `CLIENT` bị khóa cứng chỉ vào `/portal/*`; `LOCKED` khi sai mật khẩu ≥5 lần/15'.
2. **`ProfileAccess.role`** (cấp tổ chức): `OWNER` · `ADMIN` · `USER`.
   - **OWNER**: toàn quyền profile, ngầm là chủ **mọi** workspace trong profile.
   - **ADMIN**: tạo workspace + mời người; truy cập workspace có `createdAt ≥ grantedAt`.
   - **USER**: mặc định chỉ đọc.
3. **`WorkspaceMember.role`** (cấp workspace): `OWNER` · `ADMIN` · `MEMBER`.

### 4.3 Cổng kiểm soát — `verifyWorkspaceAccess(workspaceId, requiredRole)`
Chống **BOLA/IDOR**: xác thực session → kiểm tra user còn hoạt động → workspace tồn tại → xét đường truy cập (Profile OWNER → Profile ADMIN trong khung thời gian → bản ghi WorkspaceMember tường minh → nếu không có → `SECURITY_VIOLATION`). Trả về `{ session, user, userId, workspaceRole, profileRole }`, có cache theo request để khử truy vấn lặp.

---

## 5. Mô hình dữ liệu

Khoảng **35+ model** Prisma. Bảng dưới liệt kê các model cốt lõi (rút gọn):

| Model | Mục đích | Trường tiêu biểu |
|---|---|---|
| **Profile** | Tổ chức/agency | `name`, `logoUrl`, `status`, `deletedAt`, `hardDeleteAfter` |
| **User** | Tài khoản | `username` (unique), `password?`, `googleId?` (unique), `authProvider`, `email?`, `userRole`, `sessionVersion`, `isTreasurer` |
| **ProfileAccess** | Quyền cấp profile | `userId`, `profileId`, `role`, `grantedAt` (unique cặp) |
| **Workspace** | Không gian (tháng) làm việc | `profileId?`, `name`, `marketplaceOpen`, `status` (`ACTIVE/SUSPENDED/SOFT_DELETED`) |
| **WorkspaceMember** | Thành viên workspace | `userId`, `workspaceId`, `role` (unique cặp) |
| **Task** | Công việc | `title`, `status`, `assigneeId?`, `assignedById?`, `clientId?`, `projectId?`, `invoiceId?`, `jobPriceUSD`, `wageVND`, `deadline`, `claimSource`, `isArchived` |
| **Client** | Khách hàng | `id` (int), `name`, **`parentId?`** (self-relation cha/con), `tier`, `aiScore`, `frictionIndex`, `depositBalance` |
| **Project** | Dự án của khách | `name`, `clientId`, `code?` |
| **Invoice** / **InvoiceItem** | Hóa đơn | `invoiceNumber` (unique), `status`, `subtotalAmount`, `taxPercent`, `totalDue`, `billingSnapshot` (JSON) |
| **PricingRule** | Quy tắc định giá | `clientId?` (null = mặc định workspace), `ruleType`, `config` (JSON), `isDefault`, `sortOrder` |
| **Payroll** / **MonthlyBonus** / **PayrollLock** | Lương & thưởng | khóa theo `(userId, month, year, workspaceId)`; lock kỳ lương |
| **PerformanceMetric** / **MonthlyRank** | Đánh giá hiệu suất | `score`, `rank` (`S/A/B/C/D/UNRANKED`), `onTimeRate` |
| **ErrorDictionary** / **ErrorLog** | Từ điển lỗi + log phạt | `code`, `severity` (1-3), `penalty`, `calculatedScore` |
| **Notification** / **NotificationPreference** | Thông báo | `type`, `isRead`, `emailSentAt?`; `emailDigestMode`, `quietHours` |
| **AuditLog** | Nhật ký kiểm toán | `action`, `actorUserId?`, `beforeData`/`afterData` (JSON), append-only (`BigInt` id) |
| **IntegrationToken** | Token OAuth cloud | `provider` (`dropbox`/`google_drive`), `accessToken`/`refreshToken` **mã hóa AES-256-GCM** |
| **ScheduleRule** / **ScheduleException** / **DailyAvailability** | Lịch khả dụng | theo `dayOfWeek`, ngoại lệ `BLOCK/ADD`, ô khả dụng 24 slot |
| **WorkspaceInvitation** | Lời mời | `token` (unique), `status`, `expiresAt` (14 ngày) |
| **EmailVerificationToken** / **PasswordResetOTP** / **LoginAttempt** | Hạ tầng auth | lưu **hash** (SHA-256), không lưu plaintext |

### Enum quan trọng
- **UserRole**: `ADMIN, USER, AGENCY_ADMIN, CLIENT, LOCKED`
- **ProfileRole**: `OWNER, ADMIN, USER`
- **ClientTier**: `DIAMOND, GOLD, SILVER, WARNING, standard`
- **InvoiceStatus**: `DRAFT, SENT, PAID, OVERDUE, VOID`
- **ClaimSource**: `ADMIN, MARKET`
- **NotificationType**: nhóm task (`TASK_ASSIGNED, TASK_STATUS_CHANGED, TASK_DEADLINE_APPROACHING, TASK_OVERDUE, TASK_STARTED, TASK_DELIVERED…`) + workspace invitation.

### Đặc điểm kỹ thuật
- **Khóa chính**: UUID (Profile/User/Workspace/Task/Invoice…), `int autoincrement` (Client/Project), `BigInt` (AuditLog), `cuid` (Session/Event/Rating).
- **Soft-delete + hard-delete**: Profile & Workspace xóa mềm ngay, **cron xóa cứng sau 30 ngày**.
- **Mã hóa**: token tích hợp cloud mã hóa AES-256-GCM (`INTEGRATION_TOKEN_SECRET`).
- *Lưu ý lịch sử*: các model chat (Conversation/Message…) **đã được gỡ bỏ hoàn toàn**; hệ thống notification vẫn hoạt động độc lập.

---

## 6. Các phân hệ chức năng

### 6.1 Vòng đời Task (FSM)
- **Danh sách trạng thái chuẩn (canonical)**: `Đang đợi giao` → `Nhận task` → `Đã nhận` → `Đang thực hiện` → `Revision` → `Sửa frame` → `Gửi lại` → `Tạm ngưng` → `Quá hạn` → `Hoàn tất` → `Đã hủy`.
- **Máy trạng thái (FSM)**: `validateTransition` chỉ cho phép chuyển hợp lệ; **guard chống trạng thái legacy** (chặn bug "trạng thái biến mất").
- **Bất biến (invariants)**: ràng buộc `status ↔ assignee` (vd task chưa nhận thì không có người làm) và `status ↔ deadline`.
- Mọi thay đổi → **audit log** + **thông báo** cho assignee/người giao + định tuyến email.

### 6.2 Task Marketplace (claim/return)
- Admin **bật/tắt marketplace** cho workspace (`toggleMarketplace`). Khi mở, editor có thể **tự nhận (claim)** task chưa giao và **trả (return)** nếu không làm; nguồn nhận ghi nhận qua `claimSource` (`ADMIN` vs `MARKET`).
- Có **bulk operations**: tạo hàng loạt, gán/đổi trạng thái/sửa chi tiết nhiều task cùng lúc, chế độ `skipInvalid` + bản đồ lỗi theo dòng.

### 6.3 Velox — Deep Scan v3.1
Tự động hóa khâu tạo task từ footage cloud:
1. **Kết nối** Dropbox / Google Drive (OAuth, token mã hóa).
2. **Quét đệ quy** folder (`recursiveScanFolder`) → kiểm kê file.
3. **Phân loại 7 chiều** + ma trận mẫu **P1–P7** (detect wrapper folder, ghép cặp main/b-roll, script/brief/phụ đề, độ dài, giá…) kèm **điểm tin cậy + lý giải**.
4. **Tạo task hàng loạt** từ metadata (tiêu đề, loại, `jobPriceUSD`, `wageVND`, client, assignee, deadline, resource/reference) + **chốt tỷ giá** tại thời điểm tạo.
5. **Kế thừa ghi chú** (`getLastClientNote`): khớp khách theo **đường dẫn tên phân cấp** (vd `Jacob` ≠ `Jacob/Unit`), gom ghi chú từ **mọi workspace đang hoạt động trong profile** — giải quyết đúng vấn đề "client id đổi theo tháng".
6. **Gợi ý round-robin** cân bằng khối lượng giữa các editor.

### 6.4 CRM / Khách hàng
- **Cây khách hàng cha/con** (`parentId`): hiển thị đường dẫn `Cha/Con`, gộp/tách (`mergeClientIntoParent`/`unmergeClient`).
- **Phân hạng** (`tier`) + chỉ số `aiScore`, `frictionIndex`, số dư đặt cọc (`depositBalance`).
- **Sao chép khách hàng giữa workspace**: khi tạo workspace mới, tick chọn nguồn → **checklist cây khách** (mặc định chọn hết, liên kết cha/con) → clone 2 pha (tạo rồi remap `parentId`) + tùy chọn copy bảng giá. Tự kèm tổ tiên để không tạo orphan.

### 6.5 Tài chính (dual-currency USD/VND)
- **Engine định giá `PricingRule`**: kiểu `flat` · `per_minute` · `tiered_duration` · `custom`, gắn **theo từng khách** hoặc **mặc định workspace** (`clientId = null`).
- **Hóa đơn**: lấy task chưa xuất → tính preview (subtotal + thuế + trừ cọc) → tạo `Invoice` có **snapshot thông tin thanh toán**; xuất PDF tải về; trạng thái `DRAFT/SENT/PAID/OVERDUE/VOID`.
- **Tỷ giá**: snapshot USD↔VND khi tạo task để con số không trôi theo thời gian.

### 6.6 Payroll & Hiệu suất
- **Lương tháng**: tổng hợp theo `(user, tháng, năm, workspace)`, xác nhận thanh toán → **khóa kỳ** qua `PayrollLock` (đã khóa thì **không thể đảo ngược**); thưởng tháng (`MonthlyBonus`).
- **Hiệu suất**: `PerformanceMetric` (doanh thu, thời gian hoàn thành TB, tỉ lệ đúng hạn) → **xếp hạng S/A/B/C/D**; **từ điển lỗi** + log phạt theo `severity/penalty`.

### 6.7 Thông báo (Notifications)
- **In-app**: chuông + panel, **realtime qua Supabase** (kênh `user:${userId}`, sự kiện `NOTIFICATION_NEW`).
- **Email**: gửi fire-and-forget sau khi tạo, có **registry template** (task assigned/status/deadline 24h-1h/overdue, auth, invitation…).
- **Digest**: cron gom theo chế độ **REALTIME / HOURLY / DAILY / OFF**, tôn trọng **giờ yên lặng (quiet hours)** và tùy chọn người dùng; một số sự kiện được cấu hình **bypass** mute/digest/quiet-hours.

### 6.8 Client Portal (đa ngôn ngữ)
- Route công khai `/portal/[locale]/[workspaceId]/…` cho **vai trò CLIENT** (middleware khóa chỉ portal).
- Khách xem **task + chi tiết**, **hóa đơn**, và **đánh giá chất lượng** (creative/responsiveness/communication).
- Giao diện riêng (glass sidebar, badge trạng thái có hiệu ứng) + **chuyển ngôn ngữ** (5 thứ tiếng).

### 6.9 Lịch & Khả dụng
- `ScheduleRule` (giờ làm theo thứ) + `ScheduleException` (`BLOCK`/`ADD`) + `DailyAvailability` (24 slot) → ma trận khả dụng cho admin xếp việc.

### 6.10 Analytics, Audit, Tracking
- **Analytics**: KPI workspace, chi tiết lỗi/điểm hiệu suất theo nhân viên, leaderboard.
- **Audit Log**: append-only, **20+ loại action** (`workspace.*`, `member.*`, `auth.*`, `payroll.*`, `data.*`, gồm `workspace.clients_cloned`), không bao giờ throw làm hỏng luồng chính.
- **Tracking/Presence**: phiên + sự kiện + heartbeat trạng thái online/away (`UserPresence`).

### 6.11 Tích hợp ngoài
- **Dropbox** & **Google Drive** OAuth (phục vụ Velox), token mã hóa, tự refresh khi hết hạn, revoke khi ngắt kết nối.
- **Calendar webhook** (đồng bộ lịch), **Google/Microsoft calendar** (qua biến môi trường).

---

## 7. Hệ thống thiết kế (Design System)

### 7.1 Ngôn ngữ thị giác — *Dark Glassmorphism / Neon Purple*
| Token | Giá trị |
|---|---|
| Nền sâu | `#050505` (gần đen tuyệt đối) |
| Surface / Card | `#0A0A0A` – `#121016` (ám tím nhẹ) |
| **Nhấn chính (neon)** | `#8B5CF6` (violet) |
| Nhấn glow | `#A855F7` |
| Tím sẫm (accent) | `#4C1D95` |
| Chữ chính / phụ | `#FFFFFF` / `#A1A1AA` |
| Bo góc gốc | `--radius: 0.75rem` (12px) |

- **Lớp kính** `.glass-panel`: `bg-zinc-950/40 backdrop-blur-md border border-white/5 rounded-xl shadow-xl`.
- **Viền siêu mảnh**: `border-white/5–10` hoặc `rgba(139,92,246,0.15)`; **đổ bóng đa tầng** `shadow-xl shadow-black/40` + glow tím dịu; ambient glow `blur-3xl` sau widget.
- **Cấm giao diện "phẳng"**: mọi card/row đều có gradient chìm + viền tinh tế + phản hồi hover.

### 7.2 Typography
- **Một font duy nhất: Plus Jakarta Sans** (nạp qua `next/font/google`, biến `--font-sans`, weight 300–800).
- Phân cấp bằng **font-weight**, không đổi family: `page-title` 30px/700 (gradient text), `section-title` 20px/600, body 400.

### 7.3 Chuyển động (Motion)
- **Framer Motion**: vào trang `opacity 0→1 + y 12→0`, ~300ms, easing `[0.4,0,0.2,1]`; **stagger** 100ms cho lưới bento; menu **radial spring** `stiffness 380 / damping 26`.
- **Micro-animation CSS** cho badge portal: breathe / scan-line / urgency double-pulse / icon-spin / settle afterglow; skeleton shimmer khi loading.
- Tiêu chuẩn tương tác: phản hồi mượt **150–200ms** cho hover/click/scroll.

### 7.4 Thư viện UI & cấu trúc component
- **Icon** `lucide-react`; **toast** `sonner` (dark, top-center, richColors); **command menu** `cmdk`; **drawer** `vaul`; **bảng** TanStack Table; **biểu đồ** Tremor/Recharts.
- `src/components/` chia theo miền: `ui/` (primitive Radix), `layout/` (AdminShell, MobileLayoutShell, CommandMenu), `dashboard/` (BentoGrid, KPIStats), `tasks/`, `marketplace/`, `crm/`, `invoice/`, `schedule/`, `portal/` (widget khách), `radial-nav/` (menu cử chỉ tròn), `notifications/`, `workspace/`, `mobile/`, `auth/`, `tracking/`.

### 7.5 Đa ngôn ngữ
- **`next-intl`**, file dịch `messages/*.json`: **English, Tiếng Việt, Русский, Italiano, 中文** (5 ngôn ngữ); routing theo `[locale]` trong Client Portal.

### 7.6 Thương hiệu
- **HustlyTasker** — logo chữ **H+T**. Favicon là **phiên bản âm bản**: glyph trắng trong vòng tròn đen (`src/app/icon.svg`, 512×512), kiểu Vercel.
- Metadata mô tả: *"Quản lý task chuyên biệt cho agency dựng video — task lifecycle, dual-currency payroll, Velox auto-batch."* + cấu hình PWA (`black-translucent`, viewport-fit cover).

---

## 8. Nền tảng vận hành & Tự động hóa

### 8.1 Cron jobs (Vercel)
| Path | Lịch | Chức năng |
|---|---|---|
| `/api/cron/send-digest` | `0 * * * *` (mỗi giờ) | Gửi email digest |
| `/api/cron/check-deadline` | `0 * * * *` | Quét task sắp/đã quá hạn |
| `/api/cron/cleanup-notifications` | `0 2 * * *` | Dọn thông báo cũ |
| `/api/cron/hard-delete-workspaces` | `0 3 * * *` | Xóa cứng workspace quá 30 ngày |
| `/api/cron/hard-delete-profiles` | `30 3 * * *` | Xóa cứng profile quá 30 ngày |
| `/api/cron/auth-cleanup` | `0 4 * * *` | Xóa token/OTP hết hạn |

Cron được bảo vệ bằng `CRON_SECRET`.

### 8.2 Middleware
Bỏ qua static/asset → chặn path deprecated (`/download`, `/extract`) → **auth guard** cookie `session` cho `/portal`, `/admin`, `/dashboard` → **định tuyến theo role** (`CLIENT` → khóa `/portal`) → kiểm tra `sessionProfileId` cho khu admin/dashboard → trích **locale** cho portal → set cookie tracking phiên.

### 8.3 Email & Realtime
- **Resend** gửi transactional (verify, reset, invitation) + notification + digest; người gửi mặc định `notification@hustlytasker.xyz` / "HustlyTasker".
- **Supabase Realtime** broadcast thông báo tức thời (không dùng cho chat — chat đã gỡ).

### 8.4 Cấu hình hạ tầng
- `next.config.ts`: `output: standalone`, remote image `*.blob.vercel-storage.com`, external packages cho ffmpeg/chromium, **security headers** (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy), tích hợp BotID + next-intl.
- Biến môi trường nhóm theo: DB (`DATABASE_URL`/`JWT_SECRET`), Email (`RESEND_*`, `CRON_SECRET`), Supabase, Upstash, Google/Microsoft OAuth, AI (`GPT4_API_KEY`), mã hóa (`INTEGRATION_TOKEN_SECRET`), MCP (`MCP_*`), cờ build (`ELECTRON_DESKTOP`).

---

## 9. Bảo mật

- **Mật khẩu**: bcrypt cost 12, kiểm tra HIBP (mật khẩu lộ), thước đo độ mạnh ở client.
- **Chống lạm dụng**: Upstash rate-limit (IP/email), honeypot, **Vercel BotID** (passive), khóa tài khoản sau 5 lần sai/15'.
- **Chống dò tài khoản**: padding thời gian phản hồi ~600ms ở luồng đăng ký/đăng nhập.
- **Phiên**: JWT `jose` httpOnly; `sessionVersion` để thu hồi hàng loạt khi đổi mật khẩu/email.
- **Cô lập tenant**: `getWorkspacePrisma` auto-inject + `verifyWorkspaceAccess` chống BOLA/IDOR.
- **Token tích hợp**: mã hóa AES-256-GCM; OTP/verify-token lưu hash SHA-256.
- **Audit append-only** + **soft-delete có thời gian ân hạn 30 ngày** trước khi xóa cứng.
- **Headers**: CSP và nhóm security header ở tầng `next.config`.
- **Chống email rác**: chặn domain email dùng-một-lần.

---

## 10. Đóng gói đa nền tảng (Web · MCP · Desktop)

Cùng một codebase hỗ trợ 3 hình thái build:
1. **Web** (`next build`) — sản phẩm chính, deploy Vercel.
2. **MCP Server** (`build:mcp`) — bộ công cụ quản lý task qua giao thức MCP (tạo/giao/đổi trạng thái/claim/marketplace…), giới hạn theo `MCP_PROFILE_ID` / `MCP_WORKSPACE_IDS`, dùng để tự động hóa bằng agent.
3. **Desktop (Electron)** (`build:desktop`, cờ `ELECTRON_DESKTOP=1`) — đóng gói `.exe`, dùng lại toàn bộ chức năng web (cookie session tắt `secure` cho môi trường desktop).

---

## 11. Lộ trình & Tính năng Pro

> Các hạng mục dưới đây đã có nền tảng kỹ thuật hoặc nằm trong kế hoạch thương mại hóa.

- **Gói Pro (thu phí) dự kiến** gồm:
  - **Velox Deep Scan** (quét cloud → tạo task hàng loạt).
  - **Sao chép khách hàng giữa workspace** (đã chừa sẵn *seam* `requireProFeature` trong `copyClientsToWorkspace`).
  - Hệ thống subscription/tier **chưa dựng** — các điểm gate đã đánh dấu sẵn để bật khi cần.
- **Mobile**: khuyến nghị hướng **PWA-first** (đã cấu hình metadata app-like, viewport, status bar) trước khi cân nhắc đóng gói store iOS/Android.
- **Desktop**: pipeline Electron đã sẵn sàng để phát hành bản cài `.exe`.

---

*Tài liệu này mô tả ảnh chụp hệ thống tại thời điểm cập nhật. Mọi thay đổi về schema, server action hoặc design token nên được phản ánh lại ở đây để giữ tính chính xác.*
