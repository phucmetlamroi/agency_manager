/**
 * Find ALL tasks with legacy status='Review' system-wide.
 * Sprint A removed 'Review' but migration scope was limited.
 * Sprint R fix script chỉ migrate workspace 0a18fef9 (Hustly Tháng 5).
 * Còn các workspace khác vẫn có Review tasks → invisible khỏi tab UI.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const allReview = await prisma.task.findMany({
        where: { status: 'Review' },
        select: {
            id: true,
            title: true,
            isArchived: true,
            workspaceId: true,
            profileId: true,
            deadline: true,
            updatedAt: true,
            workspace: { select: { name: true } },
            profile: { select: { name: true } },
            client: { select: { name: true, parent: { select: { name: true } } } },
            assignee: { select: { username: true, nickname: true } },
        },
        orderBy: { updatedAt: 'desc' },
    })

    console.log(`=== Tổng ${allReview.length} tasks status='Review' system-wide ===\n`)

    // Group by profile + workspace
    const byProfile = new Map<string, typeof allReview>()
    for (const t of allReview) {
        const key = `${t.profile?.name || t.profileId?.slice(0, 8)} / ${t.workspace?.name || 'NULL'}`
        if (!byProfile.has(key)) byProfile.set(key, [])
        byProfile.get(key)!.push(t)
    }
    for (const [group, tasks] of byProfile.entries()) {
        console.log(`\n${group}: ${tasks.length} tasks`)
        for (const t of tasks) {
            const client = t.client?.parent?.name ? `${t.client.parent.name} > ${t.client.name}` : t.client?.name || ''
            console.log(`  ${t.id.slice(0, 8)} archived=${t.isArchived} deadline=${t.deadline?.toISOString().slice(0, 16) || 'null'} client=${client} "${t.title}"`)
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
