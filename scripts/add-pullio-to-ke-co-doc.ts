/**
 * [Z+1.fix5] One-shot script: Add Pullio to Kẻ Cô Độc profile directly.
 *
 * Creates:
 *   1. ProfileAccess(Pullio → Kẻ Cô Độc, role=USER)
 *   2. WorkspaceMember(Pullio → each workspace in Kẻ Cô Độc, role=MEMBER)
 *   3. Marks any pending invitations as ACCEPTED
 *
 * Idempotent: uses upsert — safe to re-run.
 *
 * Usage:
 *   DRY-RUN: npx tsx scripts/add-pullio-to-ke-co-doc.ts
 *   EXECUTE: npx tsx scripts/add-pullio-to-ke-co-doc.ts --execute
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const PULLIO_USER_ID = '23539e6c-4f21-471a-b7a2-7915becd1fdf'
const KE_CO_DOC_PROFILE_ID = '0199089f-026d-48d1-b878-0aec51f228cc'

async function main() {
    const shouldExecute = process.argv.includes('--execute')

    console.log('=== Add Pullio to Kẻ Cô Độc profile ===')
    console.log(`Mode: ${shouldExecute ? '🔧 EXECUTE' : '👁️ DRY-RUN (pass --execute to apply)'}\n`)

    // 1. Verify Pullio exists
    const pullio = await prisma.user.findUnique({
        where: { id: PULLIO_USER_ID },
        select: { id: true, username: true, nickname: true, email: true, profileId: true },
    })
    if (!pullio) {
        console.error('❌ Pullio user not found!')
        return
    }
    console.log(`✅ Pullio found: "${pullio.nickname ?? pullio.username}" (email: ${pullio.email})`)
    console.log(`   Home profileId: ${pullio.profileId?.slice(0, 8) ?? 'NULL'}`)

    // 2. Verify Kẻ Cô Độc profile exists
    const profile = await prisma.profile.findUnique({
        where: { id: KE_CO_DOC_PROFILE_ID },
        select: { id: true, name: true },
    })
    if (!profile) {
        console.error('❌ Kẻ Cô Độc profile not found!')
        return
    }
    console.log(`✅ Profile found: "${profile.name}"`)

    // 3. Check current state
    const existingAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: PULLIO_USER_ID, profileId: KE_CO_DOC_PROFILE_ID } },
        select: { id: true, role: true },
    })
    console.log(`\n📊 Current ProfileAccess: ${existingAccess ? `EXISTS (role=${existingAccess.role})` : 'NONE'}`)

    // 4. Find all workspaces in Kẻ Cô Độc
    const workspaces = await prisma.workspace.findMany({
        where: { profileId: KE_CO_DOC_PROFILE_ID, status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { createdAt: 'desc' },
    })
    console.log(`📊 Active workspaces in "${profile.name}": ${workspaces.length}`)

    for (const ws of workspaces) {
        const member = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: PULLIO_USER_ID, workspaceId: ws.id } },
            select: { id: true, role: true },
        })
        console.log(`   - "${ws.name}" (${ws.id.slice(0, 8)}): ${member ? `MEMBER (role=${member.role})` : 'NOT A MEMBER'}`)
    }

    // 5. Check pending invitations
    const pendingInvitations = await prisma.workspaceInvitation.findMany({
        where: {
            invitedUserId: PULLIO_USER_ID,
            workspace: { profileId: KE_CO_DOC_PROFILE_ID },
            status: 'PENDING',
        },
        select: { id: true, workspaceId: true, role: true, workspace: { select: { name: true } } },
    })
    console.log(`\n📨 Pending invitations: ${pendingInvitations.length}`)
    for (const inv of pendingInvitations) {
        console.log(`   - Workspace "${inv.workspace.name}" (role=${inv.role})`)
    }

    if (!shouldExecute) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        console.log(`💡 Run with --execute to apply changes.`)
        return
    }

    // ══════ EXECUTE ══════
    console.log(`\n🔧 Applying changes...\n`)

    // A. Create/ensure ProfileAccess
    try {
        await prisma.profileAccess.upsert({
            where: { userId_profileId: { userId: PULLIO_USER_ID, profileId: KE_CO_DOC_PROFILE_ID } },
            create: { userId: PULLIO_USER_ID, profileId: KE_CO_DOC_PROFILE_ID, role: 'USER' },
            update: {},  // don't override if already exists
        })
        console.log(`✅ ProfileAccess: Pullio → "${profile.name}" (role=USER)`)
    } catch (e: any) {
        console.error(`❌ ProfileAccess failed: ${e?.message?.slice(0, 100)}`)
    }

    // B. Create WorkspaceMember for each workspace
    let membershipsCreated = 0
    for (const ws of workspaces) {
        try {
            await prisma.workspaceMember.upsert({
                where: { userId_workspaceId: { userId: PULLIO_USER_ID, workspaceId: ws.id } },
                create: { userId: PULLIO_USER_ID, workspaceId: ws.id, role: 'MEMBER' },
                update: {},  // don't override if already exists (respect existing role)
            })
            membershipsCreated++
            console.log(`✅ WorkspaceMember: Pullio → "${ws.name}" (role=MEMBER)`)
        } catch (e: any) {
            console.error(`❌ WorkspaceMember for "${ws.name}" failed: ${e?.message?.slice(0, 100)}`)
        }
    }

    // C. Mark pending invitations as ACCEPTED
    let invitationsAccepted = 0
    for (const inv of pendingInvitations) {
        try {
            await prisma.workspaceInvitation.update({
                where: { id: inv.id },
                data: { status: 'ACCEPTED', respondedAt: new Date() },
            })
            invitationsAccepted++
            console.log(`✅ Invitation accepted: "${inv.workspace.name}"`)
        } catch (e: any) {
            console.error(`❌ Invitation accept failed: ${e?.message?.slice(0, 100)}`)
        }
    }

    // D. Summary
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 Results:`)
    console.log(`   ✅ ProfileAccess created/verified`)
    console.log(`   ✅ WorkspaceMemberships: ${membershipsCreated}/${workspaces.length}`)
    console.log(`   ✅ Invitations accepted: ${invitationsAccepted}/${pendingInvitations.length}`)
    console.log(`\n💡 Pullio should now appear in:`)
    console.log(`   - Admin page assignee dropdown (add task → search "Pullio")`)
    console.log(`   - Workspace members list`)
    console.log(`   - Profile-scoped user queries`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
