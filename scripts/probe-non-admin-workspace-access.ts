/**
 * [Z+1.fix3] Diagnostic probe: kiểm tra users non-admin có thể bị workspace load bug.
 *
 * Bug: Non-admin user navigate vào workspace → page sập "Trang không thể tải được".
 * Hypothesis: User có ProfileAccess (Sprint Z) nhưng session.sessionProfileId không sync.
 *
 * Probe identifies:
 *   - Users có >1 ProfileAccess rows (multi-tenant — sessionProfileId chỉ là 1)
 *   - Users có ProfileAccess.role=USER + assigned tasks (Phúc Kòi pattern)
 *   - Users với User.profileId NULL hoặc khác ProfileAccess
 *
 * Read-only — không edit data.
 *
 * Usage: npx tsx scripts/probe-non-admin-workspace-access.ts
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== [Z+1.fix3] Non-admin workspace access diagnostic ===\n')

    // 1. Find users có ProfileAccess role=USER (non-admin profile members)
    const userRoleAccesses = await prisma.profileAccess.findMany({
        where: { role: 'USER' },
        select: {
            userId: true,
            profileId: true,
            grantedAt: true,
            user: { select: { username: true, nickname: true, displayName: true, profileId: true } },
            profile: { select: { name: true } },
        },
    })

    console.log(`Tổng users có ProfileAccess role=USER: ${userRoleAccesses.length}\n`)

    // 2. Group by user — count multi-profile users
    const userMap = new Map<string, typeof userRoleAccesses>()
    for (const a of userRoleAccesses) {
        if (!userMap.has(a.userId)) userMap.set(a.userId, [])
        userMap.get(a.userId)!.push(a)
    }

    // 3. For each USER role user, check:
    //    - User.profileId (home) vs ProfileAccess.profileId (matches?)
    //    - Has WorkspaceMember rows trong any workspace?
    //    - Has assigned tasks in workspaces có không có WorkspaceMember?

    console.log('Users với ProfileAccess role=USER + risk assessment:\n')
    let totalAtRisk = 0
    for (const [userId, accesses] of userMap.entries()) {
        const u = accesses[0].user
        const displayName = u.nickname ?? u.displayName ?? u.username ?? '?'

        const accessibleProfiles = accesses.map((a) => a.profile?.name ?? '?').join(', ')

        // Check assigned tasks ngoài workspaces user có WorkspaceMember
        const memberWorkspaceIds = (
            await prisma.workspaceMember.findMany({
                where: { userId },
                select: { workspaceId: true },
            })
        ).map((m) => m.workspaceId)

        const tasksOutsideMember = await prisma.task.count({
            where: {
                assigneeId: userId,
                isArchived: false,
                workspaceId: { notIn: memberWorkspaceIds.length > 0 ? memberWorkspaceIds : [''] },
            },
        })

        const status = tasksOutsideMember > 0 ? '⚠️ AT RISK' : '✓'
        console.log(`  ${status} ${displayName}`)
        console.log(`     home_profileId=${u.profileId?.slice(0, 8) ?? 'NULL'}`)
        console.log(`     ProfileAccess profiles: ${accessibleProfiles}`)
        console.log(`     WorkspaceMember rows: ${memberWorkspaceIds.length}`)
        console.log(`     Assigned tasks ngoài WorkspaceMember: ${tasksOutsideMember}`)
        if (tasksOutsideMember > 0) totalAtRisk++
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 Summary:`)
    console.log(`   - ${userRoleAccesses.length} USER-role ProfileAccess rows`)
    console.log(`   - ${userMap.size} unique users`)
    console.log(`   - ${totalAtRisk} users AT RISK (có assigned tasks ngoài WorkspaceMember)`)

    if (totalAtRisk > 0) {
        console.log(`\n💡 Sprint Z+1 hotfix (commit 3783410) Profile member → MEMBER fallback`)
        console.log(`   trong verifyWorkspaceAccess đã cover trường hợp này. Z+1.fix3 layout`)
        console.log(`   session profileId backfill thêm 1 lớp safety. Bug "Trang không thể tải"`)
        console.log(`   nếu vẫn còn → check Vercel logs cho specific exception.`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
