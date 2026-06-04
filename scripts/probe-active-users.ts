/**
 * [Probe] List active users across multiple signals over the last N days.
 *
 * Signals aggregated:
 *   - AuditLog (concrete actions taken)
 *   - Session (login sessions)
 *   - UserPresence (real-time heartbeat)
 *   - Task (createdAt/updatedAt as actor)
 *
 * Output: ranked list with action count + last seen + profile context.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DAYS_BACK = 7

async function main() {
    const since = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000)
    console.log(`\nProbing active users since ${since.toISOString()} (last ${DAYS_BACK} days)\n`)
    console.log('='.repeat(80))

    // ── Signal 1: AuditLog actions ─────────────────────────────────
    const auditActivity = await prisma.auditLog.groupBy({
        by: ['actorUserId'],
        where: {
            actorUserId: { not: null },
            createdAt: { gte: since },
        },
        _count: { id: true },
        _max: { createdAt: true },
    })

    // ── Signal 2: Session logins ──────────────────────────────────
    const sessionActivity = await prisma.session.groupBy({
        by: ['userId'],
        where: {
            userId: { not: null },
            startTime: { gte: since },
        },
        _count: { id: true },
        _max: { startTime: true },
    })

    // ── Signal 3: UserPresence (most recent heartbeat) ─────────────
    const presence = await prisma.userPresence.findMany({
        where: { lastHeartbeat: { gte: since } },
        orderBy: { lastHeartbeat: 'desc' },
    })

    // ── Signal 4: Task activity (assignedBy actions) ──────────────
    const taskActivity = await prisma.task.groupBy({
        by: ['assignedById'],
        where: {
            assignedById: { not: null },
            updatedAt: { gte: since },
        },
        _count: { id: true },
        _max: { updatedAt: true },
    })

    // ── Merge signals by userId ───────────────────────────────────
    type Stats = {
        userId: string
        auditCount: number
        sessionCount: number
        taskCount: number
        presenceStatus: string | null
        lastSeen: Date | null
    }
    const stats = new Map<string, Stats>()

    function bump(userId: string, patch: Partial<Stats>) {
        const cur = stats.get(userId) ?? {
            userId,
            auditCount: 0,
            sessionCount: 0,
            taskCount: 0,
            presenceStatus: null,
            lastSeen: null,
        }
        const next: Stats = {
            ...cur,
            ...patch,
            auditCount: cur.auditCount + (patch.auditCount ?? 0),
            sessionCount: cur.sessionCount + (patch.sessionCount ?? 0),
            taskCount: cur.taskCount + (patch.taskCount ?? 0),
        }
        // Track latest lastSeen across all signals
        const candidates: Date[] = []
        if (cur.lastSeen) candidates.push(cur.lastSeen)
        if (patch.lastSeen) candidates.push(patch.lastSeen)
        if (candidates.length > 0) {
            next.lastSeen = new Date(Math.max(...candidates.map((d) => d.getTime())))
        }
        stats.set(userId, next)
    }

    for (const row of auditActivity) {
        if (!row.actorUserId) continue
        bump(row.actorUserId, {
            auditCount: row._count.id,
            lastSeen: row._max.createdAt ?? null,
        })
    }
    for (const row of sessionActivity) {
        if (!row.userId) continue
        bump(row.userId, {
            sessionCount: row._count.id,
            lastSeen: row._max.startTime ?? null,
        })
    }
    for (const row of taskActivity) {
        if (!row.assignedById) continue
        bump(row.assignedById, {
            taskCount: row._count.id,
            lastSeen: row._max.updatedAt ?? null,
        })
    }
    for (const p of presence) {
        bump(p.userId, {
            presenceStatus: p.status,
            lastSeen: p.lastHeartbeat,
        })
    }

    if (stats.size === 0) {
        console.log('\n⚠️  No active users found in the last 7 days.\n')
        return
    }

    // ── Hydrate with user details ─────────────────────────────────
    const userIds = Array.from(stats.keys())
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
            id: true,
            username: true,
            nickname: true,
            displayName: true,
            email: true,
            role: true,
            profile: { select: { name: true } },
        },
    })
    const userById = new Map(users.map((u) => [u.id, u]))

    // ── Rank by composite "activity score" ────────────────────────
    const ranked = Array.from(stats.values())
        .map((s) => ({
            ...s,
            user: userById.get(s.userId),
            score: s.auditCount * 2 + s.sessionCount * 3 + s.taskCount * 1,
        }))
        .sort((a, b) => b.score - a.score)

    // ── Output ─────────────────────────────────────────────────────
    console.log(
        `\nFound ${ranked.length} active users. Top by composite score (audit×2 + session×3 + task×1):\n`,
    )

    const fmt = (d: Date | null) =>
        d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '-'

    console.log(
        '#'.padEnd(3) +
            'Name'.padEnd(24) +
            'Role'.padEnd(8) +
            'Profile'.padEnd(22) +
            'Audit'.padEnd(7) +
            'Sess'.padEnd(6) +
            'Task'.padEnd(6) +
            'Live'.padEnd(9) +
            'Last seen',
    )
    console.log('-'.repeat(110))

    ranked.forEach((r, i) => {
        const name = r.user?.displayName ?? r.user?.nickname ?? r.user?.username ?? '?'
        const role = r.user?.role ?? '-'
        const profile = r.user?.profile?.name ?? '-'
        console.log(
            (i + 1).toString().padEnd(3) +
                name.slice(0, 22).padEnd(24) +
                role.padEnd(8) +
                profile.slice(0, 20).padEnd(22) +
                r.auditCount.toString().padEnd(7) +
                r.sessionCount.toString().padEnd(6) +
                r.taskCount.toString().padEnd(6) +
                (r.presenceStatus ?? '-').padEnd(9) +
                fmt(r.lastSeen),
        )
    })

    // ── Summary by tier ────────────────────────────────────────────
    const dailyActive = ranked.filter((r) => {
        if (!r.lastSeen) return false
        const hoursAgo = (Date.now() - r.lastSeen.getTime()) / 3600000
        return hoursAgo < 24
    })
    const weeklyActive = ranked.filter((r) => {
        if (!r.lastSeen) return false
        const daysAgo = (Date.now() - r.lastSeen.getTime()) / 86400000
        return daysAgo < 7
    })

    console.log('\n' + '='.repeat(80))
    console.log(`Summary:`)
    console.log(`  Daily Active Users (last 24h): ${dailyActive.length}`)
    console.log(`  Weekly Active Users (last 7d): ${weeklyActive.length}`)
    console.log(
        `  Currently ONLINE: ${ranked.filter((r) => r.presenceStatus === 'ONLINE').length}`,
    )

    // ── Top profiles by user count ────────────────────────────────
    const byProfile = new Map<string, number>()
    for (const r of weeklyActive) {
        const p = r.user?.profile?.name ?? 'Unknown'
        byProfile.set(p, (byProfile.get(p) ?? 0) + 1)
    }
    if (byProfile.size > 0) {
        console.log(`\n  Active users by profile (last 7d):`)
        Array.from(byProfile.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .forEach(([profile, count]) => {
                console.log(`    • ${profile}: ${count}`)
            })
    }
    console.log()
}

main()
    .catch((err) => {
        console.error('Error:', err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
