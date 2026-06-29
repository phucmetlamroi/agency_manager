/**
 * READ-ONLY system-wide diagnostic for the updated incident report:
 * "Tháng 6/2026 (June) workspaces vanished across ALL agencies/teams, no audit log".
 *
 * ZERO writes — only findMany / count / groupBy. Safe on production.
 *
 * Answers, across the ENTIRE database (every profile, every status, incl. orphans):
 *   1. All profiles (id, name, status, workspace count) — full tenant landscape.
 *   2. ANY workspace whose name looks like June 2026 (active, soft-deleted, OR
 *      orphaned profileId=NULL) — did a "Tháng 6/2026" ever exist anywhere?
 *   3. ALL soft-deleted workspaces system-wide (any tenant) + when.
 *   4. AuditLog (last 7 days) for every workspace/profile delete action, any tenant.
 *   5. The 20 most-recently-CREATED workspaces system-wide — what the real newest are.
 *   6. Totals.
 *
 * Usage: npx tsx scripts/probe-june-workspaces-systemwide.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function host(url: string | undefined): string {
    const m = (url ?? '').match(/@([^/:?]+)/)
    return m ? m[1] : '(DATABASE_URL not set / unparseable)'
}

async function main() {
    console.log('=== June-workspace SYSTEM-WIDE probe (READ-ONLY) ===')
    console.log(`DB host: ${host(process.env.DATABASE_URL)}`)
    console.log(`Now: ${new Date().toISOString()}\n`)

    // 1. All profiles.
    const profiles = await prisma.profile.findMany({
        select: {
            id: true,
            name: true,
            status: true as any,
            _count: { select: { workspaces: true, users: true } },
        } as any,
        orderBy: { createdAt: 'asc' },
    }) as any[]
    console.log(`--- 1. ALL profiles: ${profiles.length} ---`)
    for (const p of profiles) {
        console.log(
            `  profile=${p.id.slice(0, 8)} "${p.name}" status=${p.status ?? 'n/a'} ` +
            `workspaces=${p._count.workspaces} users=${p._count.users}`,
        )
    }
    console.log('')

    // 2. ANY workspace named like June 2026 — across all profiles + orphans + all statuses.
    const juneLike = await prisma.workspace.findMany({
        where: {
            OR: [
                { name: { contains: '6/2026', mode: 'insensitive' } },
                { name: { contains: 'tháng 6', mode: 'insensitive' } },
                { name: { contains: 'thang 6', mode: 'insensitive' } },
                { name: { contains: 'thang6', mode: 'insensitive' } },
                { name: { contains: 'june', mode: 'insensitive' } },
                { name: { contains: '06/2026', mode: 'insensitive' } },
                { name: { contains: 't6', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            name: true,
            profileId: true,
            status: true as any,
            createdAt: true,
            deletedAt: true as any,
            _count: { select: { tasks: true, members: true } },
        } as any,
        orderBy: { createdAt: 'asc' },
    }) as any[]
    console.log(`--- 2. Workspaces named like "June/Tháng 6": ${juneLike.length} ---`)
    if (juneLike.length === 0) {
        console.log('  (NONE found anywhere — no June workspace exists in the DB, any tenant/status/orphan)')
    }
    for (const w of juneLike) {
        console.log(
            `  ws=${w.id.slice(0, 8)} "${w.name}" profile=${w.profileId ? w.profileId.slice(0, 8) : 'NULL(orphan)'} ` +
            `status=${w.status ?? 'n/a'} created=${w.createdAt.toISOString().slice(0, 10)} ` +
            `deletedAt=${w.deletedAt ? w.deletedAt.toISOString().slice(0, 10) : '-'} ` +
            `tasks=${w._count.tasks} members=${w._count.members}`,
        )
    }
    console.log('')

    // 3. ALL soft-deleted workspaces system-wide.
    let softDeleted: any[] = []
    try {
        softDeleted = await prisma.workspace.findMany({
            where: { status: 'SOFT_DELETED' } as any,
            select: {
                id: true, name: true, profileId: true,
                deletedAt: true as any, hardDeleteAfter: true as any,
                _count: { select: { tasks: true } },
            } as any,
            orderBy: { deletedAt: 'desc' } as any,
        }) as any[]
    } catch (e: any) {
        console.log(`  (status column query failed: ${e?.message})`)
    }
    console.log(`--- 3. ALL soft-deleted workspaces system-wide: ${softDeleted.length} ---`)
    for (const w of softDeleted) {
        console.log(
            `  ws=${w.id.slice(0, 8)} "${w.name}" profile=${w.profileId ? w.profileId.slice(0, 8) : 'NULL'} ` +
            `deletedAt=${w.deletedAt ? w.deletedAt.toISOString().slice(0, 19) : '-'} ` +
            `tasks=${w._count.tasks}`,
        )
    }
    console.log('')

    // 4. AuditLog last 7 days for any workspace/profile delete (system-wide).
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const logs = await prisma.auditLog.findMany({
        where: {
            action: {
                in: [
                    'workspace.soft_deleted',
                    'workspace.hard_deleted',
                    'workspace.restored',
                    'profile.soft_deleted',
                    'profile.hard_deleted',
                ] as any,
            },
            createdAt: { gte: since },
        },
        select: { action: true, targetId: true, actorUserId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
    })
    console.log(`--- 4. AuditLog deletes/restores (ALL tenants, last 7d): ${logs.length} ---`)
    for (const l of logs) {
        console.log(
            `  ${l.createdAt.toISOString()} [${l.action}] target=${l.targetId?.slice(0, 8) ?? '-'} ` +
            `actor=${l.actorUserId?.slice(0, 8) ?? 'SYSTEM'}`,
        )
    }
    console.log('')

    // 5. 20 most-recently-created workspaces system-wide.
    const newest = await prisma.workspace.findMany({
        select: {
            id: true, name: true, profileId: true, createdAt: true,
            status: true as any, _count: { select: { tasks: true } },
        } as any,
        orderBy: { createdAt: 'desc' },
        take: 20,
    }) as any[]
    console.log(`--- 5. 20 most-recently CREATED workspaces (any tenant) ---`)
    for (const w of newest) {
        console.log(
            `  created=${w.createdAt.toISOString().slice(0, 10)} "${w.name}" ` +
            `status=${w.status ?? 'n/a'} profile=${w.profileId ? w.profileId.slice(0, 8) : 'NULL'} ` +
            `tasks=${w._count.tasks}`,
        )
    }
    console.log('')

    // 6. Totals.
    const totalWs = await prisma.workspace.count()
    const totalActive = await prisma.workspace.count({ where: { status: 'ACTIVE' } as any }).catch(() => -1)
    const totalProfiles = await prisma.profile.count()
    console.log(`--- 6. Totals ---`)
    console.log(`  profiles=${totalProfiles}  workspaces=${totalWs}  active=${totalActive}`)

    console.log('\n=== probe complete (no writes performed) ===')
}

main()
    .catch((e) => { console.error('probe error:', e); process.exit(1) })
    .finally(() => prisma.$disconnect())
