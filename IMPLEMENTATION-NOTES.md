# IMPLEMENTATION-NOTES — Module Video Review "Team" (Mux + R2 + Inngest)

> Sổ ghi khác biệt giữa spec `docs/review-module/` và repo thật, theo đúng quy trình
> Bước 4 trong `docs/review-module/CLAUDE.md`. Cập nhật mỗi phase.

## P0 (2026-07-04) — Báo cáo verify A1–A13 (KIEN-TRUC.md §1)

| # | Kết quả | Ghi chú |
|---|---|---|
| A1 | ✅ App Router | Next 16.1.6 + React 19.2.3 — chọn version Vidstack/Konva tương thích React 19 ở P4 |
| A2 | ✅ Prisma 5.22 + Neon Postgres | ⚠️ Repo dùng **`prisma db push`** (postinstall chạy `generate && db push` MỌI build Vercel) — KHÔNG dùng `migrate deploy`. SQL thuần (partial unique + CHECK) apply qua `prisma db execute`, artifact tại `prisma/migrations/manual/p0_add_review_module.sql`; Prisma diff bỏ qua expression/partial index + CHECK nên chúng SỐNG SÓT qua db push (đã verify: db push sau khi execute → "already in sync") |
| A3 | ✅ Segment `[workspaceId]` | Route module: `src/app/[workspaceId]/admin/team/` (khu admin hiện có) |
| A4 | ✅ JWT `jose` + `getSession()` | Role ADMIN/USER/LOCKED/CLIENT. `requireReviewAccess()` (src/lib/review/access.ts) bọc `verifyWorkspaceAccess` — không dựng auth thứ hai |
| A5 | ✅ middleware.ts có | Matcher đã loại toàn bộ `/api` → webhook/inngest/cron không cần sửa middleware. Thêm nhánh public `/r/` (copy pattern `/share`: X-Robots-Tag + Referrer-Policy + x-request-id) |
| A6 | ✅ Service đổi status: `updateTaskStatus()` (src/actions/task-actions.ts) validate `isValidStatus` | ❗ **"Sửa lại" KHÔNG tồn tại** — nguồn chân lý `src/lib/task-statuses.ts` `VALID_TASK_STATUSES` (11 giá trị). Mapping chốt (user duyệt 2026-07-04): Request changes ⇒ **`'Revision'`**; Approve ⇒ đề xuất `'Hoàn tất'`. `getReviewStatusOptions()` (P3) đọc động từ VALID_TASK_STATUSES |
| A7 | ⚠️ Nút "Tải video review lên" ĐÃ TỪNG có handler | Là thí nghiệm Cloudflare Stream (VR-P0..P2) — **đã gỡ ở P0-pre** (commit c9efb0b, bảng rỗng đã verify 0 dòng trước khi drop) vì trùng tên model ReviewComment/CommentReaction/CommentAttachment với spec. P1 cắm pipeline mới vào đúng chỗ khối BÀN GIAO |
| A8 | ✅ Pattern composer + toggle nội bộ/công khai + @mention có sẵn (TaskComment GĐ3) | Tái dùng pattern ở P4; mặc định Internal khớp spec |
| A9 | ✅ `@vercel/blob` chỉ cho avatar — không đụng |
| A10 | ✅ Sub-brand = row `Client` con (self-relation parent/subsidiaries) | `brandKey` = id Client con |
| A11 | ⚠️ `vercel.json` ĐÃ có key `crons` (6 jobs) | Merge thêm entry janitor `0 20 * * *` + maxDuration 60s cho `src/app/api/review/uploads/**` (route `complete` P1) |
| A12 | ✅ Chưa có Inngest — cài mới (`inngest` + serve tại `/api/inngest`) |
| A13 | ✅ Radix + Tailwind dark theme đủ dùng lại |

## Khác biệt / quyết định triển khai

1. **Share page:** `src/app/portal/` đã bị GỠ khỏi repo (dự án Canonical Clients) — spec mục "cân nhắc mở rộng portal" hết hiệu lực. Dựng **`/r/[slug]`** đúng Q10. Hệ `ClientShareLink` (portal cả-khách, token 256-bit) và `ShareLink` mới (per-asset review) **song song tồn tại**, không đụng nhau.
2. **FK sang bảng cũ (Task/User/Client/Workspace): SCALAR STRING, KHÔNG FK constraint ở P0** — khác lựa chọn "phương án 1 (relation)" trong KIEN-TRUC §10.2. Lý do: (a) repo có luồng hard-delete đang sống (`deleteTask`, cron `hard-delete-workspaces`) — FK RESTRICT sẽ đổi hành vi các luồng đó ngay khi có dữ liệu review; (b) FK do SQL thủ công tạo sẽ bị `db push` (chạy mỗi build) DROP vì Prisma diff có model hoá FK. Sẽ xem lại ở P1 khi có luồng đọc cần `include`. Toàn vẹn tham chiếu enforce ở service layer.
3. **Bộ SQL thuần (DATA-MODEL §12)** nằm ở `prisma/migrations/manual/p0_add_review_module.sql`; riêng index `path varchar_pattern_ops` khai được trong Prisma (`ops: raw(...)`) nên nằm trong schema (được Prisma quản lý).
4. **Status mapping:** `'Revision'` thay cho "Sửa lại" ở MỌI chỗ spec nhắc (Q11, Flow 6, FR-D02). String hiển thị hoạt động "Khách hàng yêu cầu chỉnh sửa" giữ nguyên như spec (đã có pattern trong app).
5. **Topology deploy (bài học sự cố 2026-07-04):** production deploy từ **main** qua PR merge; push nhánh chỉ tạo preview; postinstall `db push` chạy MỌI build → schema nhánh lên prod DB ngay từ preview build. Hệ quả: thay đổi schema **additive luôn an toàn**; thay đổi **destructive phải chờ code lên main** (đã vi phạm 1 lần → share portal sập ~15 phút, khắc phục bằng restore schema cũ).
6. **Env:** `CRON_SECRET` + `NEXT_PUBLIC_APP_URL` đã có sẵn — không thêm. Danh sách biến mới trong `.env.example`. Email transport thực tế của repo là **Resend** (không phải SendGrid như file đối chiếu ghi) — liên quan P2 notification.

## Trạng thái provisioning (P0)

- R2: keys đã nhận (bucket `hustly-review` — chờ xác nhận đã tạo + CORS + APAC hint).
- Mux: `MUX_TOKEN_ID` đã nhận; **THIẾU** `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `MUX_SIGNING_KEY_ID`; `MUX_SIGNING_PRIVATE_KEY` nhận được NGẮN bất thường (~76 ký tự — Mux trả base64 PEM ~2200 ký tự) → cần lấy lại.
- Inngest: event key + signing key đã nhận.
- `REVIEW_COOKIE_SECRET`: đã generate (local .env). Mọi biến cần dán vào Vercel (Prod+Preview+Dev).
