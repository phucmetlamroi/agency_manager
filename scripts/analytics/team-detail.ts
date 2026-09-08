/**
 * [Phân tích] Bóc chi tiết MỘT team: ai thuộc về, ai được mời vào, ai thực sự làm — chỉ đọc.
 *
 * Có hai kiểu "thuộc team" dễ nhầm, script này tách bạch cả hai:
 *   • User.profileId          = "hồ sơ nhà" — tài khoản này sinh ra dưới team nào
 *   • WorkspaceMember         = "được mời vào ngồi làm" — có thể là người của team khác
 * Một người có thể ở nhóm 2 mà không ở nhóm 1. Đó là lý do một team hiện "1 người"
 * ở bảng tổng nhưng lại có 2 người đang làm việc trong đó.
 *
 * Chạy: npx tsx scripts/analytics/team-detail.ts "Kozhi Revenue"
 */
import { prisma } from '../../src/lib/db'

const TEAM = process.argv[2] ?? 'Kozhi Revenue'

const now = new Date()
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : '—')

async function main() {
    const profile = await prisma.profile.findFirst({
        where: { name: TEAM },
        select: {
            id: true, name: true, status: true, createdAt: true,
            users: {
                select: {
                    id: true, username: true, displayName: true, email: true,
                    role: true, createdAt: true,
                },
            },
            workspaces: {
                select: {
                    id: true, name: true, status: true, createdAt: true,
                    members: {
                        select: {
                            role: true, joinedAt: true,
                            user: {
                                select: {
                                    id: true, username: true, displayName: true, email: true,
                                    role: true, createdAt: true,
                                    profile: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            },
        },
    })

    if (!profile) { console.log(`Không tìm thấy team tên "${TEAM}"`); return }

    console.log(`\n█ TEAM: ${profile.name}   [${profile.status}]   lập ${d(profile.createdAt)}`)

    console.log(`\n── Tài khoản có HỒ SƠ NHÀ ở team này (${profile.users.length}) ──`)
    for (const u of profile.users) {
        console.log(`   ${(u.displayName || u.username).padEnd(22).slice(0, 22)} @${(u.username).padEnd(18).slice(0, 18)} ${String(u.role).padEnd(6)} ${u.email ?? '—'}   tạo ${d(u.createdAt)}`)
    }

    // Tập hợp mọi người ĐANG NGỒI LÀM trong các workspace của team.
    const seats = new Map<string, { u: any; roles: string[]; joined: Date; ws: string[] }>()
    for (const w of profile.workspaces) {
        for (const m of w.members) {
            const cur = seats.get(m.user.id)
            if (!cur) seats.set(m.user.id, { u: m.user, roles: [m.role], joined: m.joinedAt, ws: [w.name] })
            else { cur.roles.push(m.role); cur.ws.push(w.name); if (m.joinedAt < cur.joined) cur.joined = m.joinedAt }
        }
    }

    console.log(`\n── Workspace của team (${profile.workspaces.length}) ──`)
    for (const w of profile.workspaces) {
        console.log(`   ${w.name.padEnd(24).slice(0, 24)} [${w.status}]  ${w.members.length} thành viên  lập ${d(w.createdAt)}`)
    }

    // Hoạt động tháng này của từng người ngồi trong team.
    const ids = [...seats.keys()]
    const sessions = await prisma.session.findMany({
        where: { userId: { in: ids }, startTime: { gte: from } },
        select: { userId: true, startTime: true },
    })
    const act = new Map<string, { n: number; last: Date }>()
    for (const s of sessions) {
        const c = act.get(s.userId!)
        if (!c) act.set(s.userId!, { n: 1, last: s.startTime })
        else { c.n++; if (s.startTime > c.last) c.last = s.startTime }
    }

    const assigned = await prisma.task.groupBy({
        by: ['assigneeId'],
        where: { profileId: profile.id, updatedAt: { gte: from }, assigneeId: { in: ids } },
        _count: { id: true },
    })
    const taskOf = new Map(assigned.map(a => [a.assigneeId!, a._count.id]))

    console.log(`\n── NGƯỜI ĐANG NGỒI LÀM trong workspace của team (${seats.size}) ──`)
    for (const [id, s] of [...seats.entries()].sort((a, b) => (act.get(b[0])?.n ?? 0) - (act.get(a[0])?.n ?? 0))) {
        const a = act.get(id)
        const home = s.u.profile?.name ?? '—'
        const flag = home === profile.name ? '' : `  ⟵ người của "${home}"`
        console.log(
            `   ${(s.u.displayName || s.u.username).padEnd(22).slice(0, 22)} ` +
            `${[...new Set(s.roles)].join('/').padEnd(8)} ` +
            `vào team ${d(s.joined)}  ` +
            `${String(a?.n ?? 0).padStart(4)} phiên  ` +
            `gần nhất ${d(a?.last ?? null)}  ` +
            `${String(taskOf.get(id) ?? 0).padStart(3)} task  ` +
            `${s.u.email ?? '—'}${flag}`
        )
    }

    // Task tháng này — ai đứng tên
    const tasks = await prisma.task.findMany({
        where: { profileId: profile.id, updatedAt: { gte: from } },
        select: { title: true, status: true, updatedAt: true, assignee: { select: { username: true, displayName: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 15,
    })
    console.log(`\n── 15 task động gần nhất ──`)
    for (const t of tasks) {
        console.log(`   ${d(t.updatedAt)}  ${(t.assignee?.displayName || t.assignee?.username || 'chưa giao').padEnd(18).slice(0, 18)} ${t.status.padEnd(14)} ${t.title.slice(0, 46)}`)
    }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
