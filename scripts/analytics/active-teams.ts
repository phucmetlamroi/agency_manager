/**
 * [Phân tích] Team nào ĐANG THỰC SỰ DÙNG app trong tháng — chỉ đọc, không ghi gì.
 *
 * "Có tài khoản" khác "đang dùng". Một Profile có 12 user nhưng cả tháng không ai
 * đăng nhập thì đó là team chết, không phải khách hàng đang hoạt động. Script này
 * đo bằng DẤU VẾT NGƯỜI THẬT ĐỂ LẠI, không đo bằng số bản ghi tồn tại sẵn:
 *
 *   1. Phiên đăng nhập (Session)  — bằng chứng mạnh nhất: có người mở app
 *   2. SỐ NGÀY khác nhau có phiên — phân biệt "dùng đều" với "vào một lần rồi thôi"
 *   3. Task tạo mới               — có việc mới chảy vào
 *   4. Task được sửa              — có người xử lý việc cũ
 *   5. Bình luận task             — có trao đổi qua lại
 *
 * ⚠️ Quy phiên về team bằng User.profileId, KHÔNG bằng Session.workspaceId.
 * Lần chạy đầu dùng workspaceId và ra 0 phiên cho MỌI team — hoá ra 941/941 phiên
 * đều có workspaceId = NULL (đường ghi phiên không gắn workspace). Nếu không kiểm
 * lại, bảng kết quả sẽ "sạch sẽ và sai hoàn toàn": mọi team trông như không ai dùng.
 * Đánh đổi: profileId trên hồ sơ user là "nhà" của họ, nên một admin làm việc hộ
 * team khác vẫn bị tính về nhà mình. Chấp nhận được vì đại đa số user chỉ có 1 team.
 *
 * Chạy: npx tsx scripts/analytics/active-teams.ts
 */
import { prisma } from '../../src/lib/db'

// Mốc đầu tháng theo GIỜ UTC — trùng với đồng hồ máy chủ, cũng là mốc mà
// payroll-cycle.ts dùng để cắt kỳ lương. Đừng đổi sang giờ VN, sẽ lệch 7 tiếng.
const now = new Date()
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

type Row = {
    name: string
    status: string
    totalUsers: number
    activeUsers: Set<string>
    sessions: number
    logins: number
    activeDays: Set<string>
    tasksCreated: number
    tasksUpdated: number
    comments: number
    lastSeen: Date | null
}

function blank(name: string, status: string, totalUsers: number): Row {
    return {
        name, status, totalUsers,
        activeUsers: new Set(), sessions: 0, logins: 0, activeDays: new Set(),
        tasksCreated: 0, tasksUpdated: 0, comments: 0, lastSeen: null,
    }
}

async function main() {
    console.log(`\nKỳ đo: ${from.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)} (giờ UTC)\n`)

    const profiles = await prisma.profile.findMany({
        select: { id: true, name: true, status: true, _count: { select: { users: true } } },
    })
    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true, profileId: true },
    })

    const wsToProfile = new Map(workspaces.map(w => [w.id, w.profileId]))
    const users = await prisma.user.findMany({ select: { id: true, profileId: true } })
    const userToProfile = new Map(users.map(u => [u.id, u.profileId]))
    const rows = new Map<string, Row>()
    for (const p of profiles) rows.set(p.id, blank(p.name, p.status, p._count.users))

    // ── 1. Phiên đăng nhập ────────────────────────────────────────────────────
    // Ưu tiên workspaceId (chính xác hơn) nhưng thực tế nó luôn NULL, nên rơi về
    // userId → profileId. Xem ghi chú đầu file.
    const sessions = await prisma.session.findMany({
        where: { startTime: { gte: from } },
        select: { userId: true, workspaceId: true, startTime: true },
    })
    let orphanSessions = 0
    for (const s of sessions) {
        const pid = (s.workspaceId ? wsToProfile.get(s.workspaceId) : null)
            ?? (s.userId ? userToProfile.get(s.userId) : null)
        const row = pid ? rows.get(pid) : undefined
        if (!row) { orphanSessions++; continue }
        row.sessions++
        if (s.userId) row.activeUsers.add(s.userId)
        row.activeDays.add(s.startTime.toISOString().slice(0, 10))
        if (!row.lastSeen || s.startTime > row.lastSeen) row.lastSeen = s.startTime
    }

    // ── 1b. Đăng nhập thành công — dấu vết độc lập với bảng Session ────────────
    for (const a of await prisma.loginAttempt.findMany({
        where: { createdAt: { gte: from }, success: true },
        select: { userId: true, createdAt: true },
    })) {
        const pid = a.userId ? userToProfile.get(a.userId) : null
        const row = pid ? rows.get(pid) : undefined
        if (!row) continue
        row.logins++
        if (!row.lastSeen || a.createdAt > row.lastSeen) row.lastSeen = a.createdAt
    }

    // ── 2. Task tạo mới / được sửa ────────────────────────────────────────────
    for (const g of await prisma.task.groupBy({
        by: ['profileId'], where: { createdAt: { gte: from } }, _count: { id: true },
    })) {
        const row = g.profileId ? rows.get(g.profileId) : undefined
        if (row) row.tasksCreated = g._count.id
    }
    for (const g of await prisma.task.groupBy({
        by: ['profileId'], where: { updatedAt: { gte: from } }, _count: { id: true },
    })) {
        const row = g.profileId ? rows.get(g.profileId) : undefined
        if (row) row.tasksUpdated = g._count.id
    }

    // ── 3. Bình luận ──────────────────────────────────────────────────────────
    for (const c of await prisma.taskComment.findMany({
        where: { createdAt: { gte: from } },
        select: { task: { select: { profileId: true } } },
    })) {
        const row = c.task.profileId ? rows.get(c.task.profileId) : undefined
        if (row) row.comments++
    }

    // ── Kết quả ───────────────────────────────────────────────────────────────
    const sorted = [...rows.values()].sort((a, b) =>
        b.activeDays.size - a.activeDays.size ||
        b.sessions - a.sessions ||
        b.tasksUpdated - a.tasksUpdated
    )

    const live = sorted.filter(r =>
        r.sessions > 0 || r.logins > 0 || r.tasksCreated > 0 || r.tasksUpdated > 0 || r.comments > 0)
    const dead = sorted.filter(r => !live.includes(r))

    const fmt = (r: Row) =>
        `${r.name.padEnd(26).slice(0, 26)} ` +
        `${String(r.activeDays.size).padStart(3)} ngày ` +
        `${String(r.activeUsers.size).padStart(3)}/${String(r.totalUsers).padEnd(3)} người ` +
        `${String(r.sessions).padStart(5)} phiên ` +
        `${String(r.logins).padStart(4)} lượt đăng nhập ` +
        `${String(r.tasksCreated).padStart(4)} task mới ` +
        `${String(r.tasksUpdated).padStart(5)} task sửa ` +
        `${String(r.comments).padStart(4)} bình luận ` +
        `${r.lastSeen ? r.lastSeen.toISOString().slice(0, 16).replace('T', ' ') : '—'}` +
        `${r.status !== 'ACTIVE' ? `  [${r.status}]` : ''}`

    console.log('═══ ĐANG DÙNG ═══')
    live.forEach(r => console.log('  ' + fmt(r)))

    console.log(`\n═══ KHÔNG DẤU VẾT NÀO THÁNG NÀY (${dead.length} team) ═══`)
    dead.forEach(r => console.log(`  ${r.name.padEnd(26).slice(0, 26)} ${r.totalUsers} người${r.status !== 'ACTIVE' ? `  [${r.status}]` : ''}`))

    console.log(`\nTổng: ${profiles.length} team · ${live.length} có hoạt động · ${sessions.length} phiên`)
    if (orphanSessions) console.log(`(${orphanSessions} phiên không gắn workspace nào — không quy được về team)`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
