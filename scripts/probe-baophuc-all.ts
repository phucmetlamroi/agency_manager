import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
    // Find ALL users with "bao phuc" or "bảo phúc" in any name field
    const users = await prisma.user.findMany({
        where: { OR: [
            { username: { contains: 'bao', mode: 'insensitive' } },
            { username: { contains: 'phuc', mode: 'insensitive' } },
            { username: { contains: 'phúc', mode: 'insensitive' } },
            { nickname: { contains: 'bao', mode: 'insensitive' } },
            { nickname: { contains: 'phuc', mode: 'insensitive' } },
            { nickname: { contains: 'phúc', mode: 'insensitive' } },
            { displayName: { contains: 'bao', mode: 'insensitive' } },
            { displayName: { contains: 'phuc', mode: 'insensitive' } },
            { displayName: { contains: 'phúc', mode: 'insensitive' } },
        ]},
        select: { id: true, username: true, nickname: true, displayName: true, role: true, email: true, profileId: true },
    })
    console.log(`--- ${users.length} users matching ---`)
    for (const u of users) {
        console.log(JSON.stringify({
            id: u.id.slice(0, 8),
            username: u.username,
            nickname: u.nickname,
            displayName: u.displayName,
            role: u.role,
            email: u.email,
            profileId: u.profileId?.slice(0, 8),
        }))

        const taskCount = await prisma.task.count({
            where: { assigneeId: u.id, isArchived: false },
        })
        const byStatus = await prisma.task.groupBy({
            by: ['status', 'workspaceId'],
            where: { assigneeId: u.id, isArchived: false },
            _count: true,
        })
        console.log(`   Tasks: ${taskCount} non-archived`)
        for (const g of byStatus) {
            console.log(`     status=${g.status}  ws=${g.workspaceId?.slice(0, 8) || 'null'}  count=${g._count}`)
        }
    }
}
main().finally(() => prisma.$disconnect())
