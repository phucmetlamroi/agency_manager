/**
 * [Chẩn đoán · mục C1] Reverse proxy có để lọt header IP giả không? — chỉ đọc.
 *
 * src/lib/request-ip.ts đọc `x-real-ip` ĐẦU TIÊN, và chú thích trong chính file
 * đó nói rõ vì sao: "Vercel sets them to the TRUE connecting client and
 * OVERRIDES anything the caller sent". Rời Vercel là giả định đó hết đúng —
 * nginx/Caddy KHÔNG tự ghi đè, chúng chuyển tiếp nguyên xi header khách gửi lên.
 *
 * Chạy sau khi bắn một request kèm `X-Real-IP: 203.0.113.77` vào
 * /api/log-client-error (route đó ghi thẳng IP vào RateLimitBucket).
 *
 * Chạy: npx tsx scripts/ent/probe-real-ip.ts
 */
import { prisma } from '../../src/lib/db'

const FORGED = '203.0.113.77' // TEST-NET-3, dải dành riêng cho tài liệu

async function main() {
    const rows = await prisma.rateLimitBucket.findMany({
        where: { key: { startsWith: 'client-error:' } },
        orderBy: { windowStart: 'desc' },
        take: 8,
        select: { key: true, count: true, windowStart: true },
    })

    if (rows.length === 0) {
        console.log('\nChưa có bản ghi nào. Bắn request thử trước:')
        console.log(`  curl -X POST https://hustlytasker.xyz/api/log-client-error \\`)
        console.log(`    -H 'Content-Type: application/json' -H 'X-Real-IP: ${FORGED}' \\`)
        console.log(`    -d '{"message":"probe"}'\n`)
        return
    }

    console.log('\nIP mà máy chủ GHI LẠI được (mới nhất trước):\n')
    for (const r of rows) {
        const ip = r.key.replace('client-error:', '')
        const mins = Math.round((Date.now() - r.windowStart.getTime()) / 60000)
        console.log(`  ${ip.padEnd(40)} ${String(r.count).padStart(3)} lượt   ${mins} phút trước`)
    }

    const newest = rows[0].key.replace('client-error:', '')
    console.log('\n── Chẩn đoán ──')
    if (newest === FORGED) {
        console.log('  🔴 HEADER GIẢ ĐI LỌT.')
        console.log('     Máy chủ tin vào IP do người gọi tự khai ⇒ mọi giới hạn tần suất theo IP')
        console.log('     bị vô hiệu (chỉ cần đổi header mỗi lượt), và LoginAttempt.ipAddress ghi')
        console.log('     giá trị kẻ tấn công tự đặt ⇒ nhật ký điều tra vô giá trị.')
        console.log('     SỬA: bắt reverse proxy GHI ĐÈ X-Real-IP bằng IP TCP thật.')
    } else if (newest === '127.0.0.1' || newest === '::1' || newest.startsWith('10.') || newest.startsWith('172.') || newest.startsWith('192.168.')) {
        console.log(`  🟠 Máy chủ chỉ thấy IP nội bộ (${newest}).`)
        console.log('     Header giả bị chặn (tốt) nhưng MỌI khách gộp chung một xô giới hạn')
        console.log('     tần suất ⇒ một người gõ sai mật khẩu là khoá cả thiên hạ, và nhật ký')
        console.log('     đăng nhập không phân biệt được ai với ai.')
        console.log('     SỬA: chuyển tiếp IP TCP thật của khách xuống ứng dụng.')
    } else {
        console.log(`  🟢 ĐÚNG — máy chủ ghi IP công cộng thật (${newest}), không phải header giả.`)
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
