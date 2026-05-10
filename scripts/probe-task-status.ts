import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
    const recent = await prisma.task.findMany({
        where: { assigneeId: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
            id: true,
            title: true,
            status: true,
            assigneeId: true,
            assignedById: true,
            createdAt: true,
        }
    })
    for (const t of recent) {
        console.log(JSON.stringify({
            id: t.id.slice(0, 8),
            title: t.title,
            status: t.status,
            statusBytes: Buffer.from(t.status).toString('hex'),
            assigneeId: t.assigneeId?.slice(0, 8),
            assignedById: t.assignedById?.slice(0, 8),
            createdAt: t.createdAt,
        }, null, 2))
    }
}
main().finally(() => prisma.$disconnect())
