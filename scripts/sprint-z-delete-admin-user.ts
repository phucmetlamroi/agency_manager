/**
 * [Sprint Z] Transfer admin's workspace ownerships + delete admin user.
 *
 * Order of operations:
 *   1. Find admin user (username='admin')
 *   2. Transfer all WorkspaceMember rows where admin is OWNER:
 *      - For each, find designated OWNER of workspace's profile (per Sprint Z backfill)
 *      - Atomic swap: demote admin → ADMIN, promote target → OWNER
 *      - If profile has no clear new owner, find first OWNER in profile's ProfileAccess
 *   3. Delete admin's remaining WorkspaceMember rows (any non-OWNER)
 *   4. Delete admin's ProfileAccess rows
 *   5. SET NULL admin's tasks.assigneeId (assignedById will auto cascade SET NULL)
 *   6. Delete admin User row
 *
 * Idempotent: re-runnable safely (checks existence before delete).
 *
 * Usage:
 *   npx tsx scripts/sprint-z-delete-admin-user.ts --dry-run   # preview
 *   npx tsx scripts/sprint-z-delete-admin-user.ts             # apply
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
    console.log(`=== [Sprint Z] Delete admin user ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} ===\n`)

    const admin = await prisma.user.findFirst({
        where: { username: 'admin' },
        select: { id: true, email: true, username: true },
    })

    if (!admin) {
        console.log('✅ No admin user found — already deleted.')
        return
    }

    console.log(`Found admin user: id=${admin.id.slice(0, 8)}, email=${admin.email}\n`)

    // Step 1: Find admin's OWNER memberships
    const ownerships = await prisma.workspaceMember.findMany({
        where: { userId: admin.id, role: 'OWNER' },
        select: {
            workspaceId: true,
            workspace: {
                select: { name: true, profileId: true, profile: { select: { name: true } } },
            },
        },
    })

    console.log(`Step 1: Found ${ownerships.length} workspaces where admin is OWNER:`)

    let transferredCount = 0
    let stuckCount = 0

    // Find Hustly Team profile to attach orphan workspaces
    const hustlyTeam = await prisma.profile.findFirst({
        where: { name: 'Hustly Team' },
        select: { id: true },
    })

    for (const o of ownerships) {
        let profileId = o.workspace.profileId
        if (!profileId) {
            // [Sprint Z] Orphan workspace (NULL profileId) — attach to Hustly Team
            // before transfer so they don't get stuck.
            if (hustlyTeam && !DRY_RUN) {
                await prisma.workspace.update({
                    where: { id: o.workspaceId },
                    data: { profileId: hustlyTeam.id },
                })
            }
            profileId = hustlyTeam?.id ?? null
            console.log(`  🔧 "${o.workspace.name}" — orphan, attaching to Hustly Team`)
            if (!profileId) {
                stuckCount++
                continue
            }
        }

        // Find designated OWNER of this profile (Sprint Z backfill set this)
        const profileOwner = await prisma.profileAccess.findFirst({
            where: { profileId, role: 'OWNER' },
            select: { userId: true, user: { select: { username: true, nickname: true } } },
        })

        if (!profileOwner || profileOwner.userId === admin.id) {
            console.log(`  ❌ "${o.workspace.name}" — no other OWNER candidate, skipping`)
            stuckCount++
            continue
        }

        const newOwnerName = profileOwner.user.nickname ?? profileOwner.user.username
        console.log(`  ↪ "${o.workspace.name}" (profile: "${o.workspace.profile?.name}") → transfer to ${newOwnerName}`)

        if (!DRY_RUN) {
            // Check if new owner already has WorkspaceMember row
            const existing = await prisma.workspaceMember.findUnique({
                where: { userId_workspaceId: { userId: profileOwner.userId, workspaceId: o.workspaceId } },
            })

            if (existing) {
                // Update existing membership to OWNER
                await prisma.$transaction([
                    prisma.workspaceMember.update({
                        where: { userId_workspaceId: { userId: profileOwner.userId, workspaceId: o.workspaceId } },
                        data: { role: 'OWNER' },
                    }),
                    prisma.workspaceMember.delete({
                        where: { userId_workspaceId: { userId: admin.id, workspaceId: o.workspaceId } },
                    }),
                ])
            } else {
                // Create new membership + delete admin
                await prisma.$transaction([
                    prisma.workspaceMember.create({
                        data: {
                            userId: profileOwner.userId,
                            workspaceId: o.workspaceId,
                            role: 'OWNER',
                        },
                    }),
                    prisma.workspaceMember.delete({
                        where: { userId_workspaceId: { userId: admin.id, workspaceId: o.workspaceId } },
                    }),
                ])
            }
        }
        transferredCount++
    }

    console.log(`\nStep 1 summary: ${transferredCount} transferred, ${stuckCount} stuck`)

    if (stuckCount > 0 && !DRY_RUN) {
        console.log(`\n⚠️ ${stuckCount} workspaces stuck (no other OWNER). Skipping admin delete to avoid orphans.`)
        console.log(`   Resolve manually: assign new OWNER for these workspaces, then re-run.`)
        return
    }

    if (DRY_RUN) {
        console.log(`\n💡 Dry-run. Re-run without --dry-run để apply.`)
        return
    }

    // Step 2: Delete admin's remaining WorkspaceMember rows (non-OWNER)
    const remainingMembers = await prisma.workspaceMember.deleteMany({
        where: { userId: admin.id },
    })
    console.log(`Step 2: Deleted ${remainingMembers.count} remaining WorkspaceMember rows`)

    // Step 3: Delete admin's ProfileAccess rows
    const accessDeleted = await prisma.profileAccess.deleteMany({
        where: { userId: admin.id },
    })
    console.log(`Step 3: Deleted ${accessDeleted.count} ProfileAccess rows`)

    // Step 4: Null out tasks where admin is assignee/assignedBy
    // (FK cascade SET NULL configured in schema for assignedBy; assigneeId requires manual)
    const tasksUpdated = await prisma.task.updateMany({
        where: { assigneeId: admin.id },
        data: { assigneeId: null as any },
    })
    console.log(`Step 4: Nullified ${tasksUpdated.count} task assigneeId references`)

    // Step 4b: Transfer Conversation.createdById (NOT NULL FK) to Bảo Phúc
    // Find Bảo Phúc as the inheritor of Hustly Team
    const baoPhuc = await prisma.profileAccess.findFirst({
        where: {
            profile: { name: 'Hustly Team' },
            role: 'OWNER',
        },
        select: { userId: true },
    })

    if (baoPhuc) {
        // Transfer all admin's NOT NULL FK references to Bảo Phúc
        const transferTargets: Array<[string, () => Promise<{ count: number }>]> = [
            ['errorLogs.detectedBy', () => prisma.errorLog.updateMany({ where: { detectedById: admin.id }, data: { detectedById: baoPhuc.userId } })],
            ['ratings.client', () => prisma.rating.updateMany({ where: { clientId: admin.id }, data: { clientId: baoPhuc.userId } })],
            ['ratings.staff', () => prisma.rating.updateMany({ where: { staffId: admin.id }, data: { staffId: baoPhuc.userId } })],
        ]

        for (const [label, fn] of transferTargets) {
            try {
                const r = await fn()
                console.log(`Step 4b: Transferred ${r.count} ${label} to Bảo Phúc`)
            } catch (e: any) {
                console.warn(`Step 4b: ⚠️ Failed to transfer ${label}: ${e.message}`)
            }
        }
    } else {
        console.warn(`Step 4b: ⚠️ Bảo Phúc not found, may fail next step`)
    }

    // Step 4c: Best-effort delete admin's notifications (cascade should handle)
    await prisma.notification.deleteMany({ where: { userId: admin.id } }).catch(() => {})

    // Step 5: Delete admin user row
    try {
        await prisma.user.delete({ where: { id: admin.id } })
        console.log(`Step 5: ✅ Admin user deleted.`)
    } catch (e: any) {
        console.error(`Step 5: ❌ Failed to delete admin: ${e.message}`)
        console.error(`   Check FK constraints — may have remaining references (notifications, audit logs, etc.)`)
        throw e
    }

    console.log(`\n✅ Sprint Z admin removal complete.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
