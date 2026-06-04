/**
 * [Chat] One-time backfill: migrate legacy standalone WikiPages (channelId = null,
 * reached from /admin/wiki) into a dedicated "Tài liệu" WIKI-type Chat channel per
 * workspace, so they appear under the unified Chat section.
 *
 * Per workspace that still has any WikiPage{channelId: null}:
 *   1. find-or-create a WIKI channel named "Tài liệu" (createdById = profile OWNER via
 *      Workspace.profileId -> ProfileAccess(role='OWNER'); creator added as MODERATOR;
 *      all current staff added as members — same staff set as the hub backfill).
 *   2. updateMany those pages' channelId -> the Docs channel.
 *
 * SAFE: additive + idempotent (find-or-create by name; skipDuplicates on members; a
 * re-run finds the channel + moves any remaining null pages). DRY-RUN by default.
 *
 *   npx tsx scripts/backfill-wiki-into-chat.ts          # dry-run
 *   npx tsx scripts/backfill-wiki-into-chat.ts --apply  # commit
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const DOCS_NAME = 'Tài liệu'

async function main() {
    const groups = await prisma.wikiPage.groupBy({
        by: ['workspaceId'],
        where: { channelId: null },
        _count: { _all: true },
    })
    console.log(`Found ${groups.length} workspace(s) with standalone wiki pages. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

    let channelsCreated = 0
    let pagesMoved = 0
    let skipped = 0

    for (const g of groups) {
        const workspaceId = g.workspaceId
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
        const profileId = ws?.profileId
        if (!profileId) {
            console.warn(`  SKIP ${workspaceId}: workspace has no profile`)
            skipped++
            continue
        }

        const owner = await prisma.profileAccess.findFirst({
            where: { profileId, role: 'OWNER' },
            orderBy: { grantedAt: 'asc' },
            select: { userId: true },
        })
        const ownerId = owner?.userId ?? null

        let docs = await prisma.channel.findFirst({
            where: { workspaceId, type: 'WIKI', name: DOCS_NAME },
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true },
        })

        console.log(
            `  Workspace ${workspaceId}: ${g._count._all} standalone page(s) · owner=${ownerId ?? 'NONE'} · ${docs ? `reuse "${docs.name}"` : `create "${DOCS_NAME}"`}`,
        )

        if (!APPLY) continue

        if (!docs) {
            const position = await prisma.channel.count({ where: { workspaceId } })
            docs = await prisma.channel.create({
                data: {
                    workspaceId,
                    profileId,
                    name: DOCS_NAME,
                    type: 'WIKI',
                    visibility: 'PRIVATE',
                    postPolicy: 'EVERYONE',
                    position,
                    createdById: ownerId,
                    ...(ownerId ? { members: { create: { workspaceId, profileId, userId: ownerId, role: 'MODERATOR' } } } : {}),
                },
                select: { id: true, name: true },
            })
            channelsCreated++

            // Add current staff as members (mirrors the hub backfill staff set).
            const [wm, pa] = await Promise.all([
                prisma.workspaceMember.findMany({ where: { workspaceId, role: { in: ['ADMIN', 'MEMBER'] } }, select: { userId: true } }),
                prisma.profileAccess.findMany({ where: { profileId, role: { in: ['OWNER', 'ADMIN', 'USER'] } }, select: { userId: true } }),
            ])
            const staff = new Set<string>([...wm.map((w) => w.userId), ...pa.map((p) => p.userId)])
            if (ownerId) staff.delete(ownerId) // already added as MODERATOR
            const ids = Array.from(staff)
            if (ids.length > 0) {
                await prisma.channelMember.createMany({
                    data: ids.map((userId) => ({ workspaceId, profileId, channelId: docs!.id, userId, role: 'MEMBER' as const })),
                    skipDuplicates: true,
                })
            }
        }

        const res = await prisma.wikiPage.updateMany({ where: { workspaceId, channelId: null }, data: { channelId: docs.id } })
        pagesMoved += res.count
    }

    console.log(
        `\nDone. WIKI channels created: ${channelsCreated} · pages moved: ${pagesMoved} · skipped workspaces: ${skipped}.` +
            (APPLY ? '' : '  (dry-run — pass --apply to commit)'),
    )
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error(e)
        return prisma.$disconnect().finally(() => process.exit(1))
    })
