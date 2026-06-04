/**
 * Probe: identify "weird" workspaces trong Hustly Team profile.
 *
 * Sprint Z.12 đã attach 7 orphan workspaces (NULL profileId) vào Hustly Team
 * để transfer admin's ownership sang Bảo Phúc. Giờ những workspaces này hiển
 * thị trong dropdown của Bảo Phúc → cần cleanup.
 *
 * Output: list workspaces Hustly Team + flag "attached_via_sprint_z" suspicious ones.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const hustlyTeam = await prisma.profile.findFirst({
        where: { name: 'Hustly Team' },
        select: { id: true, createdAt: true },
    })
    if (!hustlyTeam) {
        console.log('Hustly Team not found')
        return
    }

    console.log(`=== Hustly Team workspaces (profile created ${hustlyTeam.createdAt.toISOString().slice(0, 10)}) ===\n`)

    const workspaces = await prisma.workspace.findMany({
        where: { profileId: hustlyTeam.id },
        select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            status: true as any,
            _count: { select: { tasks: true, members: true } },
        } as any,
        orderBy: { createdAt: 'asc' },
    }) as any

    console.log(`Total: ${workspaces.length} workspaces\n`)

    // Suspicious patterns: tên test/typo, descriptionless, ít task, no member
    const suspiciousNames = ['Test 2', 'zxc', '654654', 'Bug Test Workspace', 'Thang 4 2026', 'ThThang 4 2026']

    for (const ws of workspaces) {
        const isSuspicious = suspiciousNames.includes(ws.name)
        const flag = isSuspicious ? '⚠️ SUSPICIOUS' : '✓'
        console.log(`  ${flag} "${ws.name}" (id=${ws.id.slice(0, 8)}, ${ws.createdAt.toISOString().slice(0, 10)})`)
        console.log(`     status=${ws.status} desc="${ws.description ?? '-'}" tasks=${ws._count.tasks} members=${ws._count.members}`)
    }

    // Now check from audit log: did Sprint Z.12 attach these orphan workspaces?
    console.log('\n=== Sprint Z.12 trace: workspaces transferred via admin delete ===\n')
    const auditLogs = await prisma.auditLog.findMany({
        where: {
            action: { in: ['workspace.member_role_changed', 'workspace.transferred_ownership'] },
            createdAt: { gte: new Date('2026-05-11T00:00:00Z') },
        },
        select: {
            id: true,
            action: true,
            targetId: true,
            workspaceId: true,
            createdAt: true,
            afterData: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    })
    for (const log of auditLogs) {
        console.log(`  [${log.action}] target=${log.targetId?.slice(0, 8)} created=${log.createdAt.toISOString()}`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
