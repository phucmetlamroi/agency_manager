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
 *   ALLOW_DB_PUSH=1 DATABASE_URL="<chuỗi kết nối>" npx prisma db push
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
const host = (url.match(/@([^/?]+)/) || [])[1] || '(không đọc được)'

if (process.env.ALLOW_DB_PUSH !== '1') {
    console.log('  [maybe-db-push] BỎ QUA `prisma db push` (mặc định).')
    console.log('  [maybe-db-push] Đổi prisma/schema.prisma? Phải tự đẩy, có chủ đích:')
    console.log('  [maybe-db-push]   ALLOW_DB_PUSH=1 DATABASE_URL="<chuỗi>" npx prisma db push')
    process.exit(0)
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
const r = spawnSync('npx', ['prisma', 'db', 'push'], { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 0)
