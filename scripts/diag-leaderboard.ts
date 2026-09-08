/**
 * [Chẩn đoán] Bảng xếp hạng workspace August/2026 — chỉ đọc.
 *
 * Chạy lại ĐÚNG phép tính mà Leaderboard.tsx dùng, rồi đặt cạnh bức tranh ĐẦY ĐỦ
 * (mọi trạng thái, mọi vai trò) để thấy chỗ lệch. Ba nghi phạm cần phân biệt:
 *   1. Xếp theo `revenue` (CHỈ 'Hoàn tất'+'Revision') trong khi lương thật còn
 *      gồm cả các trạng thái salaryPending ⇒ ai nhiều task đang chạy bị tụt hạng.
 *   2. Bộ lọc `role: 'USER'` ⇒ ai mang vai trò khác bị LOẠI khỏi bảng hoàn toàn.
 *   3. Bộ nhớ đệm 24h (unstable_cache) ⇒ số cũ.
 *
 * Chạy: npx tsx scripts/ent/diag-leaderboard.ts
 */
import { prisma } from '../../src/lib/db'
import { SALARY_PENDING_STATUSES } from '../../src/lib/task-statuses'

const WS = '6007171e-824c-4566-8a68-0012c0368d40' // August/2026

function vnd(n: unknown): string {
    return Number(n ?? 0).toLocaleString('vi-VN') + 'đ'
}

async function main() {
    const ws = await prisma.workspace.findUnique({ where: { id: WS }, select: { name: true, profileId: true } })
    console.log(`\nWorkspace: "${ws?.name}"  profileId=${ws?.profileId}\n`)

    // ── Bức tranh ĐẦY ĐỦ: mọi assignee, mọi trạng thái ──
    const all = await prisma.task.groupBy({
        by: ['assigneeId', 'status'],
        where: { workspaceId: WS, assigneeId: { not: null } },
        _sum: { value: true },
        _count: { id: true },
    })

    const userIds = [...new Set(all.map((a) => a.assigneeId as string))]
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true, nickname: true, role: true },
    })
    const nameOf = (id: string) => {
        const u = users.find((x) => x.id === id)
        if (!u) return `(không rõ ${id.slice(0, 6)})`
        return u.displayName?.trim() || u.nickname?.trim() || u.username
    }
    const roleOf = (id: string) => users.find((x) => x.id === id)?.role ?? '???'

    // ── Tính đúng như Leaderboard.tsx ──
    const rows = userIds.map((id) => {
        const mine = all.filter((a) => a.assigneeId === id)
        const revenue = mine
            .filter((a) => ['Hoàn tất', 'Revision'].includes(a.status))
            .reduce((s, a) => s + Number(a._sum.value ?? 0), 0)
        const pending = mine
            .filter((a) => SALARY_PENDING_STATUSES.includes(a.status))
            .reduce((s, a) => s + Number(a._sum.value ?? 0), 0)
        const total = mine.reduce((s, a) => s + Number(a._sum.value ?? 0), 0)
        const nTasks = mine.reduce((s, a) => s + a._count.id, 0)
        return { id, name: nameOf(id), role: roleOf(id), revenue, pending, tentative: revenue + pending, total, nTasks }
    })

    console.log('── Xếp theo `revenue` (ĐÚNG như bảng xếp hạng đang làm: chỉ Hoàn tất + Revision) ──')
    console.log('   Lọc role==="USER" như code ⇒ ai không phải USER bị LOẠI.\n')
    const asCode = rows.filter((r) => r.role === 'USER').sort((a, b) => b.revenue - a.revenue)
    asCode.forEach((r, i) => {
        console.log(`  ${String(i + 1).padStart(2)}. ${r.name.padEnd(20)} revenue=${vnd(r.revenue).padStart(14)}  (role=${r.role})`)
    })

    console.log('\n── Xếp theo LƯƠNG THẬT (revenue + các trạng thái salaryPending), KHÔNG lọc role ──\n')
    const asSalary = [...rows].sort((a, b) => b.tentative - a.tentative)
    asSalary.forEach((r, i) => {
        const excluded = r.role !== 'USER' ? '  ⟵ BỊ LOẠI khỏi bảng (role≠USER)' : ''
        console.log(
            `  ${String(i + 1).padStart(2)}. ${r.name.padEnd(20)} lương=${vnd(r.tentative).padStart(14)}` +
                `  (xong=${vnd(r.revenue)} + đang chạy=${vnd(r.pending)})  role=${r.role}${excluded}`,
        )
    })

    // ── Chi tiết trạng thái của 3 người đứng đầu theo lương thật ──
    console.log('\n── Chi tiết trạng thái (3 người đầu theo lương thật) ──')
    for (const r of asSalary.slice(0, 3)) {
        console.log(`\n  ${r.name} (role=${r.role}):`)
        for (const a of all.filter((x) => x.assigneeId === r.id).sort((x, y) => Number(y._sum.value ?? 0) - Number(x._sum.value ?? 0))) {
            const bucket = ['Hoàn tất', 'Revision'].includes(a.status)
                ? 'TÍNH vào xếp hạng'
                : SALARY_PENDING_STATUSES.includes(a.status)
                  ? 'lương có, xếp hạng KHÔNG'
                  : 'không tính'
            console.log(`     ${a.status.padEnd(26)} ${String(a._count.id).padStart(3)} task  ${vnd(a._sum.value).padStart(14)}  [${bucket}]`)
        }
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
