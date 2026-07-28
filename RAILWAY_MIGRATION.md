# Chuyển từ Vercel + Neon → Railway (app + Postgres) + Supabase Storage

Mục tiêu: hạ chi phí ~$40/tháng → ~$8-15/tháng, **không downtime** (Vercel vẫn chạy cho tới khi bạn đổi domain).

Phần CODE đã chuẩn bị sẵn (commit trên branch `claude/cranky-austin`):
- `src/lib/storage.ts` — uploader chọn backend theo env: Vercel Blob (mặc định khi còn `BLOB_READ_WRITE_TOKEN`) hoặc Supabase Storage. → Vercel hiện tại KHÔNG bị ảnh hưởng.
- `nixpacks.toml` — cài Chromium cho việc tạo PDF hoá đơn.
- `next.config.ts` — cho phép ảnh từ `*.supabase.co` + chỉ bật BotId khi chạy trên Vercel.
- Cron (`/api/cron/*`) đã dùng `Authorization: Bearer $CRON_SECRET` → chạy với scheduler bất kỳ, **không sửa code**.

---

## 0. Chuẩn bị: gom biến môi trường
Vào Vercel → Project → Settings → Environment Variables, copy hết ra. Bộ cần có trên Railway:
`DATABASE_URL` (sẽ thay bằng của Railway), `JWT_SECRET`/secret auth, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`,
`LIVEKIT_*`, `GOOGLE_*`, `DROPBOX_*`, `OPENAI_API_KEY`, `CRON_SECRET`, và các key khác bạn đang dùng.
Thêm mới: `STORAGE_DRIVER=supabase`, `SUPABASE_STORAGE_BUCKET=public-uploads`,
`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.

## 1. Tạo bucket lưu ảnh (Supabase — bạn đã có account)
Supabase Dashboard → Storage → New bucket → tên `public-uploads`, bật **Public**. Xong. (Không cần credential mới — app đã có `SUPABASE_SERVICE_ROLE_KEY`.)

## 2. Tạo project Railway + Postgres
1. railway.app → New Project → Deploy from GitHub repo → chọn repo này, branch bạn muốn (nên dùng branch đã merge các fix).
2. Trong project: **+ New → Database → PostgreSQL**. Railway tạo 1 Postgres + biến `DATABASE_URL`.
3. Service app: Settings → Variables → dán toàn bộ env ở mục 0 (đặt `DATABASE_URL` = tham chiếu tới Postgres của Railway: `${{ Postgres.DATABASE_URL }}`).

## 3. Deploy lần đầu (tạo schema rỗng)
Railway tự build (`next build --webpack`) rồi chạy `next start`.

> ⚠️ **CẬP NHẬT (kiểm toán 2026-07, commit `0756cfb`).** Bước này TRƯỚC ĐÂY dựa vào `postinstall`
> tự chạy `prisma db push`. **Cơ chế đó đã bị gỡ** — `postinstall` nay chỉ `prisma generate`, còn
> `db push` phải gọi tay có chủ đích. Làm theo bản cũ sẽ ra một database **KHÔNG có bảng nào**, và
> bước `pg_restore --data-only` ở mục 4 sẽ thất bại vì không có bảng để đổ dữ liệu vào.
>
> Tạo schema bằng tay, trỏ đúng vào Postgres của Railway:
>
> ```
> ALLOW_DB_PUSH=1 DATABASE_URL="<DATABASE_URL của Railway>" node scripts/maybe-db-push.mjs
> ```
>
> Truyền `DATABASE_URL` nội tuyến là bắt buộc: Prisma CLI đọc `.env` (production) chứ không đọc
> `.env.local`, nên lệnh trần sẽ trúng nhầm database.
> Nếu build fail ở bước cài Chromium: tạm xoá `nixpacks.toml`, deploy cho chạy được, rồi xử lý PDF sau (xem mục 7).

## 4. Chuyển DỮ LIỆU từ Neon → Railway (data-only)
Vì schema đã được Prisma tạo ở bước 3, ta chỉ chuyển **dữ liệu**. Trên máy bạn (cần cài `postgresql-client`):

```bash
# Lấy 2 connection string: NEON_URL (từ Neon), RAILWAY_URL (Railway → Postgres → Connect → Postgres Connection URL)

# 1) Dump CHỈ dữ liệu từ Neon
pg_dump "$NEON_URL" --data-only --no-owner --no-privileges \
  --disable-triggers -Fc -f neon-data.dump

# 2) Nạp vào Railway (disable-triggers để bỏ qua thứ tự khoá ngoại)
pg_restore --data-only --disable-triggers --no-owner \
  -d "$RAILWAY_URL" neon-data.dump
```
Nếu `pg_restore` báo vài lỗi "already exists"/sequence, thường vô hại; kiểm tra lại số dòng bằng cách đăng nhập app.
> Cách thay thế (đơn giản hơn nếu data-only lỗi FK): bỏ bước 3, dump FULL `pg_dump "$NEON_URL" -Fc -f neon-full.dump` rồi `pg_restore --clean --if-exists --no-owner -d "$RAILWAY_URL" neon-full.dump` vào DB rỗng (đừng để `prisma db push` chạy trước — set tạm env `NIXPACKS_NO_POSTINSTALL` hoặc xoá postinstall cho lần đầu).

## 5. Cron (6 job) — dùng cron-job.org miễn phí
Với mỗi job dưới đây, tạo 1 cron trên https://cron-job.org trỏ tới `https://<app-railway-url>/api/cron/<tên>`,
method GET, thêm header `Authorization: Bearer <CRON_SECRET của bạn>`:
| Endpoint | Lịch |
|---|---|
| `/api/cron/send-digest` | mỗi giờ |
| `/api/cron/check-deadline` | mỗi giờ |
| `/api/cron/cleanup-notifications` | 02:00 |
| `/api/cron/hard-delete-workspaces` | 03:00 |
| `/api/cron/hard-delete-profiles` | 03:30 |
| `/api/cron/auth-cleanup` | 04:00 |
(Hoặc dùng Railway Cron service — nhưng cron-job.org nhanh hơn cho 6 job nhỏ.)

## 6. Cập nhật domain + OAuth callback
Đổi sang URL Railway (hoặc custom domain bạn gắn ở Railway → Settings → Networking):
- `NEXT_PUBLIC_APP_URL` = URL mới.
- Google OAuth (Cloud Console) → Authorized redirect URIs: thêm `https://<url-mới>/api/auth/google/callback`.
- Dropbox / Google Drive app → redirect URI: thêm các callback `/api/integrations/*/callback`.
- LiveKit / Resend: nếu có cấu hình domain thì cập nhật.

## 7. PDF hoá đơn (Chromium) — kiểm tra sau deploy
Code đã ưu tiên `PUPPETEER_EXECUTABLE_PATH`. Đảm bảo env `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` + `nixpacks.toml` đã cài `chromium`. Tạo thử 1 hoá đơn PDF để xác nhận.
> Nếu vẫn lỗi: phương án chắc ăn là chuyển sang build bằng **Dockerfile** (image Node + cài chromium). Báo mình, mình viết Dockerfile cho.

## 8. Cutover + checklist xác nhận
Test trên URL Railway TRƯỚC khi đổi DNS:
- [ ] Đăng nhập (email + Google) OK.
- [ ] Upload avatar/QR/logo → ảnh hiện (lưu trên Supabase Storage, URL `*.supabase.co`).
- [ ] Tạo task / Velox scan chạy (không còn giới hạn timeout).
- [ ] Realtime thông báo chạy (nếu lỗi: thêm `wss://*.supabase.co https://*.supabase.co` vào `connect-src` trong `next.config.ts` CSP).
- [ ] Tạo PDF hoá đơn.
- [ ] Cron chạy (xem log 1 job).
Khi OK → trỏ domain chính sang Railway → tắt Vercel Pro + xoá Neon (sau khi chắc chắn dữ liệu đã sang đủ).

## 9. Rollback
Vercel + Neon vẫn còn nguyên trong suốt quá trình. Nếu Railway có vấn đề, chỉ cần trỏ domain về Vercel lại — không mất gì.

---
**Mình (Claude) lo phần code.** Bạn lo phần account/infra ở trên (mình không có quyền vào Railway/Neon/Supabase của bạn). Vướng bước nào gửi log, mình gỡ.
