// [AUDIT HT-029] Chặn bản dựng desktop nếu có file .env lọt vào cây standalone.
//
// SỰ CỐ GỐC: `output: 'standalone'` chép NGUYÊN cây thư mục dự án vào .next/standalone, và cây đó
// đã cuốn theo một file .env thật (2733 byte) với DATABASE_URL, JWT_SECRET, CRON_SECRET,
// RESEND_API_KEY, UPSTASH token, TURNSTILE secret. electron-builder rồi đóng gói nguyên thư mục
// resources/ vào app cài đặt. Ai cầm bản cài — editor, khách — là mở file text ra đọc được hết.
// Với JWT_SECRET họ tự ký cookie phiên cho BẤT KỲ tài khoản nào; với DATABASE_URL họ nối thẳng
// vào Postgres, đi vòng qua toàn bộ lớp phân quyền của ứng dụng.
//
// Bộ lọc trong builder.config.js là tuyến một. Đây là tuyến hai: một bản dựng có secret phải
// GÃY chứ không được im lặng đi tiếp. Lỗi kiểu này không ai phát hiện bằng mắt — installer vẫn
// chạy bình thường.
//
// Chạy sau `next build` và TRƯỚC khi đóng gói electron.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['.next/standalone', 'electron/release']
const MAX_DEPTH = 12

/** Mọi biến thể: .env, .env.local, .env.production, .env.local.bak … */
function isEnvFile(name) {
    return name === '.env' || name.startsWith('.env.')
}

function scan(dir, depth, hits) {
    if (depth > MAX_DEPTH) return
    let entries
    try {
        entries = readdirSync(dir, { withFileTypes: true })
    } catch {
        return // thư mục biến mất giữa chừng / không đọc được → bỏ qua
    }
    for (const e of entries) {
        const full = join(dir, e.name)
        if (e.isDirectory()) {
            // node_modules không phải nơi .env của dự án nằm, và quét nó tốn rất nhiều thời gian.
            if (e.name === 'node_modules' || e.name === '.git') continue
            scan(full, depth + 1, hits)
        } else if (isEnvFile(e.name)) {
            let size = 0
            try { size = statSync(full).size } catch { /* ignore */ }
            hits.push({ path: full, size })
        }
    }
}

const hits = []
for (const root of ROOTS) {
    if (existsSync(root)) scan(root, 0, hits)
}

if (hits.length === 0) {
    console.log('  [assert-no-env] OK — không có .env nào trong cây đóng gói.')
    process.exit(0)
}

console.error('')
console.error('  ❌ DỪNG BẢN DỰNG — có file .env nằm trong cây sẽ được đóng gói:')
for (const h of hits) {
    // In ĐƯỜNG DẪN thôi. TUYỆT ĐỐI không in nội dung: log build thường được lưu lại và chia sẻ.
    console.error(`     · ${relative(process.cwd(), h.path)}  (${h.size} byte)`)
}
console.error('')
console.error('  Bản cài desktop mang theo file này = ai cầm installer cũng đọc được JWT_SECRET,')
console.error('  DATABASE_URL, CRON_SECRET… Xoá file khỏi cây standalone rồi dựng lại.')
console.error('  Nếu quả thật cần một .env trong bản đóng gói, hãy đổi chủ ý và sửa script này —')
console.error('  đừng bỏ qua bước kiểm tra.')
console.error('')
process.exit(1)
