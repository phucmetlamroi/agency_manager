# ĐỀ XUẤT KIẾN TRÚC — CHAT HUSTLYTASKER (GĐ2)

> Nối tiếp `01-SYSTEM-AUDIT.md`. Đây là **GĐ2** của quy trình AUDIT-FIRST.
> **CHƯA viết code** — chờ chủ dự án gõ **"duyệt"** ở CHECKPOINT 2.
> Ngày: **2026-07-02** · Nhánh: `claude/cranky-austin`.

## 0. Phạm vi đã chốt (CHECKPOINT 1)

Chủ dự án đã quyết (2026-07-02):
- **CHỈ "bình luận trên task"** — **KHÔNG** kênh dự án, **KHÔNG** General, **KHÔNG** DM, **KHÔNG** sidebar chat. → GĐ4/GĐ5 của spec gốc (channel/DM) **bị loại khỏi phạm vi**.
- **Chat là việc SAU trial 04/07** — không gấp; trial chạy bằng luồng bình luận hiện có.

**Hệ quả kiến trúc lớn:** vì không có channel/DM, **KHÔNG cần lớp trừu tượng `Conversation{task|channel|dm}` (QĐ-3 của spec)**. Ta giữ nguyên **`TaskComment`** làm hạ tầng duy nhất, và toàn bộ việc còn lại là **bổ sung cộng thêm (additive) lên `TaskComment`** — không có migration rủi ro, không dựng hệ song song. Đây là con đường an toàn nhất và đúng Luật cứng #6 (tận dụng, không hồi sinh Hub đã gỡ).

---

## 1. Gap analysis — từng tính năng (đã lọc theo phạm vi task-comment)

Ký hiệu: **Có** = chạy được · **Có phần** = có nhưng thiếu AC · **Chưa** = phải làm mới. Độ phức tạp S/M/L.

| Mã | Tính năng | Ưu tiên | Hiện trạng | Việc phải làm | ĐPT |
|---|---|---|---|---|---|
| **B1** | Gửi & hiển thị message | P0 | **Có phần** — composer, feed, mention-highlight, Ctrl/⌘+Enter, auto-scroll đáy | Thêm **avatar**, **phân cách ngày** (Hôm nay/Hôm qua), **gộp nhóm 5'**, **cursor pagination** (hiện `findMany` tải HẾT), **optimistic UI**, hằng số giới hạn ký tự minh bạch | M |
| **B2** | Định dạng văn bản | P0 (cơ bản) | **Chưa** — `renderBody` chỉ tô `@mention`, text thuần | **Render markdown giới hạn** (đậm/nghiêng/gạch/inline-code/link + list/quote ở P1); sanitize bằng **DOMPurify (đã có)** | S–M |
| **B3** | @mention | P0 | **Có phần** — resolve server + notify chạy; KHÔNG có dropdown gợi ý khi gõ `@` | Thêm **dropdown autocomplete** thành viên workspace (điều hướng phím) | M |
| **B4** | Sửa & xoá | P0 | **Có** — sửa của mình, xoá (mình + admin), soft-delete, nhãn "đã sửa" | Thêm placeholder **"Tin nhắn đã bị xoá"** giữ khung thread (hiện comment xoá bị ẩn hẳn) | S |
| **B5** | Reactions emoji | P0 | **Có** — toggle, gộp đếm, picker 6 emoji allowlist | — (đạt) | — |
| **B6** | Thread / trả lời | P1 | **Có phần** — reply 1 cấp (parentId), thụt lề | **Auto-follow thread** + notify khi có reply mới cho người trong thread (chưa có `thread_followers`) | S–M |
| **B7** | Đính kèm & link | P1 | **Chưa** | **Link chip đẹp** (favicon + domain) — ưu tiên cho team video; ảnh paste (P2) | M |
| **B8** | Copy link tới message | P1 | **Chưa** | Deep-link theo `commentId`: mở đúng task-drawer, cuộn tới, highlight vàng ~2s | S–M |
| **C1** | Comment trên task | P0 | **Có** — cả admin (dark) lẫn khách (light) | Thêm **đếm 💬 + số** trên bảng task (để manager quét nhanh) | S |
| **C2** | **Giao message → action item** | **P0** | **Chưa** — `TaskComment` không có trường assign/resolve | **Trọng tâm:** schema (assign/resolve) + actions + **badge "Giao cho X · Đang mở/✓ Đã xử lý"** + notify | M |
| **C3** | Trang FollowUps | P1 | **Chưa** | Trang "Việc được giao cho tôi" + lọc trạng thái/người giao + deep-link | M |
| **C4** | Tạo task từ message (THỦ CÔNG) | P1 | **Chưa** | Nút → mở form tạo task **prefill** (mô tả = nội dung + link về message); backlink 2 chiều; **tên task người dùng tự gõ** (không AI) | M |
| **C5** | Chat Activity | P2 | **Có phần** | Bộ lọc trên Inbox (mention/assign/resolve của tôi) | S |
| **D1** | Trạng thái chưa đọc | P0 | **Chưa (cho task)** — Notification theo sự kiện, chưa có mốc đọc theo task | **`read_state` theo (user, task)** + badge unread + số comment chưa đọc | M |
| **D2** | Inbox trong app | P1 | **Có** — `NotificationBell` + `NotificationPanel` | Mở rộng (đã đủ nền) | S |
| **D3** | Cài đặt notification | P2 | **Có phần** — `NotificationPreference` (email/digest/quiet-hours) | UI bật/tắt theo loại sự kiện | S |
| **D4** | Email notification | P2 | **Có** — Resend + template `taskComment` + digest | — (đạt) | — |
| **E1** | Tin mới không cần reload | P0 | **Chưa (feed)** — `TaskCommentColumn` fetch 1 lần + refetch sau thao tác của chính mình; comment người khác KHÔNG tự hiện | **Broadcast `task:{taskId}`** khi create/edit/delete/react + subscribe trong feed; dedupe theo id; nút "↓ N tin mới" khi đang cuộn | M |
| **E4** | Đồng bộ badge unread realtime | P1 | **Có phần** | Cùng cơ chế E1 | S |
| **F1** | Tìm kiếm | P1 | **Chưa** | `ILIKE` trên `body` trong 1 task + nhảy/highlight (không thêm search engine) | S–M |
| **F2** | Pin message | P2 | **Chưa** | Trường pin + danh sách pin ở header feed | M |

**KHÔNG làm (ngoài phạm vi/spec SKIP):** A1–A4 (channel/General/DM/sidebar), B3-`@everyone` (không có channel), E2/E3 (typing/presence — chỉ có ý nghĩa với chat kênh), D5 (browser push đã có sẵn, không đụng), toàn bộ tính năng AI (Phần 13).

---

## 2. Quyết định kiến trúc (QĐ-1 → QĐ-6, gắn với audit)

**QĐ-1 · Realtime = Supabase (phương án (a) của spec — tận dụng hạ tầng có sẵn).**
Audit mục D: Vercel serverless không giữ WebSocket; Supabase Realtime đã chạy cho notification + video-review. → **Không thêm gì mới, chi phí 0.** Thêm một topic **`task:{taskId}`**: mỗi create/edit/delete/react phát 1 broadcast nhẹ (chỉ `{type, commentId}`), client đang mở drawer subscribe và refetch/patch, **dedupe theo id**. Dự phòng: polling 10–15s khi tab active nếu broadcast lỗi (đúng tinh thần "thiết kế event tách bạch để nâng cấp không đau" của spec — ta đã có sẵn lớp event qua `notification-broadcast.ts`, chỉ tổng quát hoá thành `broadcastToTopic`).

**QĐ-2 · Định dạng: plain text + markdown giới hạn** (đúng khuyến nghị mặc định spec). `TaskComment.body` đang là TEXT thuần — giữ nguyên schema, chỉ **thêm lớp render markdown giới hạn** (đậm/nghiêng/gạch/inline-code/link; list/quote ở P1) qua DOMPurify (đã có). Mention **giữ literal `@username`** (đơn giản, dễ search); resolve→notify đã theo id nên đổi tên user không vỡ thông báo (chỉ text hiển thị cũ là literal — chấp nhận được cho team nhỏ). *Không* kéo editor nặng.

**QĐ-3 · Một hạ tầng, một bề mặt.** Vì chốt "chỉ task-comment", **giữ `TaskComment` làm substrate duy nhất — KHÔNG tạo `Conversation`.** Đây là điểm khác lớn (và có lợi) so với spec gốc: bỏ được migration tổng quát hoá rủi ro nhất.

**QĐ-4 · Channel:** **N/A** (đã loại khỏi phạm vi).

**QĐ-5 · Editor & emoji:** dùng đồ **đã có** — emoji-mart/allowlist 6-emoji cho reaction (đủ), textarea nâng cấp + markdown + dropdown mention tự viết (không thêm lib). Tiptap giữ cho ghi chú task, **không** dùng cho comment (giữ comment nhẹ, dễ search).

**QĐ-6 · Đính kèm:** **link-first** đúng đặc thù team video (audit mục F): hiển thị link chip đẹp; **không** xây upload file GB. Nếu cần ảnh paste (P2) thì đi qua storage có sẵn (Vercel Blob/Supabase Storage) với giới hạn nhỏ.

---

## 3. Data model chính thức (điều chỉnh từ Phần 6 theo schema thật)

**Nguyên tắc: chỉ THÊM cột/bảng nullable-hoặc-mới lên `TaskComment` — additive, rollback = drop.** Không đổi cột hiện có, không transform dữ liệu cũ.

### 3.1 Mở rộng `TaskComment` (C2 giao việc + C4 backlink + F2 pin)
```prisma
model TaskComment {
  // …giữ nguyên toàn bộ trường hiện có…

  // [Chat C2] Giao message thành action item (đều nullable → additive)
  assignedToId   String?    // người được giao (staff userId)
  assignedById   String?    // người giao (staff userId) — LƯU Ý: khác Task.assignedById (là "quản lý")
  assignedAt     DateTime?
  resolvedAt     DateTime?
  resolvedById   String?

  // [Chat C4] Task sinh ra từ message (backlink 2 chiều)
  spawnedTaskId  String?    // Task tạo từ comment này (scalar, resolve trong query)

  // [Chat F2 — P2] Ghim
  pinnedAt       DateTime?
  pinnedById     String?

  @@index([assignedToId, resolvedAt])   // FollowUps: "việc giao cho tôi, còn mở"
  @@index([taskId, pinnedAt])           // danh sách pin
}
```

### 3.2 Bảng mới `TaskCommentReadState` (D1 — mốc đọc theo user × task)
```prisma
model TaskCommentReadState {
  id            String   @id @default(cuid())
  userId        String
  taskId        String
  lastReadAt    DateTime @default(now())   // đọc = mở drawer + cuộn tới cuối
  @@unique([userId, taskId])
  @@index([userId])
}
```
Unread của 1 task = số `TaskComment` (visibility hợp lệ với vai trò) có `createdAt > lastReadAt`. Mention chưa đọc = badge đỏ riêng (đọc từ `Notification` sẵn có).

### 3.3 Enum `NotificationType` — thêm giá trị (additive)
```
COMMENT_ASSIGNED    // được giao một action item
COMMENT_RESOLVED    // action item của bạn đã được resolve
```
*(Tận dụng nguyên `Notification` + broadcast + email pipeline hiện có — chỉ thêm 2 loại.)*

### 3.4 Không đổi
`TaskCommentReaction`, `CommentVisibility`, `AuditLog`, `Notification`, `NotificationPreference`, share-portal token — **giữ nguyên**. Client (token) vẫn hard-filter `visibility='CLIENT'`; **các trường assign/resolve/pin là STAFF-only, không bao giờ serialize sang portal khách.**

---

## 4. API / Server Actions chính thức (theo phong cách server-actions của dự án)

Mở rộng `src/actions/task-comment-actions.ts` (staff, session-gated) — **không** tạo file substrate mới:
```
// C2
assignTaskComment(commentId, workspaceId, assigneeUserId)     // set assigned* + notify COMMENT_ASSIGNED
resolveTaskComment(commentId, workspaceId)  | reopenTaskComment(...)   // set/clear resolved* + notify COMMENT_RESOLVED
// C3
getMyFollowups({ status?, assignedBy? })                       // "giao cho tôi" + tab "tôi đã giao"
// C4
createTaskFromComment(commentId, workspaceId)                  // mở/khởi tạo task prefill + set spawnedTaskId + backlink
// D1
markTaskCommentsRead(taskId, workspaceId)                      // upsert TaskCommentReadState.lastReadAt = now
getTaskUnreadCounts(workspaceId, taskIds[])                    // badge 💬/unread cho bảng task
// B3
searchWorkspaceMembers(workspaceId, q)                         // dropdown @mention
// F1
searchTaskComments(taskId, workspaceId, q)                     // ILIKE trên body
// F2 (P2)
pinTaskComment(...) | unpinTaskComment(...)
```
Phía khách (token): **giữ nguyên** `share-portal-actions.ts` (không thêm quyền giao/resolve/pin cho khách — đúng ma trận Phần 8). Chỉ khi cần: `markReadViaToken` (unread cho khách — P2, tuỳ chọn).

**Realtime helper:** tổng quát hoá `notification-broadcast.ts` → `broadcastToTopic(topic, event, payload)`; dùng `task:{taskId}`. Hook client `useTaskCommentRealtime(taskId)` (mô phỏng `useSupabaseChannel`).

**Quy tắc chung (giữ như hiện có):** mọi action `verifyWorkspaceAccess`; sanitize `body`; rate-limit (khách đã có 30/giờ); ghi `AuditLog`; validate độ dài (`FEEDBACK_MAX_LEN` → cân nhắc hằng số `COMMENT_MAX_LEN` minh bạch).

---

## 5. Kế hoạch migration DB (có rollback)

Tất cả **additive**:
1. `ALTER TABLE "TaskComment" ADD COLUMN` × (assignedToId, assignedById, assignedAt, resolvedAt, resolvedById, spawnedTaskId, pinnedAt, pinnedById) — đều nullable.
2. `CREATE TABLE "TaskCommentReadState"` + unique/index.
3. `ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_ASSIGNED'`, `ADD VALUE 'COMMENT_RESOLVED'`.
4. Thêm index `@@index([assignedToId, resolvedAt])`, `@@index([taskId, pinnedAt])`.

**Rollback:** drop các cột/bảng/index vừa thêm (không mất dữ liệu cũ vì không transform). Enum-value không xoá được trực tiếp trong Postgres → rollback để lại giá trị enum thừa (vô hại). → thực thi qua `prisma migrate` (ưu tiên có file migration + rollback SQL) thay vì `db push` trần để giữ kịch bản lùi, đúng Luật cứng #5.

**Zero data loss:** không đụng `body`, `visibility`, reactions, threads hiện có.

---

## 6. Thư viện mới cần thêm

**KHÔNG.** Tiptap, DOMPurify, emoji-mart, Supabase, Resend, web-push đều đã có. Markdown giới hạn **tự viết** renderer nhỏ (qua DOMPurify) — không thêm dep. *(Nếu sau này muốn markdown đầy đủ hơn, đề xuất `marked` (~40KB, MIT) — nhưng chỉ khi cần và xin duyệt riêng.)*

---

## 7. Ước lượng khối lượng theo giai đoạn (đánh số nối tiếp spec; GĐ4/5 gốc đã bỏ)

| GĐ | Nội dung | Gồm | Demo qua cửa |
|---|---|---|---|
| **GĐ3 — Core hardening** *(P0 — "comment phải chạy tốt")* | Trọng tâm giá trị | **C2** giao/resolve · **D1** unread + 💬 · **E1** realtime feed · **B2** markdown · **B3** dropdown mention · **B1** polish (avatar/ngày/nhóm/cursor/optimistic) | 2 user comment realtime, mention có dropdown, giao→resolve, badge unread đúng |
| **GĐ4 — Cộng tác trên task** *(P1)* | Biến message thành việc | **C3** FollowUps · **C4** tạo task từ message · **B8** copy-link deep-link · **F1** search · **B6** follow+notify reply · **B7** link chip | Giao 1 message → thấy ở FollowUps; tạo task từ message; copy-link nhảy đúng chỗ |
| **GĐ5 — Tốt-nếu-có** *(P2)* | Hoàn thiện | **F2** pin · **D3** UI cài đặt notif · **C5** filter Activity trên Inbox · **B7** ảnh paste | Demo cuối |
| **GĐ6 — Nghiệm thu** | Chốt | Test tổng (tsc + build + probe cách-ly) · polish · `docs/chat/03-HANDOVER.md` | Theo Định nghĩa Hoàn thành |

**Kỷ luật build:** lát cắt dọc (schema → action → UI → tự verify từng tính năng); commit nhỏ; mỗi GĐ tự chạy `tsc --noEmit` + `next build --webpack` + probe cách-ly (vì **không có CI/test** — audit mục K). **Chỉ push khi được yêu cầu.**

---

## 8. Rủi ro & giảm thiểu

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| 1 | **Không có test/CI** (audit K) | Mỗi lát cắt tự verify tsc+build+probe; viết probe cách-ly (khách không thấy assign/INTERNAL) cho mỗi bề mặt mới |
| 2 | **Rò cách ly** khi thêm assign/resolve/pin | Các trường này **STAFF-only**, không serialize sang token portal; khách vẫn chỉ `visibility='CLIENT'`; thêm probe kiểm |
| 3 | **Ngân sách kết nối realtime** Supabase | Chỉ subscribe `task:{taskId}` khi drawer mở (1 kênh/drawer), huỷ khi đóng; fallback polling; team nhỏ → an toàn |
| 4 | **Hiệu năng** `getTaskActivityFeed` tải hết comment | Thêm cursor pagination (B1) khi task "nóng"; batch reactions/mentions (đã batch) |
| 5 | **Va tên `assignedById`** (Task.assignedById = quản lý ≠ TaskComment.assignedById = người giao action) | Đặt tên/So-sánh rõ trong code + comment; cân nhắc `actionAssignedById` nếu gây nhầm khi review |
| 6 | **Enum rollback** không xoá value được | Chấp nhận enum thừa vô hại khi lùi; ghi rõ trong migration |
| 7 | **Phạm vi nở lại** (khách muốn channel/DM sau) | Vì giữ `TaskComment` sạch, sau này nếu cần vẫn có thể tổng quát hoá lên `Conversation` — ghi nhận là nâng cấp tương lai, không làm bây giờ |

---

### ⛔ CHECKPOINT 2 — QUAN TRỌNG NHẤT
Đây là bản đề xuất "may đo" theo đúng scope anh chốt. **Em KHÔNG viết code tới khi anh gõ "duyệt".**

Ba điểm em muốn anh xác nhận nhanh khi duyệt (đã có mặc định — anh chỉ cần sửa nếu khác ý):
1. **C2 (giao message → resolve) là trọng tâm GĐ3** — đồng ý? *(mặc định: có)*
2. **Markdown giới hạn tự viết, không thêm thư viện** — ok? *(mặc định: có)*
3. **Migration bằng `prisma migrate` có file rollback** (thay vì `db push` trần) — ok? *(mặc định: có)*

Anh gõ **"duyệt"** (hoặc "duyệt, sửa …") là em bắt đầu **GĐ3**.
