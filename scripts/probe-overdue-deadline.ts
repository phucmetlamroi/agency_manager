import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    // Find profile "Hustly" + workspace "Tháng 5"
    const profiles = await prisma.profile.findMany({
        where: { name: { contains: 'Hustly', mode: 'insensitive' } },
        select: { id: true, name: true },
    })
    console.log('--- Profile "Hustly" matches ---')
    for (const p of profiles) console.log(`  ${p.id.slice(0, 8)}  "${p.name}"`)

    for (const profile of profiles) {
        const workspaces = await prisma.workspace.findMany({
            where: {
                profileId: profile.id,
                name: { contains: 'Tháng 5', mode: 'insensitive' },
            },
            select: { id: true, name: true },
        })
        console.log(`\n--- Workspace "Tháng 5" in profile ${profile.name} ---`)
        for (const ws of workspaces) console.log(`  ${ws.id.slice(0, 8)}  "${ws.name}"`)

        for (const ws of workspaces) {
            const now = new Date()
            // Tasks past deadline + NOT Revision/Tạm ngưng/Hoàn tất/Đã hủy + deadline NOT null
            const suspicious = await prisma.task.findMany({
                where: {
                    workspaceId: ws.id,
                    isArchived: false,
                    deadline: { not: null, lt: now },
                    NOT: [
                        { status: 'Revision' },
                        { status: 'Tạm ngưng' },
                        { status: 'Hoàn tất' },
                        { status: 'Đã hủy' },
                    ],
                },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    deadline: true,
                    assignee: { select: { username: true, nickname: true } },
                    updatedAt: true,
                },
                orderBy: { deadline: 'asc' },
            })

            console.log(`\n[${ws.name}] Tasks NOT Revision/Tạm ngưng/Hoàn tất/Đã hủy với deadline đã qua (${suspicious.length}):`)
            for (const t of suspicious) {
                const overdueDays = Math.floor((now.getTime() - new Date(t.deadline!).getTime()) / 86400000)
                console.log(`  ${t.id.slice(0, 8)} status="${t.status}" deadline=${t.deadline?.toISOString().slice(0, 16)} (${overdueDays}d ago) title="${t.title?.slice(0, 50)}"`)
            }

            // Also check: status = 'Quá hạn' but deadline NOT null (maybe should be cleared too?)
            const quaHan = await prisma.task.findMany({
                where: {
                    workspaceId: ws.id,
                    status: 'Quá hạn',
                    isArchived: false,
                },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    deadline: true,
                },
            })
            console.log(`\n[${ws.name}] Tasks status='Quá hạn' (deadline preserved? ${quaHan.filter((t) => t.deadline !== null).length}/${quaHan.length}):`)
            for (const t of quaHan) {
                console.log(`  ${t.id.slice(0, 8)} deadline=${t.deadline?.toISOString().slice(0, 16) || 'null'}`)
            }

            // Status breakdown trong workspace
            const breakdown = await prisma.task.groupBy({
                by: ['status'],
                where: { workspaceId: ws.id, isArchived: false },
                _count: true,
            })
            console.log(`\n[${ws.name}] Status breakdown:`)
            for (const g of breakdown) console.log(`  ${g.status}: ${g._count}`)
        }
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
