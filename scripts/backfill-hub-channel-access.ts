/**
 * [Hub member-based] One-time backfill before the channel access model flips to
 * "member-only for everyone". For every STANDALONE channel (TEXT/FORUM/WIKI):
 *   1. set Channel.createdById = the workspace's OWNER (resolved via
 *      Workspace.profileId -> ProfileAccess(role='OWNER'); there are no
 *      WorkspaceMember.role='OWNER' rows post-Sprint-Z1).
 *   2. add ALL current workspace staff as ChannelMember (skipDuplicates) so
 *      nobody loses access when PUBLIC-everyone-sees is removed; the owner row
 *      is set to MODERATOR.
 *
 * Staff = everyone who currently passes verifyWorkspaceAccess(MEMBER) =
 *   WorkspaceMember(role in ADMIN/MEMBER)  UNION
 *   ProfileAccess(profileId = workspace.profileId, role in OWNER/ADMIN/USER).
 * CLIENT + GUEST excluded (they never saw Hub channels).
 *
 * TASK channels are intentionally untouched (they stay viewable by any member
 * via a type special-case in channel-permissions).
 *
 * SAFE: additive + idempotent (skipDuplicates on the unique [channelId,userId]).
 * DRY-RUN by default; pass --apply to commit.
 *
 *   npx tsx scripts/backfill-hub-channel-access.ts          # dry-run
 *   npx tsx scripts/backfill-hub-channel-access.ts --apply  # commit
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
    const channels = await prisma.channel.findMany({
        where: { type: { in: ['TEXT', 'FORUM', 'WIKI'] } },
        select: { id: true, name: true, workspaceId: true, profileId: true, createdById: true },
        orderBy: { createdAt: 'asc' },
    })
    console.log(`Found ${channels.length} standalone channels. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

    let ownerSet = 0
    let noOwner = 0
    let memberWrites = 0

    for (const ch of channels) {
        // 1. resolve the workspace OWNER (via the profile, not WorkspaceMember).
        const ws = await prisma.workspace.findUnique({ where: { id: ch.workspaceId }, select: { profileId: true } })
        const profileId = ws?.profileId ?? ch.profileId
        let ownerId: string | null = null
        if (profileId) {
            const owner = await prisma.profileAccess.findFirst({
                where: { profileId, role: 'OWNER' },
                orderBy: { grantedAt: 'asc' },
                select: { userId: true },
            })
            ownerId = owner?.userId ?? null
        }
        if (!ownerId) noOwner++

        // 2. staff set = current workspace members (who currently see the channel).
        const [wm, pa] = await Promise.all([
            prisma.workspaceMember.findMany({
                where: { workspaceId: ch.workspaceId, role: { in: ['ADMIN', 'MEMBER'] } },
                select: { userId: true },
            }),
            profileId
                ? prisma.profileAccess.findMany({
                      where: { profileId, role: { in: ['OWNER', 'ADMIN', 'USER'] } },
                      select: { userId: true },
                  })
                : Promise.resolve([] as { userId: string }[]),
        ])
        const staff = new Set<string>([...wm.map((w) => w.userId), ...pa.map((p) => p.userId)])
        if (ownerId) staff.add(ownerId)

        console.log(
            `  ${APPLY ? 'BACKFILL' : 'would backfill'}: "${ch.name}" (${ch.id}) — owner=${ownerId ?? 'NONE'} · ${staff.size} members`,
        )

        if (APPLY) {
            if (ownerId) {
                await prisma.channel.update({ where: { id: ch.id }, data: { createdById: ownerId } })
                ownerSet++
            }
            const ids = Array.from(staff)
            if (ids.length > 0) {
                await prisma.channelMember.createMany({
                    data: ids.map((userId) => ({
                        workspaceId: ch.workspaceId,
                        profileId: ch.profileId,
                        channelId: ch.id,
                        userId,
                        role: userId === ownerId ? 'MODERATOR' : 'MEMBER',
                    })),
                    skipDuplicates: true,
                })
                if (ownerId) {
                    // ensure the owner is MODERATOR even if their row pre-existed as MEMBER
                    await prisma.channelMember.updateMany({
                        where: { channelId: ch.id, userId: ownerId },
                        data: { role: 'MODERATOR' },
                    })
                }
                memberWrites += ids.length
            }
        }
    }

    console.log(
        `\nDone. createdById set: ${ownerSet} · channels missing owner: ${noOwner} · member upserts: ${memberWrites}.` +
            (APPLY ? '' : '  (dry-run — pass --apply to commit)'),
    )
    if (noOwner > 0) {
        console.warn(`\n⚠️  ${noOwner} channel(s) had no resolvable profile OWNER — members were still backfilled; createdById left null (those channels have no owner until reassigned).`)
    }
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error(e)
        return prisma.$disconnect().finally(() => process.exit(1))
    })
