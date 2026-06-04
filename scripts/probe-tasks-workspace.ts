import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
    const userId = 'cfc9031f-ab7c-4194-805d-89d7b8007f7f'

    // Group tasks by workspace
    const byWs = await prisma.task.groupBy({
        by: ['workspaceId', 'status'],
        where: { assigneeId: userId, isArchived: false },
        _count: true,
    })

    console.log('--- Phúc Kòi tasks by workspace + status ---')
    for (const g of byWs) {
        console.log(`ws=${g.workspaceId?.slice(0, 8) || 'NULL'}  status=${g.status}  count=${g._count}`)
    }

    // Get workspace details
    const wsIds = [...new Set(byWs.map(g => g.workspaceId).filter(Boolean))] as string[]
    for (const wsId of wsIds) {
        const ws = await prisma.workspace.findUnique({
            where: { id: wsId },
            select: { id: true, name: true, profileId: true },
        })
        const userMember = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId: wsId } },
            select: { role: true },
        })
        const profileAccess = ws?.profileId
            ? await prisma.profileAccess.findUnique({
                  where: { userId_profileId: { userId, profileId: ws.profileId } },
                  select: { id: true },
              })
            : null
        console.log(`\nws=${wsId.slice(0, 8)} name="${ws?.name}" profileId=${ws?.profileId?.slice(0, 8) || 'null'}`)
        console.log(`  WorkspaceMember role: ${userMember?.role || 'none'}`)
        console.log(`  Has ProfileAccess: ${!!profileAccess}`)
    }
}
main().finally(() => prisma.$disconnect())
