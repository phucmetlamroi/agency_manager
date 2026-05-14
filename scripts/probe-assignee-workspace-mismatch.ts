/**
 * Probe: tìm tất cả users là task.assigneeId nhưng KHÔNG có WorkspaceMember
 * row cho workspace của task đó. Sprint Z removed auto-MEMBER fallback →
 * những users này bị block khi cố update task họ được assign.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== Probe: assignees without WorkspaceMember row ===\n')

    // Tasks có assignee + workspace
    const tasks = await prisma.task.findMany({
        where: {
            assigneeId: { not: null },
            workspaceId: { not: null },
            isArchived: false,
        },
        select: {
            id: true,
            title: true,
            assigneeId: true,
            workspaceId: true,
            workspace: { select: { name: true, profileId: true } },
            assignee: { select: { username: true, nickname: true, displayName: true } },
        },
    })

    console.log(`Total active tasks với assignee: ${tasks.length}\n`)

    // Group by (userId, workspaceId) — deduplicate
    const pairs = new Map<string, { userId: string; workspaceId: string; userName: string; workspaceName: string }>()
    for (const t of tasks) {
        const key = `${t.assigneeId}:${t.workspaceId}`
        if (!pairs.has(key)) {
            const u = t.assignee
            pairs.set(key, {
                userId: t.assigneeId!,
                workspaceId: t.workspaceId!,
                userName: u?.nickname ?? u?.displayName ?? u?.username ?? '?',
                workspaceName: t.workspace?.name ?? '?',
            })
        }
    }

    console.log(`Unique (user, workspace) pairs: ${pairs.size}\n`)

    // Check each pair có WorkspaceMember chưa
    const missing: typeof Array<{ userId: string; workspaceId: string; userName: string; workspaceName: string }>['prototype'] = []
    for (const p of pairs.values()) {
        const member = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: p.userId, workspaceId: p.workspaceId } },
        })
        if (!member) missing.push(p)
    }

    console.log(`Pairs missing WorkspaceMember: ${missing.length}\n`)
    if (missing.length > 0) {
        console.log('Sample (first 20):')
        for (const m of missing.slice(0, 20)) {
            console.log(`  • ${m.userName} → "${m.workspaceName}" (user=${m.userId.slice(0, 8)}, ws=${m.workspaceId.slice(0, 8)})`)
        }
        if (missing.length > 20) console.log(`  ... +${missing.length - 20} more`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
