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

## Trạng thái provisioning (P0) — verify 2026-07-04 (`scripts/probe-review-provisioning.ts`)

- **R2: ✅ HOÀN CHỈNH.** Bucket `hustly-review` tồn tại, credentials hợp lệ; presigned PUT 1MB → đọc được ETag (= MD5 body), presigned GET round-trip OK; **CORS chuẩn** — preflight 204 cho `hustlytasker.xyz` + `localhost:3000` (PUT/GET/HEAD) và response PUT thật có `Access-Control-Expose-Headers: ETag` (bắt buộc cho multipart từ browser). Lưu ý: `GetBucketCors` qua API trả AccessDenied vì token R2 chỉ có quyền Object R/W (không đọc được config bucket) — vô hại, đã verify bằng preflight thật.
- **Mux: ✅ dùng được.** Access Token hợp lệ (GET /video/v1/assets → 200); `MUX_SIGNING_PRIVATE_KEY` bản đủ (2240 ký tự base64 → RSA 2048-bit, ký/verify RS256 OK); webhook secret + signing key id đã nhận. ⚠️ Token **không có scope System** → không verify được `MUX_SIGNING_KEY_ID` qua API (403 "correct scope"); việc ký playback JWT là ký LOCAL bằng private key nên không cần scope này — cặp keyId/privateKey sẽ được xác nhận thực tế khi play video signed đầu tiên (P2/P3).
- **Inngest: ✅ event key hợp lệ** (`inn.gs` → 200 + event id). Signing key đúng format `signkey-prod-<64hex>`; handshake thật diễn ra khi deploy + sync app trên dashboard Inngest.
- **DoD local `/r/bat-ky` → 404 ✅** (kèm noindex + no-referrer + x-request-id; KHÔNG redirect login — đối chứng `/admin` → 307 /login).
- `REVIEW_COOKIE_SECRET`: đã generate (nằm trong `.env` local — mở file để copy). Webhook Mux: bản đầu user tạo trỏ nhầm root `hustlytasker.xyz/` → đã xoá, tạo lại đúng `/api/webhooks/mux` (secret MỚI — Mux không cho sửa URL webhook, secret gắn theo từng webhook).

## ✅ P0 ĐÓNG — DoD end-to-end PASS 14/14 trên production (2026-07-04, `scripts/probe-review-p0-dod.ts`)

Sau khi merge main + env vào Vercel: `/r/bat-ky` prod → 404 noindex không redirect; **PUT /api/inngest → "Successfully registered"**; cron janitor 401-khi-không-auth / 200-với-Bearer; **asset Mux thật** (demo 23s, basic, đã xoá) → webhook `video.asset.ready` về prod, HMAC pass, ledger 1 row, **Inngest function chạy + claim (`processedAt` set)**; replay cùng event id (ký hợp lệ) → `duplicated:true` không thêm row; chữ ký sai → 401 fail-closed. → **Sang P1 (upload pipeline).**
- 📌 **P1 TODO — CSP:** `next.config` hiện giới hạn `connect-src`/`media-src` → phải mở thêm `connect-src https://<account>.r2.cloudflarestorage.com` (browser PUT parts) và `media-src blob: https://stream.mux.com` + `img-src https://image.mux.com` (playback P2) khi cắm upload/player.

## P1.1 + P1.2 — Upload pipeline (2026-07-04)

- **P1.1 lib** (`src/lib/review/`): `media-constants` (MIME allowlist + caps + `mediaKindFromMime`), `upload-helpers` (part-size **tiered 10/20/50MB theo UPLOAD-PIPELINE §4** — KHÔNG theo prose API-SPEC §2.1; `buildR2Key`, `buildSystemKey`, `slugifyBrand`, `looksLikeMedia`, `parseFps`), `r2` (S3 multipart), `mux` (REST hand-rolled, **0 dep mới** — `@mux/mux-node` sẽ khiến `db push` chạy lại mỗi build), `route-auth` (`withReviewRoute` error boundary). DoD probe `scripts/probe-review-upload-lib.ts` 33/33 trên hạ tầng thật (R2 roundtrip + Mux create→ready→delete). ⚠️ target ES2017 → dùng `BigInt(n)` không dùng literal `n`.
- **P1.2 routes**: `POST /api/review/uploads/initiate` (201 mới / 200 replay idempotency-key), `POST …/[id]/complete`, `POST …/[id]/abort`, `GET …/[id]` (poll). Lõi ở `upload-service.ts`; DTO ở `dto.ts`; activity ở `activity.ts`. `sign-parts` KHÔNG là route riêng — refresh URL = gọi lại `initiate` cùng `Idempotency-Key` (đúng spec §2.1). Mux create-asset **dời sang Inngest** (`review/upload.completed`, consumer ở P1.4) để giữ complete <60s.
- **Mô hình concurrency (đã qua 3 vòng review đối kháng, 7+2+2 finding đã fix):** `version.pipelineStatus` là **single source of truth / claim token**. Complete chiếm finalize bằng atomic `updateMany(UPLOADING→UPLOADED)`; abort chiếm bằng `updateMany(UPLOADING→FAILED)` — **cùng 1 row → loại trừ nhau tuyệt đối**. `session.completedAt` = "R2 đã finalize thật" (cổng cho `driveCompletion`, set SAU R2). `driveCompletion` idempotent (atomic flip `UPLOADED→READY|PROCESSING` bầu 1 request ghi activity + gửi Inngest). Abort xóa version có mục tiêu + `reviewAsset.deleteMany({versions:{none}})` (KHÔNG bulk-cascade → không nuốt version anh em đồng thời). R2 finalize lỗi → `revertFinalizeClaim` (UPLOADED→UPLOADING) cho retry. Poll **tự chữa lành** version kẹt UPLOADED (crash giữa completedAt và drive).
- 📌 **P1.6 reconcile BẮT BUỘC xử lý:** (a) `UploadSession` quá 24h chưa complete → AbortMultipartUpload + version FAILED; (b) version kẹt `PROCESSING` quá lâu (webhook Mux miss) → GET Mux asset đối chiếu; (c) **residual crash window**: `session.completedAt` set nhưng version vẫn `UPLOADED` mà không còn ai poll/complete → re-drive. Hiện `reviewJanitor` vẫn là skeleton P0.
- **DTO probe** `scripts/probe-review-dto.ts` 24/24 (serializeVersion/status maps/toUserRef — phần test được không cần session). Routes cần session cookie nên KHÔNG probe e2e qua tsx được (giới hạn `getSession()`); verify = tsc + build + review đối kháng.
