/**
 * [Xác minh] Chạy ĐÚNG phép tính MỚI của Leaderboard.tsx trên dữ liệu thật để
 * đối chiếu với bảng cũ — chỉ đọc.
 *
 * Chạy: npx tsx scripts/ent/verify-leaderboard-fix.ts
 */
import { prisma } from '../../src/lib/db'
import { SALARY_PENDING_STATUSES, SALARY_COMPLETED_STATUS } from '../../src/lib/task-statuses'

const WS = '6007171e-824c-4566-8a68-0012c0368d40' // August/2026

const vnd = (n: unknown) => Number(n ?? 0).toLocaleString('vi-VN') + 'đ'

async function main() {
    // Y HỆT truy vấn mới trong Leaderboard.tsx
    const done = await prisma.task.groupBy({
        by: ['assigneeId'],
        where: { workspaceId: WS, status: SALARY_COMPLETED_STATUS, assigneeId: { not: null } },
        _count: { id: true },
        _sum: { value: true },
    })
    const pend = await prisma.task.groupBy({
        by: ['assigneeId'],
        where: { workspaceId: WS, status: { in: SALARY_PENDING_STATUSES }, assigneeId: { not: null } },
        _count: { id: true },
        _sum: { value: true },
    })

    const ids = [...new Set([...done.map((d) => d.assigneeId as string), ...pend.map((p) => p.assigneeId as string)])]
    const users = await prisma.user.findMany({
        where: { id: { in: ids }, role: 'USER' },
        select: { id: true, username: true, displayName: true, nickname: true },
    })

    const rows = users.map((u) => {
        const d = done.find((x) => x.assigneeId === u.id)
        const p = pend.find((x) => x.assigneeId === u.id)
        const revenue = Number(d?._sum.value || 0)
        const pendingRevenue = Number(p?._sum.value || 0)
        return {
            name: u.displayName?.trim() || u.nickname?.trim() || u.username,
            revenue,
            pendingRevenue,
            tentativeRevenue: revenue + pendingRevenue,
            taskCount: (d?._count.id || 0) + (p?._count.id || 0),
        }
    })

    rows.sort((a, b) => {
        if (Math.abs(b.tentativeRevenue - a.tentativeRevenue) > 0.01) return b.tentativeRevenue - a.tentativeRevenue
        if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount
        return a.name.localeCompare(b.name, 'vi')
    })

    console.log('\n── BẢNG XẾP HẠNG SAU KHI SỬA (August/2026) ──\n')
    rows.slice(0, 6).forEach((r, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  '
        console.log(
            `  ${medal} ${String(i + 1)}. ${r.name.padEnd(20)} ${vnd(r.tentativeRevenue).padStart(14)}` +
                `   (chốt ${vnd(r.revenue)} + chờ ${vnd(r.pendingRevenue)}, ${r.taskCount} task)`,
        )
    })
    console.log('\n  Bục vinh danh sẽ hiện:  2️⃣ ' + (rows[1]?.name ?? '—') + '   1️⃣ ' + (rows[0]?.name ?? '—') + '   3️⃣ ' + (rows[2]?.name ?? '—') + '\n')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
