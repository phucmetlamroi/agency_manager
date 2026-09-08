/**
 * [Xem trước · B2] send-digest bật lại sẽ gửi email cho AI, bao nhiêu cái? — chỉ đọc.
 *
 * 219 thông báo tồn đọng KHÔNG có nghĩa là 219 email. sendDigestEmails chỉ xử lý
 * người có emailDigestMode = 'HOURLY' (mỗi lượt) hoặc 'DAILY' (chỉ khi giờ UTC = 1),
 * và bỏ qua ai có emailEnabled = false. Mặc định là 'REALTIME' — nhóm đó KHÔNG
 * đi qua digest cron chút nào.
 *
 * Chạy: npx tsx scripts/ent/preview-digest-blast.ts
 */
import { prisma } from '../../src/lib/db'

async function main() {
    const pending = await prisma.notification.groupBy({
        by: ['userId'],
        where: { emailSentAt: null, isArchived: false },
        _count: { id: true },
    })
    if (pending.length === 0) {
        console.log('\nKhông có thông báo nào chờ gửi.\n')
        return
    }

    const prefs = await prisma.notificationPreference.findMany({
        where: { userId: { in: pending.map((p) => p.userId) } },
        select: { userId: true, emailEnabled: true, emailDigestMode: true },
    })
    const prefOf = (id: string) => prefs.find((p) => p.userId === id)

    let willEmail = 0
    let willEmailNotifs = 0
    const rows: string[] = []

    for (const p of pending.sort((a, b) => b._count.id - a._count.id)) {
        const user = await prisma.user.findUnique({
            where: { id: p.userId },
            select: { username: true, displayName: true, nickname: true },
        })
        const name = user?.displayName?.trim() || user?.nickname?.trim() || user?.username || '(?)'
        const pref = prefOf(p.userId)
        // Không có hàng preference ⇒ mặc định schema: emailEnabled=true, mode='REALTIME'.
        const mode = pref?.emailDigestMode ?? 'REALTIME'
        const enabled = pref?.emailEnabled ?? true

        const gets = enabled && (mode === 'HOURLY' || mode === 'DAILY')
        if (gets) {
            willEmail++
            willEmailNotifs += p._count.id
        }
        rows.push(
            `  ${gets ? '📧' : '  '} ${name.padEnd(20)} ${String(p._count.id).padStart(4)} thông báo   ` +
                `${enabled ? mode : 'TẮT EMAIL'}${gets ? `  ⇒ ~${Math.ceil(p._count.id / 50)} email` : '  ⇒ không gửi'}`,
        )
    }

    console.log('\n── Ai thật sự nhận email khi bật send-digest ──\n')
    console.log(rows.join('\n'))
    console.log(`\n  Tổng tồn đọng      : ${pending.reduce((s, p) => s + p._count.id, 0)} thông báo / ${pending.length} người`)
    console.log(`  THỰC SỰ gửi email  : ${willEmailNotifs} thông báo / ${willEmail} người`)
    console.log(
        willEmail === 0
            ? '\n  ✅ KHÔNG ai nhận email — tất cả đang ở chế độ REALTIME hoặc đã tắt.\n     Bật send-digest không gửi ra ngoài cái nào.\n'
            : `\n  ⚠️  ${willEmail} người sẽ nhận email tồn đọng. Mỗi lượt tối đa 50 thông báo/người.\n`,
    )
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
