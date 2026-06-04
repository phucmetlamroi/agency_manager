/**
 * [Client membership] Migrate legacy global `User.role='CLIENT'` accounts to the
 * new per-profile model: set role → USER + create ProfileAccess(role=CLIENT,
 * clientId) for each profile the user is a client of, then bump sessionVersion
 * (forces re-login so stale role=CLIENT JWTs are rejected).
 *
 * SAFE: idempotent + DRY-RUN by default. Pass --apply to actually mutate.
 * NOTE: not strictly required — the portal is backward-compatible and legacy
 * CLIENT-role users keep working. Run this only to fully unify the model.
 *
 *   npx tsx scripts/migrate-client-role-to-membership.ts          # dry-run
 *   npx tsx scripts/migrate-client-role-to-membership.ts --apply  # commit
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function resolveClientIds(u: { username: string; nickname: string | null; profileId: string | null; clientId: number | null }): Promise<number[]> {
    const ids = new Set<number>()
    if (u.clientId) ids.add(u.clientId)
    if (ids.size === 0 && u.profileId) {
        const names = [u.username, ...(u.nickname ? [u.nickname] : [])]
        const matches = await prisma.client.findMany({
            where: { name: { in: names }, profileId: u.profileId },
            select: { id: true },
        })
        matches.forEach((c) => ids.add(c.id))
    }
    return Array.from(ids)
}

async function main() {
    const clients = await prisma.user.findMany({
        where: { role: 'CLIENT' },
        select: { id: true, username: true, nickname: true, profileId: true, clientId: true },
    })
    console.log(`Found ${clients.length} legacy CLIENT-role users. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

    let migrated = 0, unresolved = 0, demoteSkips = 0

    for (const u of clients) {
        const clientIds = await resolveClientIds(u as any)
        if (clientIds.length === 0) {
            console.warn(`  UNRESOLVED: ${u.username} (${u.id}) — no clientId / name-match. Role left as CLIENT.`)
            unresolved++
            continue
        }

        // One CLIENT ProfileAccess per distinct profile (root client per profile).
        const clientRecs = await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, profileId: true } })
        const byProfile = new Map<string, number>()
        for (const c of clientRecs) if (c.profileId && !byProfile.has(c.profileId)) byProfile.set(c.profileId, c.id)

        if (byProfile.size === 0) {
            console.warn(`  UNRESOLVED: ${u.username} — client(s) have no profileId. Role left as CLIENT.`)
            unresolved++
            continue
        }

        let wroteAny = false
        for (const [profileId, clientId] of byProfile) {
            const existing = await prisma.profileAccess.findUnique({
                where: { userId_profileId: { userId: u.id, profileId } },
                select: { role: true },
            })
            if (existing && existing.role !== 'CLIENT') {
                console.warn(`  SKIP demote: ${u.username} already ${existing.role} in profile ${profileId}`)
                demoteSkips++
                continue
            }
            console.log(`  ${APPLY ? 'MIGRATE' : 'would migrate'}: ${u.username} → ProfileAccess(CLIENT, client=${clientId}) in profile ${profileId}`)
            if (APPLY) {
                await prisma.profileAccess.upsert({
                    where: { userId_profileId: { userId: u.id, profileId } },
                    create: { userId: u.id, profileId, role: 'CLIENT', clientId },
                    update: { role: 'CLIENT', clientId },
                })
            }
            wroteAny = true
        }

        if (wroteAny) {
            if (APPLY) {
                await prisma.user.update({ where: { id: u.id }, data: { role: 'USER', sessionVersion: { increment: 1 } } })
            }
            migrated++
        }
    }

    console.log(`\nDone. Migrated: ${migrated} · Unresolved: ${unresolved} · Demote-skips: ${demoteSkips}.${APPLY ? '' : '  (dry-run — pass --apply to commit)'}`)
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)) })
