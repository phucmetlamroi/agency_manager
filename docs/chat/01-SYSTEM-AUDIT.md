# BÁO CÁO AUDIT HỆ THỐNG HUSTLYTASKER

> **Giai đoạn 1 (GĐ1)** của đặc tả `HUSTLYTASKER-CHAT-SPEC.md` — kiểu AUDIT-FIRST.
> Đây là bước **chỉ đọc, không sửa code**. Mục tiêu: hiểu hệ thống đủ sâu để GĐ2 "may đo" đúng.
> Ngày lập: **2026-07-02** · Nhánh: `claude/cranky-austin` · Phương pháp: 5 agent đọc song song toàn bộ `src/`, `prisma/`, cấu hình, git log; mọi kết luận có dẫn chiếu file/dòng.

---

## 1. Tóm tắt cho chủ dự án

*(10–15 dòng, không thuật ngữ — đọc phần này là đủ nắm bức tranh lớn.)*

1. HustlyTasker là một web Next.js hiện đại, chạy trên Vercel, dữ liệu để ở Neon (Postgres). Nó **đã có sẵn rất nhiều thứ mà tài liệu chat yêu cầu** — không phải xây từ số 0.
2. Cụ thể: mỗi **task đã có sẵn một luồng bình luận kiểu ClickUp** (gõ bình luận, @nhắc tên, sửa/xoá, thả cảm xúc emoji, trả lời theo luồng), hiển thị ngay trong bảng chi tiết task. Cả **nhân viên (bản tối)** lẫn **khách qua link chia sẻ (bản sáng)** đều dùng được.
3. Hệ thống **thông báo** (chuông + email + đẩy trình duyệt) đã hoàn chỉnh và đang chạy. Khách hàng bình luận → quản lý được báo ngay.
4. **Realtime** (tin mới tự hiện không cần tải lại) đã có, dùng dịch vụ Supabase — **đang trả tiền sẵn**, nên bật thêm cho chat **không tốn thêm chi phí**.
5. Việc **cách ly khách hàng** (khách không bao giờ thấy editor là ai, không thấy lương/lợi nhuận, không thấy bình luận nội bộ) đã được làm rất kỹ và có kiểm toán bảo mật.
6. Quan trọng — cần nói thẳng: dự án **đã từng xây một hệ thống chat đầy đủ kiểu Discord** (kênh, tin nhắn, vai trò, gọi video) rồi **gỡ bỏ hoàn toàn** ngày 07/06 vì nó *"không ổn định và làm loãng app"*. Tài liệu chat lần này yêu cầu quay lại xây **kênh trao đổi theo dự án + tin nhắn riêng** — tức là đụng lại đúng vùng đã gỡ. Đây là điểm cần anh quyết định rõ.
7. Do đó phần "bình luận trên task" (GĐ3 trong lộ trình) coi như **đã xong ~70–80%** — chỉ cần bổ sung vài tính năng (giao việc/đánh dấu-đã-xử-lý, trang "Việc được giao", copy link, tìm kiếm). Còn phần "kênh dự án + tin nhắn riêng" (GĐ4–5) mới thực sự là **xây mới**.
8. **Không có tính năng AI nào** cần lo — hệ thống có vài chỗ dùng AI (dịch ghi chú) nhưng phần chat không đụng tới; sẽ giữ đúng luật "không AI".
9. **Không cần thêm dịch vụ trả phí mới.** Mọi mảnh ghép (database, realtime, email, lưu file) đều đã có sẵn và đủ dùng.
10. Rủi ro lớn nhất **không phải kỹ thuật** mà là **phạm vi**: tài liệu chat là một dự án nhiều tuần (6 giai đoạn có cửa duyệt), trong khi trial của anh Trung Nghĩa (hạn **Thứ Bảy 04/07**) chỉ còn 2 ngày. Trial đã được luồng bình luận-trên-task hiện có phục vụ đủ; **chat đầy đủ là một hướng làm sau trial**, không kịp và không nên gấp trong 2 ngày.
11. Kết luận: nền tảng cực kỳ thuận lợi để làm chat. Việc cần anh chốt ở CHECKPOINT 1 nằm ở **mục 9** bên dưới (đặc biệt: có tái lập "kênh" không, và thứ tự ưu tiên).

---

## 2. Stack & kiến trúc *(checklist A, H)*

### 2.1 Tổng quan
| Hạng mục | Hiện trạng | Dẫn chiếu |
|---|---|---|
| Framework | **Next.js 16.1.6** (App Router), **React 19.2.3**, **TypeScript 5** (strict) | `package.json` |
| Build | `next build --webpack` (cố tình dùng Webpack, **không** Turbopack — né bug Next 16) | `package.json` scripts; `next.config.ts` |
| Backend | **Monolith** — không tách service. Logic chạy bằng **Server Actions** (`src/actions/*.ts`, ~30 file `'use server'`) + một ít **API route** (`src/app/api/**`) cho auth/cron/webhook | `src/actions/`, `src/app/api/` |
| ORM / DB | **Prisma 5.22** + **PostgreSQL** trên **Neon** (serverless, adapter `@prisma/adapter-neon`) | `prisma/schema.prisma:6-8` |
| Lấy dữ liệu | **Chỉ Server Actions** — KHÔNG React Query, KHÔNG SWR, KHÔNG fetch thuần. Client gọi thẳng action, dùng `revalidatePath()` | `src/actions/task-actions.ts` |

### 2.2 Frontend (mục H — rất quan trọng cho chat)
- **UI library**: Radix UI primitives (Dialog, Dropdown, Popover, Select, Avatar, Tooltip…) + pattern **shadcn/ui** (CVA + clsx) + **TailwindCSS 3.4**. Animation: **Framer Motion 12**. Icon: **Lucide**. Toast: **Sonner**. Drawer: **Vaul**.
- **Trình soạn thảo rich text: Tiptap v3 CÓ SẴN** (extensions Link, TaskList, TextAlign, Underline…), nạp động `ssr:false`, dùng ở `src/components/tiptap/TiptapEditor.tsx` (ghi chú task, AddTask, BulkEdit). → *đáp thẳng QĐ-5 của spec: đã có editor, không cần thêm thư viện.*
- **Emoji picker: CÓ SẴN** — `emoji-mart` + `@emoji-mart/react` + `@emoji-mart/data`. → *cũng đáp QĐ-5.*
- **Sanitize chống XSS: CÓ SẴN** — `DOMPurify 3.4` (đăng ký hook trong `TaskDetailModal.tsx`). → *đáp AC an toàn B2 của spec.*
- **Pattern mở chi tiết task**: file tên `TaskDetailModal.tsx` nhưng **thực chất là panel trượt từ phải** (`fixed right-0 top-0 bottom-0`, `borderLeft`), dùng Radix Dialog làm khung (portal + overlay + bẫy focus). Bố cục **2 cột**: **TRÁI = thông tin task** (inline-edit), **PHẢI (rộng 400px) = luồng bình luận + hoạt động** (`TaskCommentColumn`). Mở từ `NewDesktopTaskTable.tsx:809` khi click dòng. → *tức là "bề mặt comment trên task" mà spec đặt làm GĐ3 ĐÃ tồn tại.*
- **Mobile**: có `src/components/mobile/TaskDrawer.tsx` riêng (spec yêu cầu responsive).

### 2.3 Đa ngôn ngữ
- `next-intl v4.8` với locale `['en','vi','zh','ru','it']`. **Nhân viên (nội bộ) = tiếng Việt**; **khách (portal công khai) = tiếng Anh**. Có chặn Chrome auto-dịch (`translate="no"` + `notranslate` trên `<html>`) để không dịch nhầm tên khách/dữ liệu.

---

## 3. Mô hình dữ liệu hiện có *(checklist B)*

### 3.1 Sơ đồ phân cấp (dạng text)
```
Profile  (Agency/Team — đơn vị tổ chức cấp cao nhất)
│  status: ACTIVE|SOFT_DELETED ; logoUrl, settings(JSON)
│
├─ User[]            (nhân sự; role: ADMIN|USER|AGENCY_ADMIN|CLIENT|LOCKED)
│    └─ ProfileAccess (vai trò theo Profile: OWNER|ADMIN|USER|CLIENT)   ← RBAC thật nằm ở đây
│
├─ Workspace[]       (khoang làm việc trong Profile; thường = "Tháng M/YYYY")
│    ├─ WorkspaceMember[]   (userId × workspaceId, role OWNER|ADMIN|MEMBER|GUEST)
│    ├─ Task[]              ← thực thể trung tâm
│    └─ Project[]           (nhóm task dưới một Client)
│
└─ Client[]          (KHÁCH HÀNG — nay CANONICAL theo Profile, 1 client/profile)
     ├─ subsidiaries: Client[]      (sub-brand, phân cấp cha–con)
     ├─ ClientShareLink[]           ← LINK CHIA SẺ công khai (không cần đăng nhập)
     └─ ClientTaskRequest[]         (khách gửi yêu cầu việc qua portal — CTv2)
```

**Đặc điểm cốt lõi — "dual scope":** hầu hết thực thể việc (`Task`, `Client`, `Project`, `Invoice`…) mang **cả `profileId` lẫn `workspaceId`**. Đây là **multi-tenancy ưu tiên Profile**, chia nhỏ theo Workspace.

### 3.2 Trả lời câu hỏi then chốt của spec — "channel gắn vào cấp nào?"
- Phân cấp thật: **Profile → Workspace → (Task, Project)**; **Client thuộc Profile** (không thuộc riêng workspace nữa sau migration 2026-06).
- **`Project`** là ứng viên tự nhiên nhất cho "1 dự án = 1 channel" (spec A1/QĐ-4): `Project` có `clientId`, `workspaceId`, `profileId`, `name`, `code`, quan hệ `tasks: Task[]`. Nhưng cần lưu ý: **Project hiện là thực thể khá "mỏng"** (ít được dùng làm trung tâm cộng tác so với Task/Workspace) — GĐ2 phải quyết định channel gắn ở **Project** hay ở **Workspace** ("Tháng M/YYYY") tuỳ cách team thực sự tổ chức.

### 3.3 Task — mô hình trung tâm (`prisma/schema.prisma:325-418`)
- Định danh/luồng: `id`, `title`, `status` (**String**, mặc định `"Đang thực hiện"` — **không phải enum**, danh sách ở `src/lib/task-statuses.ts`), `type`, `deadline`.
- **Con người**: `assigneeId` = **người thực hiện (editor)**; `assignedById` = **người giao/tạo (quản lý — "TaskAssigner")**. Đây chính là trường spec cần cho **"Người quản lý"** — đã lộ ra UI ở đợt trial P0.
- Đa tầng: `workspaceId`, `profileId`, `clientId`, `projectId`.
- Review khách: `clientReview` (null|AWAITING|APPROVED|CHANGES), `clientFeedback`, `clientReviewedAt`, `clientUserId`.
- **Tài chính nhạy cảm** (không được rò cho khách/non-admin): `value`, `jobPriceUSD`, `profitVND`, `wageVND`, `exchangeRate`, `invoiceId`, `invoiceStatus`.
- Media/giao nộp: `videoVersions: VideoVersion[]`, `currentVersionId`, `productLink`, `fileLink`, `rawFootage`.
- **Bình luận: `taskComments: TaskComment[]`** (line 413).

### 3.4 TaskComment — hạ tầng bình luận ĐÃ CÓ (`schema.prisma:1599-1623`) ⭐
| Trường | Ý nghĩa |
|---|---|
| `taskId` (FK, Cascade) | thuộc về task nào |
| `authorType` `"STAFF"｜"CLIENT"` | ai viết |
| `authorUserId?` / `viaShareLinkId?` / `clientId?` | danh tính nhân viên **hoặc** nguồn khách (ẩn danh qua link) |
| `visibility` = **CommentVisibility** `INTERNAL｜CLIENT` | **INTERNAL chỉ nhân viên thấy; CLIENT khách mới thấy** |
| `body` (TEXT) | nội dung |
| `mentions: String[]` | userId được @nhắc → sinh thông báo `TASK_COMMENT` |
| `editedAt?`, `isDeleted` | sửa / xoá mềm |
| `parentId?` + `replies[]` | **trả lời theo luồng, 1 cấp** (Trial P3) |
| `reactions: TaskCommentReaction[]` | **thả emoji** (Trial P3) |

Index: `[taskId, createdAt]`, `[taskId, visibility]`, `[parentId]`.
`TaskCommentReaction` (`:1628-1638`): `commentId`, `emoji`, `userId?`｜`viaShareLinkId?` — emoji allowlist ở `src/lib/comment-reactions.ts`.

**Nhận định:** model này **đã bao phủ B1, B3, B4, B5, B6, và C1** của spec. Nó chính là hiện thực một phần của **QĐ-3 (một hạ tầng message, nhiều bề mặt)** — nhưng hiện mới có bề mặt **`task`**.

### 3.5 Các enum liên quan message
- `CommentVisibility { INTERNAL, CLIENT }` — dùng cho `TaskComment` **và** `ReviewComment`.
- `NotificationType` — đã có **`TASK_COMMENT`**, cùng `TASK_ASSIGNED/STARTED/DELIVERED`, `VIDEO_COMMENT_NEW`, `TASK_CLIENT_SUBMITTED`…
- `ProfileRole { OWNER, ADMIN, USER, CLIENT }` · `UserRole { ADMIN, USER, AGENCY_ADMIN, CLIENT, LOCKED }`.

### 3.6 "Người theo dõi/liên quan" của task?
- **Chưa có bảng follower/watcher tường minh cho task.** Suy được gián tiếp: `assigneeId` (editor), `assignedById` (quản lý), người từng comment. Spec C1 muốn "người comment tự thành người theo dõi" → **cần thêm** (bảng `thread_followers` hoặc suy từ `TaskComment`). `AuditLog` (`:843-868`) là nhật ký hoạt động append-only, đang được trộn vào feed hoạt động.

---

## 4. Auth & phân quyền *(checklist C)*

- **Đăng nhập**: **JWT tự quản trong cookie httpOnly** (KHÔNG NextAuth/Clerk/Supabase Auth). Helper ở `src/lib/auth.ts` (`login`, `loginWithProfile`, `getSession`). Có Google OAuth (`authProvider`, `googleId`), email-verify + OTP reset, khoá tài khoản sau 5 lần sai, `sessionVersion` để vô hiệu token cũ.
- **Ba tầng vai trò**: `User.role` (toàn cục) · **`ProfileAccess.role` (OWNER/ADMIN/USER/CLIENT — nơi RBAC thực sự)** · `WorkspaceMember.role` (OWNER/ADMIN/MEMBER/GUEST).
- **Chốt bảo mật** (`src/lib/security.ts`): `verifyWorkspaceAccess()` (gác mọi mutation), `verifyProfileAdminAccess()` / `verifyFinanceAccess()` (gác tài chính — **không** dựa `isTreasurer` toàn cục nữa, đã vá rò chéo tenant). Predicate quyền ở `src/lib/profile-permissions.ts` (`canCreateWorkspace`, `canInviteMember`, `canManageShareLinks`…).

### 4.1 Khách hàng đăng nhập hay không? — **ĐÃ RÕ**
- **Khách KHÔNG có tài khoản đăng nhập (mô hình hiện tại).** Khách vào bằng **link chia sẻ công khai** — `ClientShareLink`. Token 256-bit, **chỉ lưu SHA-256 hash**, có `expiresAt`/`revokedAt`, giải bằng `resolveShareToken()` (`src/lib/share-link-auth.ts`) trả về scope `{shareLinkId, profileId, clientIds[], workspaceIds[]}`. (Tài khoản CLIENT cũ đã bị **LOCKED**; middleware đá session CLIENT về `/login`.)
- **Khách hiện đã CÓ THỂ**: xem task/hoá đơn của mình, **duyệt/yêu-cầu-sửa** video, **gửi yêu cầu việc** (CTv2), **bình luận** (ép `visibility=CLIENT`), **thả emoji** — tất cả token-gated, rate-limited, ghi audit.

### 4.2 Cách ly dữ liệu — cực kỳ liên quan Phần 8 của spec
- **Ẩn danh tính editor**: `getShareSnapshot` bỏ `assignee`, chỉ trả `manager` (từ `assignedBy`). Timeline map nhân viên → **"Nhóm biên tập"**; comment khách map tác giả nhân viên → **"The team"**, khách → **"You"**.
- **Chặn rò tài chính**: `sanitizeTaskForUser()` (`src/lib/task-sanitize.ts`) xoá `jobPriceUSD/exchangeRate/profitVND` cho non-admin. *(Lưu ý chính sách 2026-06: `jobPriceUSD` **được** hiện trên portal khách vì đó là giá khách trả — nhưng `wageVND/profitVND` thì KHÔNG BAO GIỜ.)*
- **Chặn rò comment nội bộ**: mọi truy vấn token **hard-filter `visibility='CLIENT'` phía server**. INTERNAL không bao giờ tới khách.
- **Rate-limit** theo link: resolve 30/phút/IP; comment 30/giờ; reaction 120/giờ; tạo task 20/giờ; sub-client 10/giờ.

→ **Kết luận Phần 8:** ma trận quyền spec đề xuất **đã được hiện thực và kiểm toán**. Đề xuất "toggle Chỉ nội bộ" của spec **đã tồn tại** dưới dạng `CommentVisibility.INTERNAL`.

---

## 5. Realtime / Notification / Upload hiện trạng *(checklist D, E, F)*

### 5.1 Realtime (D) — **CÓ, dùng Supabase Realtime**
- Deps: `@supabase/supabase-js`. Không socket.io/pusher/ably/firebase.
- Khởi tạo `src/lib/supabase.ts` (trả `null` nếu thiếu env → app không sập). Hook `src/hooks/useSupabaseChannel.ts` subscribe kênh **riêng theo user `user:{userId}`**, nghe broadcast `notification_new`/`notification_read`, có chống lỗi WebSocket iOS Safari, cleanup khi unmount.
- Server broadcast: `src/lib/notification-broadcast.ts` gọi REST `…/realtime/v1/api/broadcast` bằng `SUPABASE_SERVICE_ROLE_KEY`, timeout 3s, **DB là fallback** nếu broadcast lỗi.
- **Ràng buộc hạ tầng (rất quan trọng cho QĐ-1 của spec):** app chạy **serverless trên Vercel → KHÔNG giữ được WebSocket bền**. Vì vậy con đường realtime khả thi = **Supabase (managed pub/sub)** — đúng phương án **QĐ-1(a)** "tận dụng hạ tầng realtime CÓ SẴN". Không cần polling, không cần tự host socket.
- Video review cũng có realtime riêng (`broadcastReviewEvent`) — cùng pattern Supabase.

### 5.2 Notification (E) — **hoàn chỉnh**
- Model `Notification` (`:1220-1243`): `type`, `title`, `body`, `avatarUrl`, `isRead`, `taskId`, `actorId`, `metadata(JSON)`, `pushSentAt`, `emailSentAt`. Có `NotificationPreference` (email on/off, digest REALTIME/HOURLY/DAILY, quiet hours).
- `createNotificationInternal()` (`src/actions/notification-actions.ts`): ghi DB → **fire-and-forget email + web push** → broadcast Supabase. `createAndBroadcastNotifications()` fan-out cho nhiều admin.
- UI: `NotificationBell` (badge, realtime + poll 30s dự phòng) → `NotificationPanel` (lịch sử, lọc, đánh dấu đọc). → **đây chính là "Inbox" (D2) spec cần — chỉ việc MỞ RỘNG, không xây mới.**
- **Email: Resend** (`src/lib/email.ts` + `notification-email.ts`) — no-op nếu thiếu key; có bypass-rule theo loại, quiet hours, **digest gom theo giờ/ngày**, template sẵn gồm **`taskComment`** (đã nối cho bình luận). → đáp D4 (email mention/assign có điều kiện) gần như sẵn sàng.
- **Web push: có, gated** — `PushSubscription` + `src/lib/web-push.ts` + `public/sw.js` + `PushNotificationToggle`; **tự ẩn nếu chưa set VAPID**. (D5 spec để SKIP, nhưng ta đã có sẵn, tắt được.)

### 5.3 Upload & lưu trữ (F)
- Ảnh: `src/lib/storage.ts` chọn driver **Vercel Blob** (prod hiện tại, `BLOB_READ_WRITE_TOKEN`) **hoặc Supabase Storage**. Avatar ≤10MB, QR ≤4MB; xử lý bằng **Sharp** (auto-orient, resize, → WebP); vá IDOR (chỉ dùng session user).
- **Video: Cloudflare Stream** — upload thẳng từ trình duyệt lên Cloudflare (né giới hạn body 4.5MB của Vercel), webhook báo "ready", phát HLS qua signed URL. `VideoVersion.streamUid`.
- **Đặc thù team video (đúng ghi chú QĐ-6 của spec):** file nặng **chia sẻ bằng link** (`fileLink`, `productLink` = Google Drive/Frame.io/Dropbox/Cloudflare) chứ không upload qua "chat". → phần đính kèm B7 nên ưu tiên **hiển thị link đẹp**, không cố xây upload GB.

---

## 6. Code chat/comment cũ tìm thấy *(checklist G — quyết định TÁI DÙNG)*

| Bề mặt | Model / File | Trạng thái | **Kết luận tái dụng** |
|---|---|---|---|
| **TaskComment (bình luận task)** | `TaskComment`, `TaskCommentReaction` `:1599-1638`; `src/actions/task-comment-actions.ts`; `TaskCommentColumn.tsx`, `TaskCommentThread.tsx` | **ĐANG CHẠY** | **TÁI DÙNG NGUYÊN** — hạt nhân của cả spec |
| **Bình luận khách qua token** | biến thể của TaskComment; `share-portal-actions.ts` (`getCommentFeedViaToken`/`postCommentViaToken`/`toggleReactionViaToken`); `PortalCommentSection.tsx` | **ĐANG CHẠY** | **MỞ RỘNG** — dùng lại model, gate bằng token |
| **Feed hoạt động** | `AuditLog` `:843-868` trộn cùng TaskComment (`task-comment-actions.ts:84-148`) | **ĐANG CHẠY** | **MỞ RỘNG** — nền cho timeline "comment + sự kiện" |
| **Thông báo** | `Notification` + Supabase broadcast + Resend | **ĐANG CHẠY** | **MỞ RỘNG** — chính là Inbox (D2) |
| **Chat kiểu Discord ("Hub")** | `Channel`, `Message`, `Reaction`, `ChannelMember`, `CustomRole`, `ChannelOverwrite`, LiveKit… | **ĐÃ GỠ** (commit `670c962`, 07/06) | **KHÔNG HỒI SINH** — lý do gỡ: *"unstable and diluting the app"* |
| **Review comment video** | `VideoVersion`, `ReviewComment`, `CommentReaction`, `CommentAttachment` `:1491-1592`; `video-review-actions.ts` | **ĐANG CHẠY** | **CHỈ THAM CHIẾU** — theo timecode/version, giữ riêng, đừng gộp |
| `clientFeedback` (Task field) | `Task.clientFeedback:380` | task-scoped | KHÔNG dùng làm message |
| `notes_vi/notes_en` | `Task:334-335` | metadata | KHÔNG dùng làm message |
| `Contact` | `:1258-1272` | quan hệ user | KHÔNG liên quan chat |

**Kết luận mục 6 (đáp Luật cứng #6 của spec):** hệ thống **đã có một hạ tầng comment/realtime/notification sống và tốt** — bắt buộc **tận dụng/nâng cấp**, tuyệt đối không dựng hệ song song. Đồng thời **cảnh báo đỏ**: từng có một hệ chat đầy đủ **bị gỡ có chủ đích**; mọi ý định làm lại "kênh/tin nhắn" phải khác về chất (theo mô hình ClickUp đơn giản hoá, không phải Discord) và phải được anh chốt.

---

## 7. Hạ tầng, chi phí & giới hạn *(checklist I, J)*

### 7.1 Dịch vụ đang dùng (đều đã trả sẵn — chat **không** phát sinh dịch vụ mới)
Vercel (host serverless) · **Neon** (Postgres) · **Supabase** (Realtime + tuỳ chọn Storage) · **Resend** (email) · **Cloudflare Stream** (video) · **Upstash Redis** (rate-limit) · Cloudflare Turnstile (chống bot) · Dropbox/Google Drive OAuth (quét footage) · LiveKit (còn trong deps từ thời Hub — **cân nhắc gỡ**) · OpenAI/Gemini (dịch ghi chú — **không đụng chat**) · Web-push/VAPID.

### 7.2 Giới hạn ảnh hưởng chat
- **Serverless Vercel**: function 30s (invoice 60s), **không WebSocket bền** → realtime phải qua Supabase (đã có). Body upload ~4.5MB → file lớn đi Cloudflare/Direct-upload hoặc link.
- **Neon**: Postgres đủ cho full-text search cơ bản (`ILIKE`/`tsvector`) → **F1 tìm kiếm không cần search engine mới** (đúng spec).
- **Cron Vercel** (6 job/`vercel.json`): sẵn cho digest email + dọn thông báo cũ.

### 7.3 Quy mô (J) — **CHƯA XÁC ĐỊNH**
Audit **chỉ đọc code, không truy vấn DB production** (đúng nguyên tắc an toàn). Số user/dự án/task thực tế **cần hỏi chủ dự án** (mục 9). Gợi ý từ cấu trúc: workspace thường theo tháng ("Tháng M/YYYY"), một workspace từng thấy ~122 task đang mở → quy mô **team nhỏ**, hợp với realtime Supabase gói hiện tại.

### 7.4 Chất lượng nền (K)
- **KHÔNG có unit/integration test, KHÔNG CI (.github/workflows).** Chỉ có 1 script `test:invite-security` + vài probe `tsx`. Playwright có trong devDeps nhưng không chạy tự động. → **rủi ro hồi quy**: mỗi giai đoạn build chat phải tự kiểm bằng `tsc --noEmit` + `next build` + probe `tsx` như các đợt trước.
- Convention tốt: tách bạch `components`/`actions`/`lib`; strict TS; security headers (CSP…); audit log; soft-delete + cron hard-delete.

---

## 8. Rủi ro & điều chưa xác định

| # | Rủi ro / điều chưa rõ | Cần làm gì / hỏi ai |
|---|---|---|
| R1 | **Đụng lại vùng đã gỡ (Hub chat).** Spec đòi "kênh dự án + DM" — đúng thứ đã bị gỡ vì gây bất ổn. | **Hỏi chủ dự án** (Q1, Q7): có tái lập bề mặt "kênh/DM" không, hay giữ chat = "chỉ bình luận trên task" cho gọn? |
| R2 | **Fork kiến trúc lớn (để GĐ2 quyết):** mở rộng thẳng `TaskComment` cho mọi bề mặt, **hay** đưa vào lớp trừu tượng `Conversation{type: task｜channel｜dm}` như QĐ-3. TaskComment hiện gắn cứng `taskId` (không nullable) → làm channel/DM cần tổng quát hoá schema (migration có rollback). | Quyết trong **02-PROPOSAL** kèm kịch bản migration; không tự ý ở GĐ1. |
| R3 | **Channel gắn `Project` hay `Workspace`?** Project hiện "mỏng"; team tổ chức theo tháng (Workspace). | Hỏi cách team thực dùng (Q6-phụ) + phân tích ở GĐ2. |
| R4 | **Tính năng spec là P0 nhưng CHƯA có**: **C2 giao-việc/resolve** (TaskComment không có `assigned_to/resolved_*`), **C3 FollowUps**, **C4 tạo-task-từ-message**, **B8 copy-link**, **F1 search**, **D1 mốc-đọc theo hội thoại** (Notification là theo sự kiện, chưa có `read_states` theo conversation). | Đây là phần "còn phải làm" của GĐ3; liệt kê chi tiết ở gap-analysis GĐ2. |
| R5 | **B2 định dạng văn bản trong comment**: chưa xác nhận comment render markdown/rich hay plain. Tiptap + DOMPurify đã sẵn để gắn. | Kiểm ở đầu GĐ3; ưu tiên plain+markdown giới hạn (QĐ-2). |
| R6 | **Phạm vi vs thời gian**: spec là dự án nhiều tuần; trial anh Trung Nghĩa hạn **04/07** (còn 2 ngày) đã đủ nhờ comment-trên-task hiện có. | Hỏi kỳ vọng (Q-phạm-vi): chat đầy đủ là **hướng sau trial**, đồng ý không? |
| R7 | **Không có test tự động/CI.** | Mỗi lát cắt tự verify `tsc`+`build`+probe; cân nhắc thêm probe bảo mật cách-ly cho mỗi bề mặt mới. |
| R8 | **LiveKit còn sót trong deps** sau khi gỡ Hub. | Xác nhận gỡ để giảm bề mặt (ngoài phạm vi chat, ghi nhận). |

---

## 9. Danh sách câu hỏi cho chủ dự án *(CHECKPOINT 1 — trả lời xong mới sang GĐ2)*

> Nhiều câu trong Phần 14 của spec **đã được audit trả lời sẵn** (khách dùng link không đăng nhập; toggle "chỉ nội bộ" đã có; realtime = Supabase miễn phí thêm; UI Việt cho nhân viên / Anh cho khách). Dưới đây chỉ hỏi những gì **thực sự còn cần anh quyết**:

1. **Kênh & DM — câu quan trọng nhất.** Dự án **đã từng xây chat Discord đầy đủ rồi gỡ vì bất ổn**. Lần này anh muốn: **(a)** làm cả "kênh theo dự án + tin nhắn riêng (DM)" như spec; **(b)** chỉ làm **kênh theo dự án**, bỏ DM; hay **(c)** giữ chat = **chỉ bình luận trên task** (thứ đang chạy), không thêm kênh/DM? *(ảnh hưởng lớn nhất tới phạm vi & rủi ro.)*

2. **Quy mô hiện tại & 12 tháng tới:** khoảng bao nhiêu **người dùng hoạt động**, bao nhiêu **dự án/khách** cùng lúc? *(audit không đọc DB thật — cần con số để chốt tải realtime.)*

3. **"Kênh" gắn vào đâu:** team trao đổi theo **từng dự án (Project)** hay theo **tháng (Workspace "Tháng M/YYYY")**? Câu này quyết định 1-channel gắn cấp nào.

4. **DM có cần trong 2–3 tháng đầu không**, hay comment-task + (nếu chọn) kênh-dự-án là đủ? *(ảnh hưởng thứ tự GĐ5.)*

5. **Thứ tự & kỳ vọng thời gian:** vì "bình luận trên task" (GĐ3) **đã xong ~70–80%**, đề xuất GĐ3 rút lại thành *"hoàn thiện + gia cố bình luận task"* (thêm **giao-việc/resolve, trang Việc-được-giao, copy-link, tìm kiếm**), rồi GĐ4 mới tới **kênh**. Anh đồng ý thứ tự này chứ? Và anh xác nhận **chat đầy đủ là việc SAU trial 04/07** (trial đã đủ dùng bằng phần hiện có)?

6. **Giao việc từ message (C2 — "biến câu nhắn thành việc")** là tính năng ClickUp giá trị nhất và **hiện chưa có**. Xác nhận đây là ưu tiên cao để làm sớm ở GĐ3?

---

### ⛔ CHECKPOINT 1
Em **dừng ở đây theo đúng quy trình** (không viết code sản phẩm). Mời anh trả lời **6 câu ở Mục 9** (đặc biệt **Q1** và **Q5**). Có câu trả lời, em sẽ soạn **`docs/chat/02-PROPOSAL.md`** (gap-analysis từng tính năng + quyết định QĐ-1→QĐ-6 gắn với audit + data model chính thức + kế hoạch migration có rollback + ước lượng khối lượng) và trình anh duyệt tại **CHECKPOINT 2** — chỉ sau chữ **"duyệt"** mới bắt đầu code.
