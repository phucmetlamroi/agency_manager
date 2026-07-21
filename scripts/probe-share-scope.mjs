/* READ-ONLY prod probe. Two questions raised by the adversarial authorization audit.
 *
 * Q1 (Blocker candidate) — findClientReviewSlugs / getOrCreateClientReviewSlug branch 1 select a
 *    ShareLink by POLICY SHAPE only (allowDownload && !downloadOnlyWhenApproved && no password,
 *    live, containing ONE in-scope asset). Nothing constrains the share's OTHER items. If a live
 *    share of that shape spans more than one client — or carries a folder item, whose contents are
 *    unbounded — then a client's portal is already handing them a /r/ board that renders another
 *    client's video, presigns its master, and accepts a review decision on its task.
 *
 * Q2 (High candidate) — resolveShareToken widens scope by NAME-PATH prefix. Two ACTIVE clients that
 *    normalize to the same name at the same level in one profile therefore collapse into a single
 *    token scope, and each one's link reads both libraries.
 *
 * Zero rows on both => the defects are prospective; they arm on the next multi-client share or the
 * next duplicate name. Any rows => live cross-client exposure, fix before anything else.
 *
 * SELECT only. Nothing is written.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Q1a: live, client-reusable shares that span >1 client ────────────────────────────────
const spanning = await prisma.$queryRaw`
    SELECT sl.id, sl.slug, sl."createdAt", sl."workspaceId",
           COUNT(*)                                                    AS item_count,
           COUNT(*) FILTER (WHERE sli."folderId" IS NOT NULL)          AS folder_items,
           COUNT(DISTINCT COALESCE(ra."clientId", t."clientId"::text))       AS client_count,
           ARRAY_AGG(DISTINCT COALESCE(ra."clientId", t."clientId"::text))   AS client_ids
    FROM "ShareLink" sl
    JOIN "ShareLinkItem" sli ON sli."shareLinkId" = sl.id
    LEFT JOIN "ReviewAsset" ra ON ra.id = sli."assetId"
    LEFT JOIN "Task" t        ON t.id  = ra."taskId"
    WHERE sl."revokedAt" IS NULL
      AND (sl."expiresAt" IS NULL OR sl."expiresAt" > now())
      AND sl."allowDownload" = true
      AND sl."downloadOnlyWhenApproved" = false
      AND sl."passwordHash" IS NULL
    GROUP BY sl.id
    HAVING COUNT(DISTINCT COALESCE(ra."clientId", t."clientId"::text)) > 1
        OR COUNT(*) FILTER (WHERE sli."folderId" IS NOT NULL) > 0
    ORDER BY sl."createdAt"
`

console.log(`\n=== Q1a: LIVE client-reusable shares spanning >1 client, or carrying a folder item ===`)
console.log(`rows: ${spanning.length}\n`)
for (const r of spanning) {
    console.log(
        `  share ${r.slug}  items=${r.item_count} folders=${r.folder_items} ` +
        `clients=${r.client_count} ${JSON.stringify(r.client_ids)}  ws=${r.workspaceId}`,
    )
}

// ── Q1b: how many shares match the reusable shape at all (blast-radius context) ──────────
const reusable = await prisma.shareLink.count({
    where: {
        revokedAt: null,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
        allowDownload: true,
        downloadOnlyWhenApproved: false,
        passwordHash: null,
    },
})
const totalLinks = await prisma.shareLink.count()
console.log(`\n=== Q1b: shares matching the reusable shape ===`)
console.log(`  reusable: ${reusable} / ${totalLinks} total ShareLink rows`)

// ── Q2: ACTIVE clients colliding on normalized name at the same level in one profile ─────
const collisions = await prisma.$queryRaw`
    SELECT c."profileId",
           COALESCE(c."parentId", -1)              AS parent_id,
           lower(btrim(c.name))                    AS norm_name,
           COUNT(*)                                AS n,
           ARRAY_AGG(c.id ORDER BY c.id)           AS client_ids
    FROM "Client" c
    WHERE c.status = 'ACTIVE'
    GROUP BY c."profileId", COALESCE(c."parentId", -1), lower(btrim(c.name))
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
`

console.log(`\n=== Q2: ACTIVE clients sharing a normalized name at the same level in one profile ===`)
console.log(`rows: ${collisions.length}\n`)
for (const r of collisions) {
    console.log(`  profile ${r.profile_id ?? r.profileId} parent=${r.parent_id} "${r.norm_name}" ×${r.n} ${JSON.stringify(r.client_ids)}`)
}

await prisma.$disconnect()
