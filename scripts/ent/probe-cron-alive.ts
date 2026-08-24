/**
 * [Chẩn đoán · mục B2] 8 lịch cron có thật sự chạy không? — chỉ đọc.
 *
 * Cron hỏng là hỏng LẶNG LẼ: không log, không lỗi, không ai báo. Cách duy nhất
 * biết được là tìm DẤU VẾT chúng để lại trong cơ sở dữ liệu. Mỗi job dưới đây
 * có một dấu vết riêng mà chỉ nó mới tạo ra được.
 *
 * Chạy: npx tsx scripts/ent/probe-cron-alive.ts
 */
import { prisma } from '../../src/lib/db'

const H = (n: number) => new Date(Date.now() - n * 3600_000)
const ago = (d: Date | null) => {
    if (!d) return 'chưa bao giờ'
    const m = Math.round((Date.now() - d.getTime()) / 60000)
    if (m < 60) return `${m} phút trước`
    if (m < 1440) return `${Math.floor(m / 60)} giờ trước`
    return `${Math.floor(m / 1440)} ngày trước`
}

async function main() {
    console.log('')

    // ── check-deadline (mỗi giờ) — NƠI DUY NHẤT ghi status 'Quá hạn' ──
    const overdueMarked = await prisma.task.findFirst({
        where: { status: 'Quá hạn' },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
    })
    const shouldBeOverdue = await prisma.task.count({
        where: { deadline: { lt: new Date() }, assigneeId: { not: null }, status: { not: 'Quá hạn' } },
    })
    console.log('── check-deadline (mỗi giờ) ─────────────────────────────')
    console.log(`   Lần cuối đánh dấu 'Quá hạn' : ${ago(overdueMarked?.updatedAt ?? null)}`)
    console.log(`   Task ĐANG quá hạn chưa đánh dấu: ${shouldBeOverdue}`)
    console.log(
        shouldBeOverdue > 0
            ? `   ⚠️  Còn ${shouldBeOverdue} task quá hạn chưa được xử lý ⇒ cron nhiều khả năng KHÔNG chạy.`
            : '   ✅ Không tồn đọng.',
    )

    // ── send-digest (mỗi giờ) — đánh dấu emailSentAt ──
    const lastEmail = await prisma.notification.findFirst({
        where: { emailSentAt: { not: null } },
        orderBy: { emailSentAt: 'desc' },
        select: { emailSentAt: true },
    })
    const pendingEmail = await prisma.notification.count({
        where: { emailSentAt: null, createdAt: { lt: H(2) } },
    })
    console.log('\n── send-digest (mỗi giờ) ────────────────────────────────')
    console.log(`   Email digest gửi lần cuối : ${ago(lastEmail?.emailSentAt ?? null)}`)
    console.log(`   Thông báo chờ gửi (>2h)   : ${pendingEmail}`)

    // ── review-janitor (03:00 VN) — QUAN TRỌNG NHẤT VỀ TIỀN ──
    const lost = await prisma.webhookEvent.count({
        where: { processedAt: null, receivedAt: { lt: H(24 * 7) } },
    })
    const salvageable = await prisma.webhookEvent.count({
        where: { processedAt: null, receivedAt: { gte: H(24 * 7), lt: H(1) } },
    })
    const lastProcessed = await prisma.webhookEvent.findFirst({
        where: { processedAt: { not: null } },
        orderBy: { processedAt: 'desc' },
        select: { processedAt: true },
    })
    console.log('\n── review-janitor (03:00 VN — job giữ tiền) ─────────────')
    console.log(`   Webhook xử lý lần cuối        : ${ago(lastProcessed?.processedAt ?? null)}`)
    console.log(`   🔴 ĐÃ MẤT VĨNH VIỄN (>7 ngày) : ${lost}`)
    console.log(`   🟡 CÒN CỨU ĐƯỢC (<7 ngày)     : ${salvageable}`)
    if (salvageable > 0) console.log('   ⚠️  Chạy janitor NGAY — số này sẽ chuyển sang cột "mất vĩnh viễn" khi quá 7 ngày.')
    if (lost === 0 && salvageable === 0) console.log('   ✅ Không có webhook nào bị bỏ rơi.')

    // ── auth-cleanup (04:00 UTC) — xoá LoginAttempt >90 ngày ──
    const oldAttempts = await prisma.loginAttempt.count({ where: { createdAt: { lt: H(24 * 90) } } })
    console.log('\n── auth-cleanup (04:00 UTC) ─────────────────────────────')
    console.log(`   LoginAttempt cũ hơn 90 ngày còn sót: ${oldAttempts}`)
    console.log(oldAttempts > 0 ? '   ⚠️  Đáng lẽ đã bị xoá ⇒ cron không chạy.' : '   ✅ Sạch.')

    // ── cleanup-notifications (02:00 UTC) ──
    const oldNotifs = await prisma.notification.count({
        where: { OR: [{ isArchived: true, createdAt: { lt: H(24 * 30) } }, { isRead: true, createdAt: { lt: H(24 * 90) } }] },
    })
    console.log('\n── cleanup-notifications (02:00 UTC) ────────────────────')
    console.log(`   Thông báo đáng lẽ đã bị dọn còn sót: ${oldNotifs}`)
    console.log(oldNotifs > 0 ? '   ⚠️  Đáng lẽ đã bị xoá ⇒ cron không chạy.' : '   ✅ Sạch.')

    console.log('\n(Dấu vết trong DB chỉ nói được job CÓ chạy hay không, không nói được vì sao.)\n')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
