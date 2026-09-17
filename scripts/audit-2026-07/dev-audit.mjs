/**
 * Khởi động `next dev` GẮN CHẶT vào nhánh Neon thử nghiệm — fail-closed.
 *
 *   node scripts/audit-2026-07/dev-audit.mjs
 *
 * ─── VÌ SAO CẦN FILE NÀY ────────────────────────────────────────────────────
 * `npm run dev` KHÔNG an toàn để chạy kiểm chứng, và lý do rất khó thấy.
 *
 * Next chỉ nạp `.env.local` khi NODE_ENV là `development` hoặc `production`.
 * Khi NODE_ENV=`test` — thứ mà nhiều bộ chạy tự động đặt sẵn — Next **bỏ qua
 * `.env.local`** và chỉ nạp `.env`. Mà `.env` trỏ vào DATABASE PRODUCTION.
 *
 * Đo được ngày 2026-07-28 trên chính repo này:
 *
 *   NODE_ENV=development  nạp: .env.local, .env   -> ep-round-lab-ahzs61vb  (thử nghiệm)
 *   NODE_ENV=test         nạp: .env               -> ep-autumn-flower       (PRODUCTION)
 *   NODE_ENV=production   nạp: .env.local, .env   -> ep-round-lab-ahzs61vb  (thử nghiệm)
 *
 * Dấu hiệu duy nhất khi việc này xảy ra là MỘT dòng trong log khởi động:
 *
 *   - Environments: .env          <- SAI: thiếu .env.local, đang ở production
 *   - Environments: .env.local, .env   <- ĐÚNG
 *
 * Không ai đọc dòng đó. Máy chủ vẫn khởi động, vẫn phục vụ trang, chỉ là nó
 * đang nói chuyện với database của khách. Đây chính là cách sự cố "máy chủ chạy
 * thử lần đầu đã chạy trên database thật" trong docs/audit-2026-07 xảy ra; hồi
 * đó chưa tìm ra nguyên nhân, giờ thì có.
 *
 * File này bịt lỗ đó bằng cách KHÔNG tin vào việc nạp env chút nào: nó tự đọc
 * `.env.local`, tự kiểm, và chỉ khởi động khi chắc chắn đúng nhánh.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Cùng bộ marker với scripts/audit-2026-07/probe-parity.ts — một nguồn sự thật. */
const TEST_MARKER = 'ep-round-lab-ahzs61vb'
const PROD_MARKER = 'ep-autumn-flower'

const root = process.cwd()

function die(msg) {
    console.error(`\n  DỪNG — ${msg}\n`)
    process.exit(1)
}

let raw
try {
    raw = readFileSync(join(root, '.env.local'), 'utf8')
} catch {
    die('không đọc được .env.local. Chạy lệnh này từ thư mục gốc của worktree.')
}

// Chỉ lấy DATABASE_URL, và chỉ từ dòng KHÔNG phải comment — `.env.local` cố ý
// nhắc tên host production trong phần chú thích cảnh báo, nên một phép grep ngây
// thơ trên cả file sẽ thấy PROD_MARKER và báo động nhầm.
const line = raw
    .split(/\r?\n/)
    .find((l) => /^\s*DATABASE_URL\s*=/.test(l))
if (!line) die('.env.local không có dòng DATABASE_URL nào.')

const url = line.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^["']|["']$/g, '')
const host = (url.match(/@([^/?]+)/) || [])[1] || ''

if (host.includes(PROD_MARKER)) die(`DATABASE_URL trỏ vào PRODUCTION (${host}).`)
if (!host.includes(TEST_MARKER)) die(`DATABASE_URL trỏ vào một host lạ (${host}). Chỉ chấp nhận "${TEST_MARKER}".`)

console.log(`  ✓ Database: ${host}`)
console.log('  ✓ NODE_ENV=development (bắt buộc, để Next không bỏ qua .env.local)')
console.log('  ✓ DATABASE_URL truyền thẳng qua biến môi trường tiến trình — luôn thắng mọi file .env\n')

const child = spawn('npx', ['next', 'dev'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
        ...process.env,
        NODE_ENV: 'development',
        // Thắt lưng + dây đeo: kể cả khi việc nạp file env vẫn sai, biến môi
        // trường của tiến trình vẫn được ưu tiên hơn mọi file .env.
        DATABASE_URL: url,
    },
})

child.on('exit', (code) => process.exit(code ?? 0))
