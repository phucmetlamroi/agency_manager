/**
 * Broad probe: tìm MỌI task có thể bị "biến mất" khỏi admin workspace view
 * vì các lý do khác orphan (đã fix bằng Sprint T):
 *   1. isArchived=true (Sprint O admin filter skip)
 *   2. Workspace deletedAt set (workspace soft-deleted)
 *   3. Workspace status != ACTIVE
 *   4. profileId mismatch với workspace.profileId (cross-profile leak)
 *   5. Task profileId NULL nhưng workspace có profileId (orphan leftover)
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== BROAD HIDDEN-TASK AUDIT ===\n')

    // 1. Recently archived tasks (last 30 days)
    const recentlyArchived = await prisma.task.findMany({
        where: {
            isArchived: true,
            updatedAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: {
            id: true,
            title: true,
            status: true,
            workspaceId: true,
            profileId: true,
            updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
    })
    console.log(`1. Recently archived tasks (30d): ${recentlyArchived.length}`)
    for (const t of recentlyArchived.slice(0, 10)) {
        console.log(`   ${t.id.slice(0, 8)} ws=${t.workspaceId?.slice(0, 8)} status="${t.status}" updated=${t.updatedAt.toISOString().slice(0, 10)} "${t.title?.slice(0, 50)}"`)
    }

    // 2. Workspaces with deletedAt set
    const deletedWs = await prisma.workspace.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, deletedAt: true, profileId: true },
    })
    console.log(`\n2. Workspaces soft-deleted: ${deletedWs.length}`)
    for (const w of deletedWs) {
        const taskCount = await prisma.task.count({ where: { workspaceId: w.id } })
        console.log(`   ${w.id.slice(0, 8)} "${w.name}" deletedAt=${w.deletedAt?.toISOString().slice(0, 10)} tasks=${taskCount}`)
    }

    // 3. Workspaces with status != ACTIVE
    const nonActiveWs = await prisma.workspace.findMany({
        where: { status: { not: 'ACTIVE' }, deletedAt: null },
        select: { id: true, name: true, status: true, profileId: true },
    })
    console.log(`\n3. Workspaces status != ACTIVE: ${nonActiveWs.length}`)
    for (const w of nonActiveWs) {
        const taskCount = await prisma.task.count({ where: { workspaceId: w.id } })
        console.log(`   ${w.id.slice(0, 8)} "${w.name}" status=${w.status} tasks=${taskCount}`)
    }

    // 4. Cross-profile mismatch: task.profileId != workspace.profileId
    const allTasks = await prisma.task.findMany({
        where: { workspaceId: { not: null }, profileId: { not: null } },
        select: { id: true, title: true, profileId: true, workspaceId: true },
    })
    let mismatchCount = 0
    const mismatchSample: any[] = []
    for (const t of allTasks) {
        const ws = await prisma.workspace.findUnique({
            where: { id: t.workspaceId! },
            select: { profileId: true, name: true },
        })
        if (ws && ws.profileId && ws.profileId !== t.profileId) {
            mismatchCount++
            if (mismatchSample.length < 10) {
                mismatchSample.push({
                    id: t.id.slice(0, 8),
                    title: t.title,
                    taskProfile: t.profileId?.slice(0, 8),
                    wsProfile: ws.profileId.slice(0, 8),
                    wsName: ws.name,
                })
            }
        }
    }
    console.log(`\n4. Cross-profile mismatch (task.profileId != workspace.profileId): ${mismatchCount}`)
    for (const t of mismatchSample) {
        console.log(`   ${t.id} taskProfile=${t.taskProfile} wsProfile=${t.wsProfile} (${t.wsName}) "${t.title?.slice(0, 40)}"`)
    }

    // 5. Workspace breakdown showing visible vs total per workspace
    console.log(`\n5. Workspace task visibility audit (admin view):`)
    const allWs = await prisma.workspace.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, name: true, profileId: true },
    })
    for (const ws of allWs) {
        const total = await prisma.task.count({ where: { workspaceId: ws.id } })
        const adminVisible = await prisma.task.count({
            where: {
                workspaceId: ws.id,
                profileId: ws.profileId, // middleware would inject this
                isArchived: false,
            },
        })
        const hidden = total - adminVisible
        if (hidden > 0) {
            console.log(`   ⚠ ${ws.id.slice(0, 8)} "${ws.name}": admin sees ${adminVisible}/${total}  HIDDEN=${hidden}`)
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
