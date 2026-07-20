// [Review module P5.1] Guest-facing share content + scope guards (API-SPEC §5.5).
// EVERYTHING a guest can see flows through here — no /api/r/* route may query
// assets/versions ad-hoc (anti-leak checklist §5.6). The trimmed DTOs never carry
// workspaceId, taskId, uploader identity, money fields, or guest emails.
//
// Scope rules:
//  - A share exposes its live ShareLinkItems: direct assets + folder subtrees
//    (recursive via the materialized folder path). Soft-deleted folders/assets
//    vanish from the share IMMEDIATELY (invariant I12) — checked per request.
//  - showAllVersions=false ⇒ ONLY each asset's currentVersion exists for guests;
//    any other versionId → 404 that does not confirm the version exists.

import type { Prisma, ReviewAsset, ReviewVersion, ShareLink } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiError } from './errors'
import { reviewLog } from './logger'
import { buildMediaLinks } from './media-links'
import { pipelineStatusToDto, reviewStateToDto } from './dto'
import type { MediaLinks, MediaKindDto, ReviewStateDto, UploadStatusDto } from './dto'
import { shareTokenTtlSec, type ShareWithItems } from './share-auth'

const MAX_SHARE_ASSETS = 100 // Reel cap — a folder share bigger than this is truncated (logged)

// ─────────────────────────── guest DTOs (trimmed! §5.5.2) ───────────────────────────

export interface GuestVersionView {
    versionId: string
    versionNumber: number
    uploadStatus: UploadStatusDto
    reviewState: ReviewStateDto
    durationMs: number | null
    fps: { num: number; den: number } | null
    width: number | null
    height: number | null
    /** signed poster/storyboard/playbackId — null while processing */
    media: MediaLinks | null
    publicCommentCount: number
}

export interface GuestAssetView {
    assetId: string
    title: string
    mediaKind: MediaKindDto
    versions: GuestVersionView[] // head only unless showAllVersions; newest first
}

export interface GuestShareContent {
    share: {
        name: string
        allowComments: boolean
        allowDownload: boolean
        downloadOnlyWhenApproved: boolean
        showAllVersions: boolean
    }
    items: GuestAssetView[]
    /**
     * A REAL guest session ONLY. The player treats this as "already identified" and
     * skips the name/email modal, so it must never be populated from a guessed name:
     * the API authorizes on the session cookie, and a guessed name made the player
     * skip the very modal that creates that cookie — every write then 401'd, with no
     * way for the guest to recover. See ensureScreeningIdentity in share-portal-actions.
     */
    guest: { name: string } | null
    /** Display-only hint used to PRE-FILL the identity modal. Grants nothing. */
    suggestedName: string | null
}

// ─────────────────────────── scope resolution ───────────────────────────

type AssetWithVersions = ReviewAsset & { versions: ReviewVersion[] }

/**
 * Resolve the LIVE assets a share exposes, in item order (direct assets by
 * sortIndex, then folder subtrees by sortIndex → asset name). Returns [] when
 * everything behind the link has been trashed → the page shows "Content unavailable".
 */
export async function resolveShareAssets(share: ShareWithItems): Promise<AssetWithVersions[]> {
    const directAssetIds = share.items.filter((i) => i.assetId).sort((a, b) => a.sortIndex - b.sortIndex).map((i) => i.assetId!)
    const folderIds = share.items.filter((i) => i.folderId).sort((a, b) => a.sortIndex - b.sortIndex).map((i) => i.folderId!)

    const versionsInclude = {
        versions: { where: { deletedAt: null }, orderBy: { versionNumber: 'desc' as const } },
    } satisfies Prisma.ReviewAssetInclude

    const out: AssetWithVersions[] = []
    const seen = new Set<string>()

    if (directAssetIds.length) {
        const direct = await prisma.reviewAsset.findMany({
            where: { id: { in: directAssetIds }, deletedAt: null },
            include: versionsInclude,
        })
        const byId = new Map(direct.map((a) => [a.id, a]))
        for (const id of directAssetIds) {
            const a = byId.get(id)
            if (a && !seen.has(a.id)) {
                seen.add(a.id)
                out.push(a)
            }
        }
    }

    for (const folderId of folderIds) {
        const folder = await prisma.reviewFolder.findFirst({
            where: { id: folderId, deletedAt: null },
            select: { id: true, path: true },
        })
        if (!folder) continue // trashed folder → its subtree is gone from the share
        const subFolders = await prisma.reviewFolder.findMany({
            where: { path: { startsWith: folder.path }, deletedAt: null },
            select: { id: true },
        })
        const assets = await prisma.reviewAsset.findMany({
            where: { folderId: { in: subFolders.map((f) => f.id) }, deletedAt: null },
            include: versionsInclude,
            orderBy: { name: 'asc' },
        })
        for (const a of assets) {
            if (seen.has(a.id)) continue
            if (out.length >= MAX_SHARE_ASSETS) {
                reviewLog('warn', 'share.assets_truncated', { shareId: share.id, cap: MAX_SHARE_ASSETS })
                return out
            }
            seen.add(a.id)
            out.push(a)
        }
    }
    return out
}

/**
 * Guard for every guest endpoint that takes a versionId (§5.5.3 rule): the version
 * must be live, belong to a live asset inside this share's scope, and — when
 * showAllVersions is OFF — be the asset's currentVersion. Every failure is the
 * SAME 404 so a prober can't map the version space.
 */
export async function assertVersionInShare(
    share: ShareWithItems,
    versionId: string,
): Promise<{ version: ReviewVersion; asset: ReviewAsset }> {
    const deny = () => apiError(404, 'NOT_FOUND', 'Not found.')
    if (!versionId || typeof versionId !== 'string') throw deny()

    const version = await prisma.reviewVersion.findFirst({
        where: { id: versionId, deletedAt: null },
        include: { asset: { include: { folder: { select: { path: true, deletedAt: true } } } } },
    })
    if (!version || !version.asset || version.asset.deletedAt) throw deny()
    const asset = version.asset

    // Membership: direct asset item, or the asset's folder sits under a live folder item.
    const directHit = share.items.some((i) => i.assetId === asset.id)
    let folderHit = false
    if (!directHit) {
        const folderItemIds = share.items.filter((i) => i.folderId).map((i) => i.folderId!)
        if (folderItemIds.length && asset.folder && !asset.folder.deletedAt) {
            const liveFolderItems = await prisma.reviewFolder.findMany({
                where: { id: { in: folderItemIds }, deletedAt: null },
                select: { path: true },
            })
            folderHit = liveFolderItems.some((f) => asset.folder!.path.startsWith(f.path))
        }
    }
    if (!directHit && !folderHit) throw deny()

    if (!share.showAllVersions && asset.currentVersionId !== version.id) throw deny()

    // Strip the include back to plain rows for callers.
    const { asset: _a, ...versionRow } = version as ReviewVersion & { asset: unknown }
    const { folder: _f, ...assetRow } = asset as ReviewAsset & { folder: unknown }
    return { version: versionRow as ReviewVersion, asset: assetRow as ReviewAsset }
}

// ─────────────────────────── content builder (GET /api/r/:slug + RSC) ───────────────────────────

export async function buildGuestShareContent(
    share: ShareWithItems,
    /** Name from a REAL guest session, or null. Never a guess — see GuestShareContent.guest. */
    guestName: string | null,
    /** Optional pre-fill for the identity modal. Purely cosmetic. */
    suggestedName: string | null = null,
): Promise<GuestShareContent> {
    const assets = await resolveShareAssets(share)
    const ttl = shareTokenTtlSec(share)

    // Which versions are visible to this guest?
    const visible: { asset: AssetWithVersions; versions: ReviewVersion[] }[] = assets.map((asset) => {
        if (share.showAllVersions) return { asset, versions: asset.versions }
        const head = asset.versions.find((v) => v.id === asset.currentVersionId)
        return { asset, versions: head ? [head] : [] }
    })

    // Public (isInternal=false) live comment counts, per visible version, one query.
    // NEVER reuse ReviewVersion.commentCount here — it includes internal comments
    // and its delta would leak that internal chatter exists (DATA-MODEL §9).
    const versionIds = visible.flatMap((x) => x.versions.map((v) => v.id))
    const counts = versionIds.length
        ? await prisma.reviewComment.groupBy({
              by: ['versionId'],
              where: { versionId: { in: versionIds }, isInternal: false, deletedAt: null },
              _count: { _all: true },
          })
        : []
    const countByVersion = new Map(counts.map((c) => [c.versionId, c._count._all]))

    const items: GuestAssetView[] = visible
        .filter((x) => x.versions.length > 0)
        .map(({ asset, versions }) => ({
            assetId: asset.id,
            title: asset.name,
            mediaKind: asset.mediaKind === 'VIDEO' ? 'video' : 'image',
            versions: versions.map((v) => ({
                versionId: v.id,
                versionNumber: v.versionNumber,
                uploadStatus: pipelineStatusToDto(v.pipelineStatus),
                reviewState: reviewStateToDto(v.reviewState),
                durationMs: v.durationMs ?? null,
                fps: v.fpsNumerator != null && v.fpsDenominator != null ? { num: v.fpsNumerator, den: v.fpsDenominator } : null,
                width: v.width ?? null,
                height: v.height ?? null,
                media: buildMediaLinks({ muxPlaybackId: v.muxPlaybackId, thumbTime: v.thumbTime }, ttl),
                publicCommentCount: countByVersion.get(v.id) ?? 0,
            })),
        }))

    return {
        share: {
            name: share.name ?? items[0]?.title ?? 'Review',
            allowComments: share.allowComments,
            allowDownload: share.allowDownload,
            downloadOnlyWhenApproved: share.downloadOnlyWhenApproved,
            showAllVersions: share.showAllVersions,
        },
        items,
        guest: guestName ? { name: guestName } : null,
        suggestedName,
    }
}
