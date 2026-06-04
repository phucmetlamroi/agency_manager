import { PrismaClient } from '@prisma/client'
import { getWorkspacePrisma } from '../src/lib/prisma-workspace'
const prisma = new PrismaClient()
async function main() {
    const userId = 'cfc9031f-ab7c-4194-805d-89d7b8007f7f'
    const workspaceId = '0a18fef9-1d1c-432b-ac85-f46c5754e81e' // Tháng 5/2026
    const profileId = '61f25775-eb95-4ece-96e8-99ae97542af1'

    console.log('=== Test 1: Direct query (no middleware) ===')
    const direct = await prisma.task.findMany({
        where: { assigneeId: userId, workspaceId },
        select: { id: true, title: true, status: true, profileId: true, isArchived: true },
    })
    console.log(`Found ${direct.length} tasks`)
    for (const t of direct) {
        console.log(`  ${t.id.slice(0, 8)} status=${t.status} profileId=${t.profileId?.slice(0, 8)} archived=${t.isArchived} title="${t.title}"`)
    }

    console.log('\n=== Test 2: With middleware (workspace scoped) ===')
    const wsPrisma = getWorkspacePrisma(workspaceId, profileId)
    const middleware = await wsPrisma.task.findMany({
        where: { assigneeId: userId },
        select: { id: true, title: true, status: true, profileId: true, isArchived: true } as any,
    })
    console.log(`Found ${middleware.length} tasks via middleware`)
    for (const t of middleware as any[]) {
        console.log(`  ${t.id.slice(0, 8)} status=${t.status} profileId=${t.profileId?.slice(0, 8)} archived=${t.isArchived} title="${t.title}"`)
    }

    console.log('\n=== Test 3: With middleware NO profileId ===')
    const wsPrismaNoProfile = getWorkspacePrisma(workspaceId)
    const noProfile = await wsPrismaNoProfile.task.findMany({
        where: { assigneeId: userId },
        select: { id: true, title: true, status: true, profileId: true, isArchived: true } as any,
    })
    console.log(`Found ${noProfile.length} tasks via middleware (no profileId)`)
}
main().finally(() => prisma.$disconnect())
