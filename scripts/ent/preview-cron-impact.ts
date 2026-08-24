/**
 * [Xem trước · B2] Bật 8 cron lên thì chuyện gì XẢY RA NGAY? — chỉ đọc.
 *
 * Cron ngừng 34 ngày nên lần chạy đầu sẽ xử lý cả đống tồn đọng. Script này đo
 * trước từng hậu quả, tách rõ ba mức:
 *   🔴 XOÁ VĨNH VIỄN — không hoàn tác được
 *   🟠 GỬI RA NGOÀI  — email tới người thật, không thu hồi được
 *   🟢 vô hại        — dọn rác nội bộ
 *
 * Chạy: npx tsx scripts/ent/preview-cron-impact.ts
 */
import { prisma } from '../../src/lib/db'
import { OVERDUE_ELIGIBLE_STATUSES } from '../../src/lib/task-statuses'

const now = new Date()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000)
const hoursAhead = (n: number) => new Date(Date.now() + n * 3600_000)

async function main() {
    console.log('\n╔══ BẬT CRON LÊN THÌ CHUYỆN GÌ XẢY RA NGAY ══╗\n')

    // ═══ 🔴 XOÁ VĨNH VIỄN ═══
    console.log('🔴 XOÁ VĨNH VIỄN — không hoàn tác được\n')

    const wsToDelete = await prisma.workspace.count({
        where: { status: 'SOFT_DELETED', hardDeleteAfter: { lte: now } },
    })
    const wsPending = await prisma.workspace.count({
        where: { status: 'SOFT_DELETED', hardDeleteAfter: { gt: now } },
    })
    console.log(`   hard-delete-workspaces : ${wsToDelete} workspace bị xoá CỨNG ngay lượt đầu`)
    console.log(`                            (${wsPending} cái khác còn trong hạn 30 ngày, chưa đụng)`)

    const profToDelete = await prisma.profile.count({
        where: { status: 'SOFT_DELETED', hardDeleteAfter: { lte: now } },
    })
    console.log(`   hard-delete-profiles   : ${profToDelete} hồ sơ bị xoá CỨNG (cascade toàn bộ workspace bên trong)`)

    const assetsPurge = await prisma.reviewAsset.count({ where: { deletedAt: { lt: daysAgo(30) } } })
    const versionsPurge = await prisma.reviewVersion.count({
        where: { deletedAt: { lt: daysAgo(30) }, asset: { deletedAt: null } },
    })
    console.log(`   review-janitor (purge) : ${assetsPurge} asset + ${versionsPurge} phiên bản bị xoá khỏi Mux + R2`)
    console.log(`                            (giới hạn 25 mỗi đêm ⇒ cần ~${Math.ceil((assetsPurge + versionsPurge) / 25)} đêm rút cạn)`)

    // ═══ 🟠 GỬI RA NGOÀI ═══
    console.log('\n🟠 GỬI RA NGOÀI — email tới người thật, không thu hồi được\n')

    const pendingByUser = await prisma.notification.groupBy({
        by: ['userId'],
        where: { emailSentAt: null, isArchived: false },
        _count: { id: true },
    })
    const totalPending = pendingByUser.reduce((s, u) => s + u._count.id, 0)
    console.log(`   send-digest            : ${totalPending} thông báo tồn đọng, chia cho ${pendingByUser.length} người`)
    if (pendingByUser.length) {
        const top = [...pendingByUser].sort((a, b) => b._count.id - a._count.id).slice(0, 3)
        for (const u of top) {
            const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { username: true, displayName: true } })
            console.log(`                            · ${(user?.displayName || user?.username || '?').padEnd(18)} ${u._count.id} thông báo`)
        }
        console.log(`                            Mỗi người tối đa 50/lượt ⇒ người nhiều nhất cần vài giờ mới hết.`)
        console.log(`                            ⚠️  CHỈ gửi cho ai bật digest email trong cài đặt.`)
    }

    const dl24 = await prisma.task.count({
        where: { deadline: { gt: hoursAhead(1), lte: hoursAhead(24) }, status: { in: OVERDUE_ELIGIBLE_STATUSES }, assigneeId: { not: null } },
    })
    const dl1 = await prisma.task.count({
        where: { deadline: { gte: now, lte: hoursAhead(1) }, status: { in: OVERDUE_ELIGIBLE_STATUSES }, assigneeId: { not: null } },
    })
    const flip = await prisma.task.count({
        where: { deadline: { lt: now }, status: { in: OVERDUE_ELIGIBLE_STATUSES }, assigneeId: { not: null } },
    })
    console.log(`\n   check-deadline         : ${flip} task bị lật sang 'Quá hạn'`)
    console.log(`                            ${dl1} thông báo "còn 1 giờ" + ${dl24} thông báo "còn 24 giờ"`)

    const subs = await prisma.subscription.count().catch(() => -1)
    if (subs >= 0) {
        const expiring7 = await prisma.subscription.count({
            where: { currentPeriodEnd: { gte: hoursAhead(24 * 7), lt: hoursAhead(24 * 8) } },
        }).catch(() => 0)
        const expiring1 = await prisma.subscription.count({
            where: { currentPeriodEnd: { gte: hoursAhead(24), lt: hoursAhead(48) } },
        }).catch(() => 0)
        const expired = await prisma.subscription.count({
            where: { currentPeriodEnd: { lt: now } },
        }).catch(() => 0)
        console.log(`\n   billing-sweep          : ${subs} gói tổng cộng`)
        console.log(`                            ${expiring7} email nhắc D-7 + ${expiring1} email nhắc D-1`)
        console.log(`                            ${expired} gói đã hết hạn (sẽ chuyển trạng thái + email)`)
    }

    // ═══ 🟢 VÔ HẠI ═══
    console.log('\n🟢 VÔ HẠI — dọn rác nội bộ, không ai thấy\n')
    const oldNotifs = await prisma.notification.count({
        where: { OR: [{ isArchived: true, createdAt: { lt: daysAgo(30) } }, { isRead: true, createdAt: { lt: daysAgo(90) } }] },
    })
    const oldAttempts = await prisma.loginAttempt.count({ where: { createdAt: { lt: daysAgo(90) } } })
    console.log(`   cleanup-notifications  : xoá ${oldNotifs} thông báo cũ (đã đọc/đã lưu trữ)`)
    console.log(`   auth-cleanup           : xoá ${oldAttempts} bản ghi đăng nhập >90 ngày + token hết hạn`)

    console.log('\n╚════════════════════════════════════════════╝\n')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
