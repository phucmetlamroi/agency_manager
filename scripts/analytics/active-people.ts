/**
 * [Phân tích] Người đăng nhập tháng này THỰC SỰ làm việc cho team nào — chỉ đọc.
 *
 * Vì sao cần script này: active-teams.ts quy phiên về team bằng User.profileId,
 * mà profileId chỉ là "hồ sơ nhà" của user. Ai đăng ký lẻ rồi được mời vào team
 * khác sẽ có hồ sơ riêng mang tên chính mình ("JaCo Bao's Profile") — đọc bảng kia
 * dễ tưởng đó là 48 team khách hàng, trong khi phần lớn chỉ là nhân viên của 2-3
 * team thật. WorkspaceMember mới là nơi nói họ ngồi trong workspace của ai.
 *
 * Chạy: npx tsx scripts/analytics/active-people.ts
 */
import { prisma } from '../../src/lib/db'

const now = new Date()
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

async function main() {
    const sessions = await prisma.session.findMany({
        where: { startTime: { gte: from }, userId: { not: null } },
        select: { userId: true, startTime: true },
    })

    const seen = new Map<string, { count: number; last: Date }>()
    for (const s of sessions) {
        const cur = seen.get(s.userId!)
        if (!cur) seen.set(s.userId!, { count: 1, last: s.startTime })
        else { cur.count++; if (s.startTime > cur.last) cur.last = s.startTime }
    }

    const users = await prisma.user.findMany({
        where: { id: { in: [...seen.keys()] } },
        select: {
            id: true, username: true, displayName: true, role: true,
            profile: { select: { name: true } },
            workspaces: {
                select: { workspace: { select: { name: true, profile: { select: { name: true } } } } },
            },
        },
    })

    // Gom theo TEAM THẬT = profile sở hữu workspace mà user đang là thành viên.
    const byTeam = new Map<string, string[]>()
    const noTeam: string[] = []

    const rows = users.map(u => {
        const teams = [...new Set(
            u.workspaces.map(m => m.workspace.profile?.name).filter(Boolean) as string[]
        )]
        return { u, teams, ...seen.get(u.id)! }
    }).sort((a, b) => b.count - a.count)

    for (const r of rows) {
        const label = `${(r.u.displayName || r.u.username).padEnd(22).slice(0, 22)} ` +
            `${String(r.count).padStart(4)} phiên  ` +
            `${r.last.toISOString().slice(0, 10)}  ` +
            `[${r.u.role}]  hồ sơ nhà: ${r.u.profile?.name ?? '—'}`
        if (r.teams.length === 0) { noTeam.push(label); continue }
        for (const t of r.teams) {
            if (!byTeam.has(t)) byTeam.set(t, [])
            byTeam.get(t)!.push(label)
        }
    }

    const ordered = [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length)
    for (const [team, members] of ordered) {
        console.log(`\n█ ${team}  —  ${members.length} người hoạt động`)
        members.forEach(m => console.log('    ' + m))
    }

    if (noTeam.length) {
        console.log(`\n█ KHÔNG thuộc workspace nào  —  ${noTeam.length} người`)
        noTeam.forEach(m => console.log('    ' + m))
    }

    console.log(`\nTổng ${users.length} người đăng nhập trong tháng, thuộc ${ordered.length} team thật.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
