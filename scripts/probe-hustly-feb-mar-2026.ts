/**
 * Probe Tháng 2/2026 + Tháng 3/2026 workspaces của Hustly Team profile.
 *
 * User reported 404 when accessing these workspaces. URL shown:
 * hustlytasker.xyz/legacy-feb-2026/admin → 404
 *
 * Hypothesis:
 * 1. Workspaces exist but with legacy/slug-like IDs (vd: "legacy-feb-2026")
 *    không phải UUID format → routing nhận ID nhưng workspace fetch fails
 * 2. Workspaces archived / SOFT_DELETED → layout redirect to /trash
 * 3. User không có membership / ProfileAccess → security check reject
 * 4. Workspaces deleted hoàn toàn (orphan URL trong sidebar)
 */

import { prisma } from '../src/lib/db'

async function main() {
    console.log('═'.repeat(70))
    console.log('PROBE — Tháng 2/2026 + Tháng 3/2026 workspaces của Hustly Team')
    console.log('═'.repeat(70))

    // 1. Tìm profile Hustly Team
    const hustly = await prisma.profile.findFirst({
        where: { name: { contains: 'Hustly', mode: 'insensitive' } },
        select: { id: true, name: true, status: true },
    })
    if (!hustly) {
        console.log('❌ Profile "Hustly Team" KHÔNG tìm thấy.')
        return
    }
    console.log(`✓ Profile: ${hustly.name} (id=${hustly.id}, status=${hustly.status})`)
    console.log('')

    // 2. List TẤT CẢ workspaces trong profile (kể cả archived/soft-deleted)
    const allWs = await prisma.workspace.findMany({
        where: { profileId: hustly.id },
        select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            hardDeleteAfter: true,
        },
        orderBy: { createdAt: 'desc' },
    })
    console.log(`Total workspaces trong Hustly Team: ${allWs.length}`)
    console.log('─'.repeat(70))

    for (const ws of allWs) {
        const idLooksLikeUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ws.id)
        console.log(
            `${idLooksLikeUuid ? '🔵' : '🟡'} ${ws.name.padEnd(30)} | status=${ws.status.padEnd(15)} | id=${ws.id}${ws.deletedAt ? ' | deletedAt=' + ws.deletedAt.toISOString().slice(0, 10) : ''}`,
        )
    }
    console.log('')

    // 3. Specifically look for Tháng 2/2026 + Tháng 3/2026
    const matchKeys = ['Tháng 2', 'Tháng 3', 'thang 2', 'thang 3', 'feb', 'mar', 'february', 'march']
    const candidates = allWs.filter((ws) =>
        matchKeys.some((k) => ws.name.toLowerCase().includes(k.toLowerCase())),
    )

    console.log(`Matched candidates (Tháng 2 / Tháng 3): ${candidates.length}`)
    console.log('─'.repeat(70))

    for (const ws of candidates) {
        console.log('')
        console.log(`📍 Workspace: ${ws.name}`)
        console.log(`   ID: ${ws.id}`)
        console.log(`   Status: ${ws.status}`)
        console.log(`   Created: ${ws.createdAt.toISOString().slice(0, 10)}`)
        if (ws.deletedAt) {
            console.log(`   ⚠️  Deleted: ${ws.deletedAt.toISOString().slice(0, 10)}`)
            console.log(`   ⚠️  Hard-delete after: ${ws.hardDeleteAfter?.toISOString().slice(0, 10) ?? 'N/A'}`)
        }

        // Check members
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId: ws.id },
            select: { userId: true, role: true },
        })
        console.log(`   Members: ${members.length}`)

        // Task count
        const taskCount = await prisma.task.count({ where: { workspaceId: ws.id } })
        const archivedCount = await prisma.task.count({
            where: { workspaceId: ws.id, isArchived: true },
        })
        console.log(`   Tasks: ${taskCount} total, ${archivedCount} archived`)

        // Direct URL
        console.log(`   URL: /${ws.id}/admin`)
    }

    // 4. Check if there's any workspace with slug-like ID (non-UUID)
    console.log('')
    console.log('─'.repeat(70))
    console.log('Non-UUID workspace IDs (potential legacy slugs):')
    const nonUuid = allWs.filter(
        (ws) =>
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ws.id),
    )
    if (nonUuid.length === 0) {
        console.log('  (none — tất cả workspace IDs đều UUID format)')
    } else {
        for (const ws of nonUuid) {
            console.log(`  - "${ws.name}" → id="${ws.id}" status=${ws.status}`)
        }
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
