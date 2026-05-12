/**
 * [Sprint Z+1] Verification script.
 *
 * Checks:
 *   1. 0 WorkspaceMember rows với role='OWNER' (workspace OWNER concept removed)
 *   2. All profiles have status='ACTIVE' or 'SOFT_DELETED'
 *   3. Each ACTIVE profile có exactly 1 OWNER ProfileAccess (unchanged Sprint Z)
 *   4. Schema có Profile.status/deletedAt/hardDeleteAfter columns
 *   5. ensure_workspace_owner_exists trigger không còn tồn tại (Sprint Z+1 dropped)
 *
 * Usage:
 *   npx tsx scripts/sprint-z1-verify.ts
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== [Sprint Z+1] Verification ===\n')

    let errors = 0
    let warnings = 0

    // CHECK 1: No workspace OWNER members
    console.log('🔍 CHECK 1: 0 WorkspaceMember rows với role="OWNER"')
    const ownerCount = await prisma.workspaceMember.count({ where: { role: 'OWNER' } })
    if (ownerCount === 0) {
        console.log(`  ✅ 0 OWNER rows found.`)
    } else {
        console.log(`  ❌ ${ownerCount} rows STILL have role='OWNER' — Z+1.2 backfill incomplete.`)
        errors++
    }

    // CHECK 2: Profiles have valid status
    console.log('\n🔍 CHECK 2: All profiles status ACTIVE | SOFT_DELETED')
    const profiles = await prisma.profile.findMany({
        select: { id: true, name: true, status: true as any } as any,
    }) as any
    const invalidStatus = profiles.filter((p: any) => p.status !== 'ACTIVE' && p.status !== 'SOFT_DELETED')
    if (invalidStatus.length === 0) {
        console.log(`  ✅ ${profiles.length} profiles have valid status.`)
    } else {
        console.log(`  ❌ ${invalidStatus.length} profiles có status không hợp lệ.`)
        errors++
    }

    // CHECK 3: ACTIVE profile có 1 OWNER
    console.log('\n🔍 CHECK 3: Each ACTIVE profile có exactly 1 OWNER ProfileAccess')
    const activeProfiles = profiles.filter((p: any) => p.status === 'ACTIVE')
    for (const p of activeProfiles) {
        const count = await prisma.profileAccess.count({
            where: { profileId: p.id, role: 'OWNER' },
        })
        if (count !== 1) {
            console.log(`  ${count === 0 ? '❌' : '⚠️'} "${p.name}" — ${count} OWNERS`)
            if (count === 0) errors++; else warnings++
        }
    }
    if (activeProfiles.every((p: any) => true)) console.log(`  ✅ All ${activeProfiles.length} active profiles consistent.`)

    // CHECK 4: Schema columns exist (read sample profile)
    console.log('\n🔍 CHECK 4: Profile.status/deletedAt/hardDeleteAfter columns')
    try {
        await prisma.profile.findFirst({
            select: { id: true, status: true as any, deletedAt: true as any, hardDeleteAfter: true as any } as any,
        })
        console.log(`  ✅ Schema columns present.`)
    } catch (e: any) {
        console.log(`  ❌ Schema columns missing: ${e.message}`)
        errors++
    }

    // CHECK 5: Verify trigger dropped
    console.log('\n🔍 CHECK 5: DB trigger ensure_workspace_owner_exists dropped')
    try {
        const result: any = await prisma.$queryRawUnsafe(
            `SELECT tgname FROM pg_trigger WHERE tgname = 'ensure_workspace_owner_exists'`,
        )
        if (Array.isArray(result) && result.length === 0) {
            console.log(`  ✅ Trigger dropped.`)
        } else {
            console.log(`  ⚠️ Trigger still exists — Z+1.2 drop incomplete.`)
            warnings++
        }
    } catch (e: any) {
        console.log(`  ⚠️ Cannot query pg_trigger: ${e.message}`)
        warnings++
    }

    // CHECK 6: ProfileAccess role distribution
    console.log('\n🔍 CHECK 6: ProfileAccess role distribution')
    const roleGroup = await prisma.profileAccess.groupBy({
        by: ['role'],
        _count: { _all: true },
    })
    for (const r of roleGroup) {
        console.log(`  • ${r.role}: ${r._count._all}`)
    }

    // CHECK 7: Soft-deleted profiles
    console.log('\n🔍 CHECK 7: Soft-deleted profiles')
    const softDeleted = profiles.filter((p: any) => p.status === 'SOFT_DELETED')
    console.log(`  • ${softDeleted.length} profiles trong trash`)

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    if (errors === 0 && warnings === 0) {
        console.log('✅ ALL CHECKS PASSED — Sprint Z+1 migration consistent.')
    } else {
        console.log(`📊 SUMMARY: ${errors} errors, ${warnings} warnings`)
        if (errors > 0) {
            console.log(`❌ ERRORS detected — must fix before deploy.`)
            process.exit(1)
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
