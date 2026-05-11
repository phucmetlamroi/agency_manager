/**
 * System-wide audit: ALL orphan tasks (workspaceId=NULL or profileId=NULL)
 * + analyze their metadata (createdAt, assignedById, clientId, status) to
 * identify code path that creates them.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== System-wide orphan task audit ===\n')

    // A. workspaceId = NULL
    const noWs = await prisma.task.findMany({
        where: { workspaceId: null },
        select: {
            id: true,
            title: true,
            status: true,
            profileId: true,
            workspaceId: true,
            clientId: true,
            assigneeId: true,
            assignedById: true,
            createdAt: true,
            updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
    })
    console.log(`A. Tasks with workspaceId=NULL: ${noWs.length}`)

    // Group by profileId
    const byProfile = new Map<string, typeof noWs>()
    for (const t of noWs) {
        const key = t.profileId || 'NULL_PROFILE'
        if (!byProfile.has(key)) byProfile.set(key, [])
        byProfile.get(key)!.push(t)
    }
    for (const [profileId, tasks] of byProfile.entries()) {
        const profile = profileId === 'NULL_PROFILE' ? null : await prisma.profile.findUnique({
            where: { id: profileId },
            select: { name: true },
        })
        console.log(`\n  Profile ${profileId === 'NULL_PROFILE' ? '(NULL)' : `${profileId.slice(0, 8)} "${profile?.name}"`}: ${tasks.length} orphan tasks`)
        const oldestDate = tasks[0]?.createdAt
        const newestDate = tasks[tasks.length - 1]?.createdAt
        console.log(`     Created: ${oldestDate?.toISOString().slice(0, 10)} → ${newestDate?.toISOString().slice(0, 10)}`)

        // Status breakdown
        const byStatus: Record<string, number> = {}
        for (const t of tasks) byStatus[t.status] = (byStatus[t.status] || 0) + 1
        console.log(`     Status: ${Object.entries(byStatus).map(([s, c]) => `${s}=${c}`).join(', ')}`)

        // Has clientId?
        const withClient = tasks.filter((t) => t.clientId).length
        console.log(`     With clientId: ${withClient}/${tasks.length}`)

        // Has assignedById (Sprint P field)?
        const withAssigner = tasks.filter((t) => t.assignedById).length
        console.log(`     With assignedById (Sprint P): ${withAssigner}/${tasks.length}`)
    }

    // B. profileId = NULL
    const noProfile = await prisma.task.count({ where: { profileId: null } })
    console.log(`\nB. Tasks with profileId=NULL: ${noProfile}`)
    if (noProfile > 0) {
        const sample = await prisma.task.findMany({
            where: { profileId: null },
            select: { id: true, title: true, status: true, workspaceId: true, createdAt: true },
            take: 10,
            orderBy: { createdAt: 'asc' },
        })
        for (const t of sample) {
            console.log(`  ${t.id.slice(0, 8)} ws=${t.workspaceId?.slice(0, 8) || 'NULL'} status="${t.status}" created=${t.createdAt.toISOString().slice(0, 10)} title="${t.title}"`)
        }
    }

    // C. Both NULL
    const bothNull = await prisma.task.count({
        where: { profileId: null, workspaceId: null },
    })
    console.log(`\nC. Tasks with BOTH workspaceId=NULL AND profileId=NULL: ${bothNull}`)

    // D. Detail of Kẻ Cô Độc orphans
    console.log('\n\n=== Detailed Kẻ Cô Độc orphans ===')
    const keCoDoc = noWs.filter((t) => t.profileId === '0199089f-026d-48d1-b878-0aec51f228cc')
    for (const t of keCoDoc) {
        // Look up client
        const client = t.clientId ? await prisma.client.findUnique({ where: { id: t.clientId }, select: { name: true, parent: { select: { name: true } } } }) : null
        console.log(`  ${t.id.slice(0, 8)}`)
        console.log(`    title="${t.title}"`)
        console.log(`    status=${t.status}`)
        console.log(`    clientId=${t.clientId} (${client?.parent?.name ? `${client.parent.name} > ` : ''}${client?.name || 'NULL'})`)
        console.log(`    assigneeId=${t.assigneeId?.slice(0, 8) || 'null'}`)
        console.log(`    assignedById=${t.assignedById?.slice(0, 8) || 'null'}`)
        console.log(`    created=${t.createdAt.toISOString()}  updated=${t.updatedAt.toISOString()}`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
