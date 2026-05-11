/**
 * Diagnose: tasks visible to client (portal) NHƯNG ẨN khỏi admin workspace view.
 * Root cause candidates:
 *   - isArchived=true → admin filter `isArchived: false` skip
 *   - profileId mismatch → workspacePrisma middleware scope reject
 *   - workspaceId NULL → middleware injection inject filter
 *   - status excluded
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    // 1. Find profile "kẻ cô độc"
    const profiles = await prisma.profile.findMany({
        where: {
            OR: [
                { name: { contains: 'kẻ cô độc', mode: 'insensitive' } },
                { name: { contains: 'cô độc', mode: 'insensitive' } },
                { name: { contains: 'ke co doc', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    })

    console.log('--- Profile "kẻ cô độc" matches ---')
    for (const p of profiles) console.log(`  ${p.id.slice(0, 8)}  "${p.name}"`)

    if (profiles.length === 0) {
        console.log('No profile found, listing all profiles:')
        const all = await prisma.profile.findMany({ select: { id: true, name: true } })
        for (const p of all) console.log(`  ${p.id.slice(0, 8)}  "${p.name}"`)
        return
    }

    for (const profile of profiles) {
        console.log(`\n\n=== Profile ${profile.name} (${profile.id.slice(0, 8)}) ===`)

        // All workspaces in this profile
        const wss = await prisma.workspace.findMany({
            where: { profileId: profile.id },
            select: { id: true, name: true, status: true, deletedAt: true },
        })
        console.log(`\nWorkspaces (${wss.length}):`)
        for (const ws of wss) {
            console.log(`  ${ws.id.slice(0, 8)} "${ws.name}" status=${ws.status} deletedAt=${ws.deletedAt?.toISOString() || 'null'}`)
        }

        // ALL tasks where profileId = profile.id (regardless of isArchived)
        const allTasks = await prisma.task.findMany({
            where: { profileId: profile.id },
            select: {
                id: true,
                title: true,
                status: true,
                isArchived: true,
                workspaceId: true,
                profileId: true,
                clientId: true,
                assigneeId: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        })
        console.log(`\nTOTAL tasks (any profile-scoped): ${allTasks.length}`)

        // Group by workspace + archived
        const byWs = new Map<string, { archived: number; active: number }>()
        for (const t of allTasks) {
            const key = t.workspaceId || 'NULL'
            if (!byWs.has(key)) byWs.set(key, { archived: 0, active: 0 })
            const g = byWs.get(key)!
            if (t.isArchived) g.archived++
            else g.active++
        }
        console.log('\nBy workspace:')
        for (const [wsId, g] of byWs.entries()) {
            const wsName = wss.find((w) => w.id === wsId)?.name || '(orphan/null)'
            console.log(`  ws=${wsId.slice(0, 8)} "${wsName}"  active=${g.active}  archived=${g.archived}`)
        }

        // FIND ANOMALIES — tasks hidden from admin view
        console.log('\n--- ANOMALIES (tasks hidden from admin) ---')

        // A. Archived tasks (Sprint O admin filter would skip)
        const archived = allTasks.filter((t) => t.isArchived)
        if (archived.length > 0) {
            console.log(`\nA. ${archived.length} ARCHIVED tasks (admin/page.tsx filter "isArchived: false" → KHÔNG hiển thị):`)
            for (const t of archived.slice(0, 10)) {
                console.log(`  ${t.id.slice(0, 8)} ws=${t.workspaceId?.slice(0, 8)} status="${t.status}" title="${t.title?.slice(0, 60)}"`)
            }
            if (archived.length > 10) console.log(`  ... và ${archived.length - 10} task khác`)
        }

        // B. Tasks với workspaceId NULL — phantom tasks
        const orphans = allTasks.filter((t) => !t.workspaceId)
        if (orphans.length > 0) {
            console.log(`\nB. ${orphans.length} ORPHAN tasks (workspaceId=NULL → admin query với workspaceId injection sẽ KHÔNG match):`)
            for (const t of orphans.slice(0, 10)) {
                console.log(`  ${t.id.slice(0, 8)} status="${t.status}" title="${t.title?.slice(0, 60)}"`)
            }
        }

        // C. Tasks với profileId NULL nhưng có workspaceId
        const noProfile = await prisma.task.findMany({
            where: {
                profileId: null,
                workspaceId: { in: wss.map((w) => w.id) },
            },
            select: { id: true, title: true, status: true, workspaceId: true, isArchived: true },
        })
        if (noProfile.length > 0) {
            console.log(`\nC. ${noProfile.length} tasks ở workspace của profile NHƯNG profileId=NULL (middleware inject profileId → KHÔNG match):`)
            for (const t of noProfile.slice(0, 10)) {
                console.log(`  ${t.id.slice(0, 8)} ws=${t.workspaceId?.slice(0, 8)} status="${t.status}" archived=${t.isArchived} title="${t.title?.slice(0, 60)}"`)
            }
        }

        // D. Tasks ở workspace KHÁC profile nhưng vẫn có clientId thuộc clients của profile này
        // (cross-profile leakage that shouldn't happen but worth checking)

        // E. Compare with what admin/page.tsx would return
        console.log(`\n--- Admin /admin view per workspace ---`)
        for (const ws of wss) {
            if (ws.deletedAt) continue
            const adminVisible = await prisma.task.findMany({
                where: {
                    workspaceId: ws.id,
                    profileId: profile.id,
                    isArchived: false,
                },
                select: { id: true },
            })
            const totalInWs = allTasks.filter((t) => t.workspaceId === ws.id).length
            const hidden = totalInWs - adminVisible.length
            console.log(`  ${ws.id.slice(0, 8)} "${ws.name}": admin sees ${adminVisible.length}/${totalInWs}  HIDDEN=${hidden}`)
        }
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
