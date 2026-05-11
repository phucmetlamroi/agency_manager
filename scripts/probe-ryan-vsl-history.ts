/**
 * Trace history of task "Ryan · 02 VSL" — when status='Review' was set?
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const taskId = '09601a05'

    // Find full task
    const task = await prisma.task.findFirst({
        where: { id: { startsWith: taskId } },
        select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            version: true,
            assigneeId: true,
            assignedById: true,
        },
    })
    console.log('Task:', JSON.stringify(task, null, 2))

    if (!task) return

    // Audit logs targeting this task
    const logs = await prisma.auditLog.findMany({
        where: { targetId: task.id },
        orderBy: { createdAt: 'asc' },
    })
    console.log(`\nAudit logs for this task: ${logs.length}`)
    for (const log of logs) {
        console.log(`  ${log.createdAt.toISOString()} action=${log.action} actor=${log.actorUserId?.slice(0, 8)}`)
        if (log.beforeData) console.log(`    before: ${JSON.stringify(log.beforeData)}`)
        if (log.afterData) console.log(`    after: ${JSON.stringify(log.afterData)}`)
    }

    // Audit logs for workspace a38e97df around task creation (2026-05-07)
    const wsLogs = await prisma.auditLog.findMany({
        where: {
            workspaceId: 'a38e97df-7fee-46bf-9d14-44557d32d2c5',
            createdAt: { gte: new Date('2026-05-07T00:00:00Z'), lt: new Date('2026-05-08T00:00:00Z') },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
    })
    console.log(`\nWorkspace a38e97df audit logs on 2026-05-07: ${wsLogs.length}`)
    for (const log of wsLogs.slice(0, 20)) {
        console.log(`  ${log.createdAt.toISOString()} action=${log.action} target=${log.targetId?.slice(0, 8)} actor=${log.actorUserId?.slice(0, 8)}`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
