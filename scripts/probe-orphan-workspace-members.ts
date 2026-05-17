/**
 * [Z+1.fix5] Diagnostic probe + backfill: find orphan WorkspaceMember rows.
 *
 * "Orphan" = WorkspaceMember row EXISTS but corresponding ProfileAccess
 * row does NOT exist for the workspace's profile.
 *
 * Impact: user appears as "already a member" when inviting (inviteToWorkspace
 * checks WorkspaceMember), but is INVISIBLE in admin page users list and
 * assignee dropdown (workspacePrisma filters by ProfileAccess).
 *
 * Root cause: `ensureWorkspaceMembership` (pre-fix) created WorkspaceMember
 * without creating ProfileAccess. Also: `acceptWorkspaceInvitation` transaction
 * success + audit throw → WorkspaceMember persists but user thinks join failed.
 *
 * Usage:
 *   DRY-RUN: npx tsx scripts/probe-orphan-workspace-members.ts
 *   AUTO-FIX: npx tsx scripts/probe-orphan-workspace-members.ts --fix
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const shouldFix = process.argv.includes('--fix')

    console.log('=== [Z+1.fix5] Orphan WorkspaceMember diagnostic ===')
    console.log(`Mode: ${shouldFix ? '🔧 AUTO-FIX' : '👁️ DRY-RUN (pass --fix to auto-repair)'}\n`)

    // Find all WorkspaceMember rows where workspace has a profileId
    // but user does NOT have ProfileAccess for that profile.
    const allMembers = await prisma.workspaceMember.findMany({
        select: {
            userId: true,
            workspaceId: true,
            role: true,
            workspace: { select: { name: true, profileId: true } },
            user: { select: { username: true, nickname: true, profileId: true } },
        },
    })

    // Filter to only workspaces with profileId
    const membersWithProfile = allMembers.filter(m => m.workspace.profileId)

    // For each, check if ProfileAccess exists
    const orphans: typeof membersWithProfile = []

    for (const m of membersWithProfile) {
        const profileId = m.workspace.profileId!
        const pa = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId: m.userId, profileId } },
            select: { id: true },
        })
        if (!pa) {
            orphans.push(m)
        }
    }

    console.log(`📊 Total WorkspaceMember rows (with profile): ${membersWithProfile.length}`)
    console.log(`⚠️  Orphans (no ProfileAccess): ${orphans.length}\n`)

    if (orphans.length === 0) {
        console.log('✅ No orphan members found. System is clean.')
        return
    }

    // Report orphans
    console.log('Orphan members (WorkspaceMember exists, ProfileAccess missing):\n')
    for (const m of orphans) {
        const displayName = m.user.nickname ?? m.user.username ?? '?'
        console.log(`  ⚠️  "${displayName}" (user.profileId=${m.user.profileId?.slice(0, 8) ?? 'NULL'})`)
        console.log(`      workspace: "${m.workspace.name}" (profileId=${m.workspace.profileId?.slice(0, 8)})`)
        console.log(`      WorkspaceMember.role: ${m.role}`)
    }

    if (!shouldFix) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        console.log(`💡 Run with --fix to auto-create missing ProfileAccess rows.`)
        console.log(`   This will make orphan members VISIBLE in profile-scoped queries.`)
        return
    }

    // Auto-fix: create missing ProfileAccess rows
    console.log(`\n🔧 Auto-fixing ${orphans.length} orphan members...\n`)
    let fixed = 0
    let failed = 0

    for (const m of orphans) {
        const profileId = m.workspace.profileId!
        const displayName = m.user.nickname ?? m.user.username ?? '?'
        try {
            await prisma.profileAccess.create({
                data: {
                    userId: m.userId,
                    profileId,
                    role: 'USER',  // lowest privilege — admin can promote later
                },
            })
            fixed++
            console.log(`  ✅ Created ProfileAccess for "${displayName}" → profile ${profileId.slice(0, 8)}`)
        } catch (e: any) {
            if (e?.code === 'P2002') {
                // Race condition — already exists (another process created it)
                console.log(`  ⏭️  "${displayName}" already has ProfileAccess (race condition)`)
                fixed++
            } else {
                failed++
                console.log(`  ❌ Failed for "${displayName}": ${e?.message?.slice(0, 80)}`)
            }
        }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 Results:`)
    console.log(`   ✅ Fixed: ${fixed}`)
    console.log(`   ❌ Failed: ${failed}`)
    console.log(`   Total orphans resolved: ${fixed}/${orphans.length}`)

    if (fixed > 0) {
        console.log(`\n💡 Users should now appear in:`)
        console.log(`   - Admin page assignee dropdown`)
        console.log(`   - InviteMemberModal "select" mode list`)
        console.log(`   - Workspace members list`)
        console.log(`   Re-inviting them should no longer error "đã là thành viên".`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
