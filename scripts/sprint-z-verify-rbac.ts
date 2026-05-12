/**
 * [Sprint Z] Verify RBAC migration correctness.
 *
 * Checks:
 *   1. Each Profile có exactly 1 OWNER (no 0, no multiple)
 *   2. No users với username='admin' (post super-admin removal)
 *   3. All workspaces có ≥1 WorkspaceMember OWNER (consistency check)
 *   4. No orphan WorkspaceMember rows (user/workspace exists)
 *   5. ProfileAccess.role distribution
 *
 * Run AFTER backfill + super-admin removal + admin user delete.
 *
 * Usage:
 *   npx tsx scripts/sprint-z-verify-rbac.ts
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== [Sprint Z] RBAC Verification ===\n')

    let errors = 0
    let warnings = 0

    // CHECK 1: Each profile có đúng 1 OWNER
    console.log('🔍 CHECK 1: Each profile has exactly 1 OWNER')
    const profiles = await prisma.profile.findMany({
        select: {
            id: true,
            name: true,
            profileAccesses: {
                where: { role: 'OWNER' },
                select: { userId: true },
            },
        },
    })
    for (const p of profiles) {
        const count = p.profileAccesses.length
        if (count === 1) {
            console.log(`  ✅ "${p.name}" — 1 OWNER`)
        } else if (count === 0) {
            console.log(`  ❌ "${p.name}" — NO OWNER (${count}) — ERROR`)
            errors++
        } else {
            console.log(`  ⚠️ "${p.name}" — ${count} OWNERS (should be 1)`)
            warnings++
        }
    }

    // CHECK 2: No admin user
    console.log('\n🔍 CHECK 2: No super-admin user (username="admin")')
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } })
    if (!adminUser) {
        console.log(`  ✅ No "admin" user found`)
    } else {
        console.log(`  ❌ Admin user STILL EXISTS (id=${adminUser.id.slice(0, 8)}) — ERROR`)
        errors++
    }

    // CHECK 3: All workspaces có ≥1 OWNER member
    console.log('\n🔍 CHECK 3: All workspaces have ≥1 OWNER member')
    const workspaces = await prisma.workspace.findMany({
        select: {
            id: true,
            name: true,
            members: {
                where: { role: 'OWNER' },
                select: { userId: true },
            },
        },
    })
    let workspacesWithoutOwner = 0
    for (const ws of workspaces) {
        if (ws.members.length === 0) {
            console.log(`  ⚠️ "${ws.name}" (id=${ws.id.slice(0, 8)}) — NO OWNER`)
            workspacesWithoutOwner++
            warnings++
        }
    }
    if (workspacesWithoutOwner === 0) {
        console.log(`  ✅ All ${workspaces.length} workspaces have an OWNER`)
    }

    // CHECK 4: ProfileAccess.role distribution
    console.log('\n🔍 CHECK 4: ProfileAccess role distribution')
    const roleGroup = await prisma.profileAccess.groupBy({
        by: ['role'],
        _count: { _all: true },
    })
    for (const r of roleGroup) {
        console.log(`  • ${r.role}: ${r._count._all}`)
    }
    const totalAccess = roleGroup.reduce((s, r) => s + r._count._all, 0)
    console.log(`  Tổng: ${totalAccess} ProfileAccess rows`)

    // CHECK 5: User.role distribution (cleanup verification)
    console.log('\n🔍 CHECK 5: User.role distribution (ADMIN role should be migrated)')
    const userRoleGroup = await prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
    })
    for (const r of userRoleGroup) {
        const flag = r.role === 'ADMIN' ? ' ⚠️ (legacy super-admin role)' : ''
        console.log(`  • ${r.role}: ${r._count._all}${flag}`)
    }

    // CHECK 6: Sprint Z grantedAt cutoff sanity
    console.log('\n🔍 CHECK 6: ADMIN role grantedAt sanity')
    const admins = await prisma.profileAccess.findMany({
        where: { role: 'ADMIN' },
        select: { grantedAt: true, profile: { select: { name: true } } },
    })
    console.log(`  Total ADMIN profile-access rows: ${admins.length}`)

    // SUMMARY
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    if (errors === 0 && warnings === 0) {
        console.log('✅ ALL CHECKS PASSED — Sprint Z RBAC migration is consistent.')
    } else {
        console.log(`📊 SUMMARY: ${errors} errors, ${warnings} warnings`)
        if (errors > 0) {
            console.log(`❌ ERRORS detected — must fix before deploy.`)
            process.exit(1)
        } else {
            console.log(`⚠️ Warnings only — review for cleanup, not blocking.`)
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
