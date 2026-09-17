/**
 * Cổng chặn cho `prisma db push` trong `postinstall` — mặc định KHÔNG chạy.
 *
 * ─── VÌ SAO ────────────────────────────────────────────────────────────────
 * `postinstall` trước đây là `prisma generate && prisma db push`. `db push` sửa
 * thẳng cấu trúc database cho khớp schema.prisma — không migration, không review.
 * Nó đọc DATABASE_URL, mà DATABASE_URL của repo này trỏ PRODUCTION. Nên:
 *
 *   • MỌI lần merge vào `main` -> Vercel build -> đẩy schema vào database KHÁCH.
 *     (Đọc được trong log build production: "Your database is now in sync…"
 *      với datasource ep-autumn-flower-* = production.)
 *   • MỌI lần `npm install` trên máy lập trình viên -> y hệt như vậy, vì Prisma CLI
 *     đọc `.env` (production) và KHÔNG BAO GIỜ đọc `.env.local`, dưới mọi NODE_ENV.
 *
 * Đã có hậu quả thật: IMPLEMENTATION-NOTES.md ghi cổng chia sẻ khách sập ~15 phút.
 *
 * ─── ĐIỀU PHẢI BIẾT SAU THAY ĐỔI NÀY ───────────────────────────────────────
 * Sau file này, KHÔNG còn cơ chế tự động nào đưa schema lên production, và
 * `prisma migrate deploy` KHÔNG thay thế được: prisma/migrations/ đã chết (5 file,
 * mới nhất 2026-05-07; migration init tạo 2 trên 67 model; toàn bộ module review
 * không có mặt). BlazingStation_SRS.md:137 nói thẳng dự án không dùng migration.
 *
 * Hệ quả: đổi schema xong mà quên đẩy thì KHÔNG có tín hiệu nào. Build vẫn xanh
 * (không route nào query DB lúc build), deploy vẫn READY, và lỗi chỉ nổ ở request
 * đầu tiên chạm model đó — Prisma P2022 "column does not exist" — do KHÁCH phát hiện.
 *
 * Vì vậy quy trình mới, BẮT BUỘC làm tay và có chủ đích:
 *
 *   ALLOW_DB_PUSH=1 DATABASE_URL="<chuỗi kết nối>" node scripts/maybe-db-push.mjs
 *
 * Truyền DATABASE_URL nội tuyến là bắt buộc, không phải cho đẹp — Prisma CLI đọc
 * `.env` chứ không đọc `.env.local`, nên lệnh trần sẽ trúng production ngay cả trên
 * máy đã cấu hình `.env.local` đúng.
 *
 * Thứ tự an toàn: thêm cột thì đẩy TRƯỚC khi merge code đọc nó; xoá cột thì đẩy SAU
 * khi code thôi dùng đã lên production.
 */
import { spawnSync } from 'node:child_process'

const PROD_MARKER = 'ep-autumn-flower'

const url = process.env.DATABASE_URL || ''
// [kiểm toán 2026-07 · phản biện] So khớp phải KHÔNG PHÂN BIỆT HOA THƯỜNG. Tên miền DNS
// vốn không phân biệt hoa thường, nên `...@EP-AUTUMN-FLOWER-123.neon.tech/db` vẫn tới đúng
// production, trong khi `host.includes('ep-autumn-flower')` trả false và cổng cho qua.
// Đã chạy thử đúng chuỗi đó: trước sửa ra blocked=false.
const rawHost = (url.match(/@([^/?]+)/) || [])[1] || ''
const host = rawHost ? rawHost.toLowerCase() : '(không đọc được)'

if (process.env.ALLOW_DB_PUSH !== '1') {
    console.log('  [maybe-db-push] BỎ QUA `prisma db push` (mặc định).')
    console.log('  [maybe-db-push] Đổi prisma/schema.prisma? Phải tự đẩy, có chủ đích:')
    console.log('  [maybe-db-push]   ALLOW_DB_PUSH=1 DATABASE_URL="<chuỗi>" node scripts/maybe-db-push.mjs')
    process.exit(0)
}

// [kiểm toán 2026-07 · phản biện] Cổng này TỪNG FAIL-OPEN, và fail-open đúng vào
// trường hợp thường gặp nhất. Nó soi `process.env.DATABASE_URL`, nhưng tiến trình con
// (`prisma db push`) KHÔNG đọc biến đó — Prisma CLI tự nạp `.env` (= production).
// Khi DATABASE_URL vắng mặt trong môi trường (trạng thái bình thường của `npm install`),
// `host` thành '(không đọc được)', chuỗi đó không chứa PROD_MARKER, cổng cho qua — rồi
// tiến trình con vẫn đẩy schema vào PRODUCTION. Cổng gác một biến, còn con dao cầm biến khác.
//
// Cách bịt: bắt buộc phải có DATABASE_URL, và truyền CHÍNH nó xuống tiến trình con, để
// thứ được kiểm và thứ được dùng luôn là một.
if (!url) {
    console.error('\n  [maybe-db-push] DỪNG — ALLOW_DB_PUSH=1 nhưng KHÔNG có DATABASE_URL.')
    console.error('  [maybe-db-push] Không đặt biến này thì Prisma CLI sẽ tự đọc `.env` = PRODUCTION.')
    console.error('  [maybe-db-push] Nói rõ đích đến:')
    console.error('  [maybe-db-push]   ALLOW_DB_PUSH=1 DATABASE_URL="<chuỗi>" node scripts/maybe-db-push.mjs\n')
    process.exit(1)
}

// Bật cờ vẫn CHƯA đủ để chạm production. Đây là lần thứ hai phải hỏi, vì cờ
// ALLOW_DB_PUSH rất dễ bị đặt sẵn trong môi trường CI hoặc shell rồi quên mất.
if (host.includes(PROD_MARKER) && process.env.ALLOW_DB_PUSH_PRODUCTION !== '1') {
    console.error(`\n  [maybe-db-push] DỪNG — DATABASE_URL trỏ PRODUCTION (${host}).`)
    console.error('  [maybe-db-push] ALLOW_DB_PUSH=1 một mình KHÔNG mở được production.')
    console.error('  [maybe-db-push] Nếu thật sự có chủ đích, đặt thêm ALLOW_DB_PUSH_PRODUCTION=1.\n')
    process.exit(1)
}

console.log(`  [maybe-db-push] ĐANG CHẠY prisma db push -> ${host}`)
const r = spawnSync('npx', ['prisma', 'db', 'push'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // Ghim đích đến đã qua kiểm duyệt vào môi trường con, đừng để Prisma tự đi tìm `.env`.
    env: { ...process.env, DATABASE_URL: url },
})
// `r.status` là null khi tiến trình con không spawn được hoặc bị tín hiệu giết. `?? 0`
// biến cả hai thành "thành công", nên CI sẽ xanh trong khi schema chưa hề được đẩy.
if (r.error || r.status === null) {
    console.error(`\n  [maybe-db-push] DỪNG — không chạy được prisma db push: ${r.error?.message ?? 'bị tín hiệu dừng'}\n`)
    process.exit(1)
}
process.exit(r.status)
