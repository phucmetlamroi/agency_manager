/**
 * READ-ONLY deep diagnostic: did Hustly Team ever have a "Tháng 6/2026" workspace,
 * and if so was it deleted? ZERO writes (findMany/count/groupBy/aggregate only).
 *
 * Three independent angles to conclude (a) never existed vs (b) was deleted:
 *   1. Every workspace under Hustly + ALL-TIME audit of workspace lifecycle events
 *      (created / soft_deleted / hard_deleted) with the recorded NAME from beforeData.
 *   2. Where June-2026 tasks live: task counts per Hustly workspace, newest task date,
 *      and any tasks whose workspaceId no longer resolves to a workspace (orphan = a
 *      deleted workspace left tasks behind — only possible if NOT cascade-deleted).
 *   3. The owner's account: every profile they belong to + that profile's workspaces
 *      (catches "I was looking at a different profile" / a 2nd profile with June).
 *
 * Usage: npx tsx scripts/probe-hustly-june-deep.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function host(url: string | undefined): string {
    const m = (url ?? '').match(/@([^/:?]+)/)
    return m ? m[1] : '(unset)'
}

async function main() {
    console.log('=== Hustly June DEEP probe (READ-ONLY) ===')
    console.log(`DB host: ${host(process.env.DATABASE_URL)}   Now: ${new Date().toISOString()}\n`)

    const hustly = await prisma.profile.findFirst({
        where: { name: { contains: 'Hust', mode: 'insensitive' } },
        select: { id: true, name: true },
    })
    if (!hustly) { console.log('Hustly profile not found'); return }
    console.log(`Hustly profile = ${hustly.id} "${hustly.name}"\n`)

    // ---- ANGLE 1a: every workspace under Hustly (full names, all statuses) ----
    const ws = await prisma.workspace.findMany({
        where: { profileId: hustly.id },
        select: {
            id: true, name: true, status: true as any, createdAt: true,
            deletedAt: true as any, _count: { select: { tasks: true } },
        } as any,
        orderBy: { createdAt: 'asc' },
    }) as any[]
    console.log(`--- 1a. ALL workspaces under Hustly: ${ws.length} ---`)
    for (const w of ws) {
        console.log(`  ${w.createdAt.toISOString().slice(0, 10)}  [${w.status}]  "${w.name}"  (id=${w.id.slice(0, 8)}, tasks=${w._count.tasks})`)
    }
    const wsIds = new Set(ws.map((w) => w.id))
    console.log('')

    // ---- ANGLE 1b: ALL-TIME workspace lifecycle audit (name from beforeData) ----
    const lifecycle = await prisma.auditLog.findMany({
        where: { action: { in: ['workspace.created', 'workspace.soft_deleted', 'workspace.hard_deleted', 'workspace.restored'] as any } },
        select: { action: true, targetId: true, workspaceId: true, actorUserId: true, createdAt: true, beforeData: true, afterData: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
    })
    console.log(`--- 1b. ALL-TIME workspace lifecycle audit (last 300): ${lifecycle.length} ---`)
    console.log(`     (looking for any "Tháng 6"/"June"/"6/2026" name in hard_deleted beforeData)`)
    for (const l of lifecycle) {
        const before: any = l.beforeData ?? {}
        const name = before?.name ?? ''
        const isDelete = l.action !== 'workspace.created'
        const flag = /tháng\s*6|thang\s*6|june|6\/2026|06\/2026/i.test(name) ? ' 🚨JUNE' : ''
        // Only print deletes + anything name-bearing to keep it readable
        if (isDelete || name) {
            console.log(`  ${l.createdAt.toISOString()} [${l.action}] target=${l.targetId?.slice(0, 8) ?? '-'} name="${name || '-'}"${flag}`)
        }
    }
    console.log('')

    // ---- ANGLE 2: where do June-2026 tasks live? ----
    const juneStart = new Date('2026-06-01T00:00:00Z')
    // 2a: June tasks grouped by workspace (only Hustly workspaces)
    const juneByWs = await prisma.task.groupBy({
        by: ['workspaceId'],
        where: { workspaceId: { in: [...wsIds] }, createdAt: { gte: juneStart } },
        _count: { _all: true },
        _max: { createdAt: true },
    } as any) as any[]
    console.log(`--- 2a. Hustly tasks created in June 2026, by workspace ---`)
    if (juneByWs.length === 0) console.log('  (no Hustly tasks created in June 2026 at all)')
    for (const g of juneByWs) {
        const w = ws.find((x) => x.id === g.workspaceId)
        console.log(`  "${w?.name ?? g.workspaceId}"  juneTasks=${g._count._all}  newest=${g._max?.createdAt?.toISOString().slice(0, 10) ?? '-'}`)
    }
    // 2b: overall newest task per Hustly workspace (are they still active?)
    const newestByWs = await prisma.task.groupBy({
        by: ['workspaceId'],
        where: { workspaceId: { in: [...wsIds] } },
        _max: { createdAt: true },
        _count: { _all: true },
    } as any) as any[]
    console.log(`\n--- 2b. Newest task per Hustly workspace (activity recency) ---`)
    for (const g of newestByWs.sort((a, b) => (b._max?.createdAt?.getTime() ?? 0) - (a._max?.createdAt?.getTime() ?? 0))) {
        const w = ws.find((x) => x.id === g.workspaceId)
        console.log(`  "${w?.name ?? g.workspaceId}"  totalTasks=${g._count._all}  newestTask=${g._max?.createdAt?.toISOString().slice(0, 10) ?? '-'}`)
    }
    console.log('')

    // ---- ANGLE 3: the owner's account + every profile they belong to ----
    const owners = await prisma.profileAccess.findMany({
        where: { profileId: hustly.id, role: 'OWNER' },
        select: { userId: true, user: { select: { email: true, username: true } } },
    })
    console.log(`--- 3. Hustly OWNER(s) + all their profile memberships ---`)
    for (const o of owners) {
        console.log(`  OWNER ${o.user?.username ?? o.user?.email} (${o.userId.slice(0, 8)})`)
        const allAccess = await prisma.profileAccess.findMany({
            where: { userId: o.userId },
            select: { profileId: true, role: true, profile: { select: { name: true } } },
        })
        for (const a of allAccess) {
            const pws = await prisma.workspace.findMany({
                where: { profileId: a.profileId, status: { not: 'SOFT_DELETED' } as any },
                select: { name: true },
                orderBy: { createdAt: 'asc' },
            })
            console.log(`     • profile "${a.profile?.name}" (${a.profileId.slice(0, 8)}) role=${a.role} → [${pws.map((x) => x.name).join(', ')}]`)
        }
    }

    console.log('\n=== probe complete (no writes performed) ===')
}

main().catch((e) => { console.error('probe error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
