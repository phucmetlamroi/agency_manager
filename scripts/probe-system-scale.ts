import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const counts = {
        profiles: await prisma.profile.count(),
        workspaces: await prisma.workspace.count(),
        activeWorkspaces: await prisma.workspace.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        users: await prisma.user.count(),
        workspaceMembers: await prisma.workspaceMember.count(),
        tasks: await prisma.task.count(),
        activeTasks: await prisma.task.count({ where: { isArchived: false } }),
        completedTasks: await prisma.task.count({ where: { status: 'Hoàn tất' } }),
        clients: await prisma.client.count(),
        notifications: await prisma.notification.count(),
        auditLogs: await prisma.auditLog.count(),
        invoices: await prisma.invoice.count(),
        payrolls: await prisma.payroll.count(),
    }

    console.log('=== SYSTEM SCALE (live DB) ===')
    for (const [k, v] of Object.entries(counts)) {
        console.log(`  ${k.padEnd(20)} ${v.toLocaleString()}`)
    }

    // Revenue total across workspace
    const revenueSum = await prisma.task.aggregate({
        where: { status: 'Hoàn tất', isArchived: false },
        _sum: { jobPriceUSD: true, value: true },
    })
    console.log('\n=== COMPLETED TASK REVENUE (lifetime) ===')
    console.log(`  Total billable USD: $${Number(revenueSum._sum.jobPriceUSD || 0).toFixed(2)}`)
    console.log(`  Total staff wage VND: ${Number(revenueSum._sum.value || 0).toLocaleString('vi-VN')} đ`)

    // Active users (logged in within 30 days proxy)
    const recentSessions = await prisma.session.count({
        where: { startTime: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    })
    console.log(`\nActive sessions (last 30d): ${recentSessions}`)

    // Tasks created per month last 6 months
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const tasksByMonth = await prisma.$queryRaw<Array<{ month: Date; count: bigint }>>`
      SELECT DATE_TRUNC('month', "createdAt") as month, COUNT(*) as count
      FROM "Task"
      WHERE "createdAt" >= ${sixMonthsAgo}
      GROUP BY month
      ORDER BY month ASC
    `
    console.log('\n=== TASKS CREATED PER MONTH (last 6mo) ===')
    for (const r of tasksByMonth) {
        const m = r.month.toISOString().slice(0, 7)
        console.log(`  ${m}: ${Number(r.count)} tasks`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
