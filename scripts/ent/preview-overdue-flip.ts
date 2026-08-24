/**
 * [Xem trước · mục B2] check-deadline sẽ đánh dấu ĐÚNG những task nào? — chỉ đọc.
 *
 * Dùng CHÍNH bộ lọc của route (`OVERDUE_ELIGIBLE_STATUSES` — danh sách trắng suy
 * ra từ TASK_STATUS_META.cronOverdueEligible), nên con số ở đây là con số THẬT
 * sẽ bị lật, không phải ước lượng.
 *
 * Vì sao cần: đếm thô "task quá hạn chưa đánh dấu" cho ra số LỚN HƠN thực tế —
 * 6 trạng thái video (A2–A7) và các trạng thái chờ duyệt đều cronOverdueEligible
 * = false, cron KHÔNG bao giờ đụng tới chúng (chú thích trong route: "the cron
 * never overwrites their lifecycle value").
 *
 * Chạy: npx tsx scripts/ent/preview-overdue-flip.ts
 */
import { prisma } from '../../src/lib/db'
import { OVERDUE_ELIGIBLE_STATUSES } from '../../src/lib/task-statuses'

const days = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400_000)

async function main() {
    console.log(`\nTrạng thái cron ĐƯỢC PHÉP lật: ${OVERDUE_ELIGIBLE_STATUSES.join(' · ')}\n`)

    // Bộ lọc Y HỆT route check-deadline (dòng 143-147).
    const willFlip = await prisma.task.findMany({
        where: {
            deadline: { lt: new Date() },
            status: { in: OVERDUE_ELIGIBLE_STATUSES },
            assigneeId: { not: null },
        },
        orderBy: { deadline: 'asc' },
        select: {
            title: true, status: true, deadline: true, isArchived: true,
            assignee: { select: { username: true, displayName: true, nickname: true } },
            workspace: { select: { name: true } },
        },
    })

    // Đếm thô để so sánh — đây là con số dễ gây hoảng.
    const naive = await prisma.task.count({
        where: { deadline: { lt: new Date() }, assigneeId: { not: null }, status: { not: 'Quá hạn' } },
    })

    console.log(`Đếm thô (mọi trạng thái)        : ${naive}`)
    console.log(`THỰC TẾ cron sẽ lật             : ${willFlip.length}`)
    console.log(`⇒ ${naive - willFlip.length} task KHÔNG bị đụng tới (đang chờ duyệt / trạng thái video)\n`)

    if (willFlip.length === 0) {
        console.log('✅ Không có task nào bị lật. Bật cron thoải mái, không có mưa thông báo.\n')
        return
    }

    // Gom theo workspace — workspace cũ nhiều task quá hạn là chuyện bình thường
    // (tháng đã đóng sổ), khác hẳn workspace tháng này.
    const byWs = new Map<string, number>()
    const byStatus = new Map<string, number>()
    const byAssignee = new Map<string, number>()
    let archived = 0
    for (const t of willFlip) {
        const ws = t.workspace?.name ?? '(không rõ)'
        byWs.set(ws, (byWs.get(ws) ?? 0) + 1)
        byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1)
        const who = t.assignee?.displayName?.trim() || t.assignee?.nickname?.trim() || t.assignee?.username || '(?)'
        byAssignee.set(who, (byAssignee.get(who) ?? 0) + 1)
        if (t.isArchived) archived++
    }

    console.log('Theo workspace:')
    for (const [k, v] of [...byWs].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k}`)
    console.log('\nTheo trạng thái hiện tại:')
    for (const [k, v] of [...byStatus].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k}`)
    console.log('\nAi sẽ nhận thông báo (mỗi task = 1 thông báo + 1 lượt realtime):')
    for (const [k, v] of [...byAssignee].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k}`)
    if (archived > 0) console.log(`\n⚠️  ${archived} task đã LƯU TRỮ nhưng vẫn bị lật (route không lọc isArchived).`)

    console.log('\nQuá hạn bao lâu rồi:')
    const buckets = { 'dưới 7 ngày': 0, '7–30 ngày': 0, '1–3 tháng': 0, 'trên 3 tháng': 0 }
    for (const t of willFlip) {
        const d = days(t.deadline!)
        if (d < 7) buckets['dưới 7 ngày']++
        else if (d < 30) buckets['7–30 ngày']++
        else if (d < 90) buckets['1–3 tháng']++
        else buckets['trên 3 tháng']++
    }
    for (const [k, v] of Object.entries(buckets)) if (v) console.log(`   ${String(v).padStart(3)}  ${k}`)

    console.log('\n10 task quá hạn LÂU NHẤT (nghi là bỏ quên, không phải trễ thật):')
    for (const t of willFlip.slice(0, 10)) {
        const who = t.assignee?.displayName?.trim() || t.assignee?.nickname?.trim() || t.assignee?.username || '(?)'
        console.log(`   ${String(days(t.deadline!)).padStart(4)} ngày  ${t.status.padEnd(16)} ${who.padEnd(16)} ${t.title.slice(0, 46)}`)
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
