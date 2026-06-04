import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
    const users = await prisma.user.findMany({
        where: { OR: [
            { username: { contains: 'phuc', mode: 'insensitive' } },
            { nickname: { contains: 'phuc', mode: 'insensitive' } },
            { displayName: { contains: 'phuc', mode: 'insensitive' } },
        ]},
        select: { id: true, username: true, nickname: true, displayName: true, role: true, email: true },
    })
    console.log('--- Users matching "phuc" ---')
    for (const u of users) console.log(JSON.stringify(u))

    for (const u of users) {
        const taskCount = await prisma.task.count({
            where: { assigneeId: u.id, isArchived: false },
        })
        const byStatus = await prisma.task.groupBy({
            by: ['status'],
            where: { assigneeId: u.id, isArchived: false },
            _count: true,
        })
        const archivedCount = await prisma.task.count({
            where: { assigneeId: u.id, isArchived: true },
        })
        console.log(`\n${u.nickname || u.username || u.displayName} (${u.id.slice(0,8)}):`)
        console.log(`  Total non-archived: ${taskCount}`)
        console.log(`  Archived: ${archivedCount}`)
        console.log(`  By status:`, byStatus.map(s => `${s.status}=${s._count}`).join(', '))
    }
}
main().finally(() => prisma.$disconnect())
