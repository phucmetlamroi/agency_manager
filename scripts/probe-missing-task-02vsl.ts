/**
 * Find missing task "02_VSLs" client RYAN profile Kẻ Cô Độc.
 * Was in "Quá hạn" status, now gone.
 * Check ALL possible hiding states: archived, soft-deleted, status changed,
 * profileId mismatch, workspaceId mismatch, audit log trail.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== Search task "02_VSLs" ===\n')

    // Search by title — fuzzy match
    const tasksMatching = await prisma.task.findMany({
        where: {
            OR: [
                { title: { contains: '02_VSL', mode: 'insensitive' } },
                { title: { contains: '02 VSL', mode: 'insensitive' } },
                { title: { contains: '02VSL', mode: 'insensitive' } },
                { title: { contains: 'VSL', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            title: true,
            status: true,
            isArchived: true,
            workspaceId: true,
            profileId: true,
            deadline: true,
            createdAt: true,
            updatedAt: true,
            assigneeId: true,
            assignedById: true,
            clientId: true,
            client: { select: { name: true, parent: { select: { name: true } } } },
            workspace: { select: { name: true, status: true, deletedAt: true } },
            profile: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    })

    console.log(`Found ${tasksMatching.length} tasks matching "VSL"`)
    for (const t of tasksMatching) {
        console.log(`\n  ID: ${t.id}`)
        console.log(`    Title: ${t.title}`)
        console.log(`    Status: ${t.status}`)
        console.log(`    isArchived: ${t.isArchived}`)
        console.log(`    deadline: ${t.deadline?.toISOString()}`)
        console.log(`    profileId: ${t.profileId?.slice(0, 8)}  "${t.profile?.name}"`)
        console.log(`    workspaceId: ${t.workspaceId?.slice(0, 8)}  "${t.workspace?.name}"  status=${t.workspace?.status}  deletedAt=${t.workspace?.deletedAt?.toISOString() || 'null'}`)
        console.log(`    clientId: ${t.clientId}  ${t.client?.parent?.name ? t.client.parent.name + ' > ' : ''}${t.client?.name}`)
        console.log(`    assigneeId: ${t.assigneeId?.slice(0, 8)}`)
        console.log(`    assignedById: ${t.assignedById?.slice(0, 8)}`)
        console.log(`    createdAt: ${t.createdAt.toISOString()}`)
        console.log(`    updatedAt: ${t.updatedAt.toISOString()}`)
    }

    // Check audit log for deleted/modified tasks
    console.log('\n=== Audit log: task deletions/changes liên quan ===')
    const auditLogs = await prisma.auditLog.findMany({
        where: {
            OR: [
                { action: { contains: 'task.deleted' } },
                { action: { contains: 'task.archived' } },
                { action: { contains: 'task.removed' } },
            ],
            createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: {
            id: true,
            action: true,
            targetId: true,
            actorUserId: true,
            beforeData: true,
            afterData: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
    })
    console.log(`Audit logs (deleted/archived/removed) last 30d: ${auditLogs.length}`)
    for (const log of auditLogs.slice(0, 20)) {
        console.log(`  ${log.createdAt.toISOString()} action=${log.action} target=${log.targetId} actor=${log.actorUserId?.slice(0, 8)}`)
        if (log.beforeData) console.log(`    before: ${JSON.stringify(log.beforeData).slice(0, 200)}`)
    }

    // Find RYAN client
    console.log('\n=== Client "RYAN" ===')
    const ryanClients = await prisma.client.findMany({
        where: { name: { contains: 'ryan', mode: 'insensitive' } },
        select: { id: true, name: true, parent: { select: { name: true } } },
    })
    console.log(`Found ${ryanClients.length} clients matching "Ryan":`)
    for (const c of ryanClients) {
        console.log(`  ${c.id}  ${c.parent?.name ? c.parent.name + ' > ' : ''}${c.name}`)
    }

    // All tasks of RYAN clients in profile Kẻ Cô Độc
    console.log('\n=== All RYAN tasks (any state) in Kẻ Cô Độc profile ===')
    const keCoDocProfile = '0199089f-026d-48d1-b878-0aec51f228cc'
    if (ryanClients.length > 0) {
        const ryanTasks = await prisma.task.findMany({
            where: {
                clientId: { in: ryanClients.map((c) => c.id) },
                profileId: keCoDocProfile,
            },
            select: {
                id: true,
                title: true,
                status: true,
                isArchived: true,
                workspaceId: true,
                deadline: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
        })
        console.log(`Found ${ryanTasks.length} RYAN tasks in Kẻ Cô Độc:`)
        for (const t of ryanTasks) {
            console.log(`  ${t.id.slice(0, 8)} status="${t.status}" archived=${t.isArchived} ws=${t.workspaceId?.slice(0, 8)} deadline=${t.deadline?.toISOString().slice(0, 16)} "${t.title}"`)
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
