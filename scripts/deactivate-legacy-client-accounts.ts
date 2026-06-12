/**
 * [Legacy cleanup] Deactivate legacy auto-created CLIENT-role accounts.
 *
 * The OLD logic auto-created a `User(role='CLIENT')` per Client record (username =
 * client name), polluting the Members list. The new model invites clients as a
 * per-profile membership instead. This script DEACTIVATES the leftover legacy
 * accounts: sets role='LOCKED' + bumps sessionVersion (forces logout).
 *
 * SAFE + REVERSIBLE: only changes the login account's role. Does NOT touch
 * Client / Task / Invoice / Rating data. To reverse, set role back for the ids
 * printed below.  DRY-RUN by default; pass --apply to commit.
 *
 *   npx tsx scripts/deactivate-legacy-client-accounts.ts          # dry-run
 *   npx tsx scripts/deactivate-legacy-client-accounts.ts --apply  # commit
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
    const accounts = await prisma.user.findMany({
        where: { role: 'CLIENT' },
        select: { id: true, username: true, email: true, profileId: true, clientId: true },
    })
    console.log(`Found ${accounts.length} legacy CLIENT-role accounts. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

    for (const u of accounts) {
        console.log(`  ${APPLY ? 'LOCK' : 'would lock'}: ${u.username} (${u.id})${u.email ? ' · ' + u.email : ''}${u.clientId ? ' · clientId=' + u.clientId : ''}`)
    }

    if (APPLY && accounts.length > 0) {
        const res = await prisma.user.updateMany({
            where: { role: 'CLIENT' },
            data: { role: 'LOCKED', sessionVersion: { increment: 1 } },
        })
        console.log(`\nLocked ${res.count} account(s): role → LOCKED, sessionVersion bumped (forces logout).`)
        console.log(`Reverse: set role back to USER/CLIENT for the ids above. Client/task/invoice data untouched.`)
    } else {
        console.log(`\n(dry-run — pass --apply to lock these accounts)`)
    }

    // [Canonical Clients 2026-06] Also revoke PENDING client invitations —
    // the invite flow was removed (clients use public share links now), so a
    // pending isClientInvite row would just dead-end at accept time.
    const pendingInvites = await prisma.workspaceInvitation.findMany({
        where: { isClientInvite: true, status: 'PENDING' },
        select: { id: true, invitedUserId: true, invitedEmail: true, clientId: true },
    })
    console.log(`\nFound ${pendingInvites.length} PENDING client invitation(s).`)
    for (const inv of pendingInvites) {
        console.log(`  ${APPLY ? 'REVOKE' : 'would revoke'}: ${inv.id}${inv.invitedEmail ? ' · ' + inv.invitedEmail : ''}${inv.clientId ? ' · clientId=' + inv.clientId : ''}`)
    }
    if (APPLY && pendingInvites.length > 0) {
        const r = await prisma.workspaceInvitation.updateMany({
            where: { isClientInvite: true, status: 'PENDING' },
            data: { status: 'REVOKED', respondedAt: new Date() },
        })
        console.log(`Revoked ${r.count} pending client invitation(s).`)
    }
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)) })
