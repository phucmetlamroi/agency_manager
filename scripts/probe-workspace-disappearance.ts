/**
 * READ-ONLY diagnostic for the "workspaces disappeared from Husty/Hustly Team
 * dropdown, only 'Tháng 5/2026' survives" incident (2026-06-29).
 *
 * This script performs ZERO writes — only findMany / findFirst / count / groupBy.
 * Safe to run against production. It does NOT mutate, soft-delete, restore, or
 * re-attach anything; it only REPORTS state so we can pick the right fix.
 *
 * What it answers:
 *   1. How many "Hust*" profiles exist? (duplicate / soft-deleted profile?)
 *   2. For each, ALL its workspaces (incl. soft-deleted) — status, createdAt,
 *      deletedAt, hardDeleteAfter, task/member counts.
 *   3. Are there ACTIVE workspaces named "Tháng …" with profileId = NULL
 *      (orphaned / detached)? ← the leading hypothesis.
 *   4. Recent AuditLog for workspace/profile delete + create actions (timeline).
 *   5. The org OWNER's ProfileAccess rows (profileId, role, grantedAt).
 *
 * Usage:
 *   npx tsx scripts/probe-workspace-disappearance.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function hostOf(url: string | undefined): string {
    if (!url) return '(DATABASE_URL not set)'
    try {
        const m = url.match(/@([^/:?]+)/)
        return m ? m[1] : '(unparseable)'
    } catch {
        return '(unparseable)'
    }
}

async function main() {
    console.log('=== Workspace-disappearance probe (READ-ONLY) ===')
    console.log(`DB host: ${hostOf(process.env.DATABASE_URL)}`)
    console.log(`Now: ${new Date().toISOString()}\n`)

    // 1. All profiles matching the org name (catch typos / duplicates).
    const profiles = await prisma.profile.findMany({
        where: {
            OR: [
                { name: { contains: 'Hust', mode: 'insensitive' } },
                { name: { contains: 'Husty', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            status: true as any,
            hardDeleteAfter: true as any,
            deletedAt: true as any,
            _count: { select: { workspaces: true, users: true } },
        } as any,
        orderBy: { createdAt: 'asc' },
    }) as any[]

    console.log(`--- 1. Profiles matching "Hust*": ${profiles.length} ---`)
    for (const p of profiles) {
        console.log(
            `  profile=${p.id.slice(0, 8)} "${p.name}" status=${p.status ?? 'n/a'} ` +
            `created=${p.createdAt.toISOString().slice(0, 10)} ` +
            `deletedAt=${p.deletedAt ? p.deletedAt.toISOString().slice(0, 10) : '-'} ` +
            `hardDeleteAfter=${p.hardDeleteAfter ? p.hardDeleteAfter.toISOString().slice(0, 10) : '-'} ` +
            `workspaces=${p._count.workspaces} users=${p._count.users}`,
        )
    }
    console.log('')

    // 2. For each matching profile, ALL workspaces (no status filter).
    for (const p of profiles) {
        const ws = await prisma.workspace.findMany({
            where: { profileId: p.id },
            select: {
                id: true,
                name: true,
                createdAt: true,
                status: true as any,
                deletedAt: true as any,
                hardDeleteAfter: true as any,
                profileId: true,
                _count: { select: { tasks: true, members: true } },
            } as any,
            orderBy: { createdAt: 'asc' },
        }) as any[]
        console.log(`--- 2. Workspaces under "${p.name}" (${p.id.slice(0, 8)}): ${ws.length} ---`)
        for (const w of ws) {
            console.log(
                `  ws=${w.id.slice(0, 8)} "${w.name}" status=${w.status ?? 'n/a'} ` +
                `created=${w.createdAt.toISOString().slice(0, 10)} ` +
                `deletedAt=${w.deletedAt ? w.deletedAt.toISOString().slice(0, 10) : '-'} ` +
                `hardDeleteAfter=${w.hardDeleteAfter ? w.hardDeleteAfter.toISOString().slice(0, 10) : '-'} ` +
                `tasks=${w._count.tasks} members=${w._count.members}`,
            )
        }
        console.log('')
    }

    // 3. Orphaned ACTIVE workspaces named "Tháng …" with NULL profileId.
    const orphans = await prisma.workspace.findMany({
        where: {
            profileId: null,
            OR: [
                { name: { contains: 'Tháng', mode: 'insensitive' } },
                { name: { contains: 'Thang', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            status: true as any,
            _count: { select: { tasks: true, members: true } },
        } as any,
        orderBy: { createdAt: 'asc' },
    }) as any[]
    console.log(`--- 3. Orphaned (profileId=NULL) "Tháng*" workspaces: ${orphans.length} ---`)
    for (const w of orphans) {
        console.log(
            `  ws=${w.id.slice(0, 8)} "${w.name}" status=${w.status ?? 'n/a'} ` +
            `created=${w.createdAt.toISOString().slice(0, 10)} ` +
            `tasks=${w._count.tasks} members=${w._count.members}`,
        )
    }
    // Also: total count of ALL profileId=NULL workspaces (any name).
    const totalOrphans = await prisma.workspace.count({ where: { profileId: null } })
    console.log(`  (total workspaces with profileId=NULL, any name: ${totalOrphans})\n`)

    // 4. Recent AuditLog timeline for delete/create actions (last 45 days).
    const since = new Date(Date.now() - 45 * 24 * 3600 * 1000)
    const logs = await prisma.auditLog.findMany({
        where: {
            action: {
                in: [
                    'workspace.created',
                    'workspace.soft_deleted',
                    'workspace.hard_deleted',
                    'workspace.restored',
                    'profile.soft_deleted',
                    'profile.hard_deleted',
                ] as any,
            },
            createdAt: { gte: since },
        },
        select: {
            action: true,
            targetId: true,
            workspaceId: true,
            actorUserId: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 60,
    })
    console.log(`--- 4. AuditLog (workspace/profile delete+create, last 45d): ${logs.length} ---`)
    for (const l of logs) {
        console.log(
            `  ${l.createdAt.toISOString()} [${l.action}] ` +
            `target=${l.targetId?.slice(0, 8) ?? '-'} actor=${l.actorUserId?.slice(0, 8) ?? 'SYSTEM'}`,
        )
    }
    console.log('')

    // 5. OWNER ProfileAccess rows for the Hustly profiles (role + grantedAt).
    const profileIds = profiles.map((p) => p.id)
    if (profileIds.length) {
        const owners = await prisma.profileAccess.findMany({
            where: { profileId: { in: profileIds }, role: 'OWNER' },
            select: {
                userId: true,
                profileId: true,
                role: true,
                grantedAt: true,
                user: { select: { email: true, username: true, nickname: true } },
            },
        })
        console.log(`--- 5. OWNER ProfileAccess for Hust* profiles: ${owners.length} ---`)
        for (const o of owners) {
            console.log(
                `  user=${o.userId.slice(0, 8)} (${o.user?.username ?? o.user?.email ?? '?'}) ` +
                `profile=${o.profileId.slice(0, 8)} role=${o.role} ` +
                `grantedAt=${o.grantedAt.toISOString().slice(0, 10)}`,
            )
        }
    }

    console.log('\n=== probe complete (no writes performed) ===')
}

main()
    .catch((e) => {
        console.error('probe error:', e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
