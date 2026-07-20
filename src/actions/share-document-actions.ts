'use server'

import { prisma } from '@/lib/db'
import { limitDb } from '@/lib/review/rate-limit-db'
import { audit } from '@/lib/audit-log'
import { clientLabelOf, isClientDeliveredPhase } from '@/lib/portal-derive'
import { buildMediaLinks } from '@/lib/review/media-links'
import { presignGetObject } from '@/lib/review/r2'
import { findClientReviewSlugs, getOrCreateClientReviewSlug } from '@/lib/review/shares'
import { guestAppBaseUrl } from '@/lib/review/guest-emails/wrap'
import { getRequestIp, resolveShareToken, type ShareLinkScope } from '@/lib/share-link-auth'
import type { DocumentAsset, DocumentFolder, DocumentsSnapshot } from '@/components/portal/calm/types'

const DOWNLOAD_TTL_SEC = 15 * 60
const MAX_DOWNLOAD_BATCH = 100

type FolderRow = {
    id: string
    name: string
    parentId: string | null
    path: string
    workspaceId: string
    clientId: string | null
}

type DownloadableVersion = {
    versionId: string
    fileName: string
    r2Key: string
}

function pathIds(path: string): string[] {
    return path.split('/').filter(Boolean)
}

function bytesLabelTotal(assets: DocumentAsset[]): string {
    return assets.reduce((sum, asset) => sum + BigInt(asset.currentVersion.sizeBytes), BigInt(0)).toString()
}

function parseClientId(raw: string | null | undefined, allowed: Set<string>): number | null {
    if (!raw || !allowed.has(raw)) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
}

function addBytesToAncestors(
    folders: Map<string, DocumentFolder>,
    folderId: string,
    bytes: bigint,
): void {
    let cur: string | null = folderId
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
        seen.add(cur)
        const folder = folders.get(cur)
        if (!folder) return
        folder.totalBytes = (BigInt(folder.totalBytes) + bytes).toString()
        cur = folder.parentId
    }
}

function ensureWorkspaceFolder(
    folders: Map<string, DocumentFolder>,
    workspaceId: string,
    workspaceName: string | null,
): string {
    const id = `workspace:${workspaceId}`
    if (!folders.has(id)) {
        folders.set(id, {
            id,
            parentId: null,
            name: workspaceName || 'Project files',
            workspaceId,
            clientId: null,
            itemCount: 0,
            totalBytes: '0',
            kind: 'workspace',
        })
    }
    return id
}

function ensureUncategorizedFolder(
    folders: Map<string, DocumentFolder>,
    workspaceId: string,
    workspaceName: string | null,
): string {
    const workspaceFolderId = ensureWorkspaceFolder(folders, workspaceId, workspaceName)
    const id = `uncategorized:${workspaceId}`
    if (!folders.has(id)) {
        folders.set(id, {
            id,
            parentId: workspaceFolderId,
            name: 'Unsorted',
            workspaceId,
            clientId: null,
            itemCount: 0,
            totalBytes: '0',
            kind: 'uncategorized',
        })
        const parent = folders.get(workspaceFolderId)
        if (parent) parent.itemCount += 1
    }
    return id
}

function ensureRealFolder(
    folders: Map<string, DocumentFolder>,
    row: FolderRow,
    parentId: string,
    allowedClientIds: Set<string>,
): string {
    if (!folders.has(row.id)) {
        const clientId = parseClientId(row.clientId, allowedClientIds)
        folders.set(row.id, {
            id: row.id,
            parentId,
            name: row.name,
            workspaceId: row.workspaceId,
            clientId,
            itemCount: 0,
            totalBytes: '0',
            kind: clientId != null ? 'client' : 'folder',
        })
        const parent = folders.get(parentId)
        if (parent) parent.itemCount += 1
    }
    return row.id
}

async function buildClientDocuments(
    token: string,
): Promise<{ scope: ShareLinkScope; documents: DocumentsSnapshot; downloadable: Map<string, DownloadableVersion> } | null> {
    const scope = await resolveShareToken(token)
    if (!scope) return null

    const allowedClientIds = new Set(scope.clientIds.map(String))
    const scopedTasks = await prisma.task.findMany({
        where: {
            clientId: { in: scope.clientIds },
            workspaceId: { in: scope.workspaceIds },
            isArchived: false,
        },
        select: {
            id: true,
            status: true,
            clientReview: true,
            clientId: true,
        },
    })
    // [QA 2026-07-18] Files & masters = the client's library of DELIVERED originals, so it must
    // include COMPLETED productions ('Hoàn tất'), not only tasks still in an active client-facing
    // review. isClientDeliveredPhase = client-facing OR completed; without the completed branch a
    // client lost every finished month's downloads (8 delivered May videos were invisible). Still
    // excludes internal WIP + cancelled tasks. NOT the /r review-board gate (that stays R5-strict).
    const visibleTaskIds = scopedTasks
        .filter((task) => isClientDeliveredPhase(task.status, task.clientReview))
        .map((task) => task.id)
    const scopedTaskById = new Map(scopedTasks.map((task) => [task.id, task]))
    // Videos in scope that have not reached the client at all. Computed once, up here,
    // so EVERY return below reports the same number — an empty state that contradicts
    // the populated one is how a client concludes the system is lying.
    const inProgressCount = scopedTasks.filter(
        (t) => !visibleTaskIds.includes(t.id) && t.status !== 'Đã hủy',
    ).length

    if (visibleTaskIds.length === 0) {
        return {
            scope,
            documents: {
                folders: [],
                assets: [],
                // No delivered video at all → no asset was even queried, so nothing can be
                // mid-processing. inProgressCount carries the real reason.
                summary: { folderCount: 0, assetCount: 0, totalBytes: '0', processingCount: 0, inProgressCount },
                generatedAt: new Date().toISOString(),
            },
            downloadable: new Map(),
        }
    }

    const assetsRaw = await prisma.reviewAsset.findMany({
        where: {
            workspaceId: { in: scope.workspaceIds },
            deletedAt: null,
            taskId: { in: visibleTaskIds },
            // Deliberately NOT filtered on `currentVersionId: { not: null }`. An asset whose head
            // link never got written (initiateUpload succeeds, the follow-up update fails and is
            // swallowed) is delivered work the client cannot see — exactly the "stuff is going
            // missing" case. Excluding it here made processingCount blind to it, so the library
            // fell back to a generic "Nothing to download yet", potentially forever. The filter
            // below still drops it from `assets` exactly as before; now it is also counted.
        },
        select: {
            id: true,
            folderId: true,
            workspaceId: true,
            taskId: true,
            clientId: true,
            name: true,
            mediaKind: true,
            statusId: true,
            currentVersionId: true,
            createdById: true,
            createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })

    const currentVersionIds = Array.from(
        new Set(assetsRaw.map((asset) => asset.currentVersionId).filter((id): id is string => !!id)),
    )
    const currentVersions = currentVersionIds.length
        ? await prisma.reviewVersion.findMany({
            where: {
                id: { in: currentVersionIds },
                pipelineStatus: 'READY',
                r2Key: { not: null },
                deletedAt: null,
            },
            select: {
                id: true,
                assetId: true,
                versionNumber: true,
                fileName: true,
                sizeBytes: true,
                durationMs: true,
                width: true,
                height: true,
                createdAt: true,
                r2Key: true,
                muxPlaybackId: true,
                thumbTime: true,
            },
        })
        : []
    const versionById = new Map(currentVersions.map((version) => [version.id, version]))
    // [Honest empty state] The count of delivered videos whose file is not servable yet
    // must be taken HERE — this filter is where they are dropped. Counting inside the
    // render loop below is dead code: nothing survives to it without a READY version.
    let processingCount = 0
    const assets = assetsRaw.filter((asset) => {
        if (!asset.currentVersionId || !versionById.has(asset.currentVersionId)) {
            // In scope and delivered, but the file is still transcoding or has no object
            // yet. Real work, not yet servable — the client is told, not left guessing.
            if (asset.taskId && scopedTaskById.has(asset.taskId)) processingCount++
            return false
        }
        if (!asset.taskId || !scopedTaskById.has(asset.taskId)) return false
        return !asset.clientId || allowedClientIds.has(asset.clientId)
    })

    if (assets.length === 0) {
        return {
            scope,
            documents: {
                folders: [],
                assets: [],
                summary: { folderCount: 0, assetCount: 0, totalBytes: '0', processingCount, inProgressCount },
                generatedAt: new Date().toISOString(),
            },
            downloadable: new Map(),
        }
    }

    const workspaceIds = Array.from(new Set(assets.map((asset) => asset.workspaceId)))
    const clientIds = Array.from(
        new Set(assets
            .map((asset) => parseClientId(asset.clientId, allowedClientIds) ?? scopedTaskById.get(asset.taskId ?? '')?.clientId ?? null)
            .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))),
    )
    const directFolderIds = Array.from(new Set(assets.map((asset) => asset.folderId)))
    const directFolders = directFolderIds.length
        ? await prisma.reviewFolder.findMany({
            where: { id: { in: directFolderIds }, deletedAt: null },
            select: { id: true, name: true, parentId: true, path: true, workspaceId: true, clientId: true },
        })
        : []
    const directFolderById = new Map(directFolders.map((row) => [row.id, row]))
    const ancestorIds = Array.from(new Set(directFolders.flatMap((folder) => pathIds(folder.path))))
    const versionIds = assets
        .map((asset) => asset.currentVersionId)
        .filter((id): id is string => !!id && versionById.has(id))

    const [workspaceRows, clientRows, folderRows, publicCommentCounts, versionCounts] = await Promise.all([
        prisma.workspace.findMany({
            where: { id: { in: workspaceIds } },
            select: { id: true, name: true },
        }),
        prisma.client.findMany({
            where: { id: { in: clientIds }, profileId: scope.profileId, status: 'ACTIVE' },
            select: { id: true, name: true },
        }),
        prisma.reviewFolder.findMany({
            where: { id: { in: ancestorIds }, deletedAt: null },
            select: { id: true, name: true, parentId: true, path: true, workspaceId: true, clientId: true },
        }),
        prisma.reviewComment.groupBy({
            by: ['versionId'],
            where: {
                versionId: { in: versionIds },
                isInternal: false,
                deletedAt: null,
            },
            _count: { _all: true },
        }),
        prisma.reviewVersion.groupBy({
            by: ['assetId'],
            where: {
                assetId: { in: assets.map((asset) => asset.id) },
                deletedAt: null,
            },
            _count: { _all: true },
        }),
    ])

    const workspaceNameById = new Map(workspaceRows.map((row) => [row.id, row.name]))
    const clientNameById = new Map(clientRows.map((row) => [row.id, row.name]))
    const folderById = new Map(folderRows.map((row) => [row.id, row]))
    const commentCountByVersion = new Map(publicCommentCounts.map((row) => [row.versionId, row._count._all]))
    const versionCountByAsset = new Map(versionCounts.map((row) => [row.assetId, row._count._all]))
    const folders = new Map<string, DocumentFolder>()
    const documentAssets: DocumentAsset[] = []
    const downloadable = new Map<string, DownloadableVersion>()
    const guestBase = guestAppBaseUrl()

    // [Parity review 2026-07] Resolve every review slug in ONE indexed query before the
    // loop. This used to be a sequential get-or-create per video asset inside the loop —
    // 1–2 reads plus a possible write, each — which the zip route then paid again on every
    // download because it rebuilds this same snapshot. In the steady state each asset
    // already has a link, so this answers the whole page and writes nothing.
    const videoAssetIds = assets
        .filter((a) => a.mediaKind === 'VIDEO' && a.currentVersionId && versionById.get(a.currentVersionId)?.muxPlaybackId)
        .map((a) => a.id)
    const slugByAsset = await findClientReviewSlugs(videoAssetIds)

    for (const asset of assets) {
        const version = asset.currentVersionId ? versionById.get(asset.currentVersionId) : null
        if (!version?.r2Key) continue

        const workspaceFolderId = ensureWorkspaceFolder(
            folders,
            asset.workspaceId,
            workspaceNameById.get(asset.workspaceId) ?? null,
        )
        const sourceFolder = directFolderById.get(asset.folderId)
        const chain = pathIds(sourceFolder?.path ?? '')
            .map((id) => folderById.get(id))
            .filter((row): row is FolderRow => !!row && row.workspaceId === asset.workspaceId)

        const safeStart = chain.findIndex((row) => !!row.clientId && allowedClientIds.has(row.clientId))
        let visibleFolderId: string
        if (safeStart === -1) {
            visibleFolderId = ensureUncategorizedFolder(folders, asset.workspaceId, workspaceNameById.get(asset.workspaceId) ?? null)
        } else {
            let parentId = workspaceFolderId
            for (const row of chain.slice(safeStart)) {
                parentId = ensureRealFolder(folders, row, parentId, allowedClientIds)
            }
            visibleFolderId = parentId
        }

        const clientId = parseClientId(asset.clientId, allowedClientIds) ?? scopedTaskById.get(asset.taskId ?? '')?.clientId ?? null
        let media: ReturnType<typeof buildMediaLinks> = null
        try {
            media = buildMediaLinks({ muxPlaybackId: version.muxPlaybackId, thumbTime: version.thumbTime })
        } catch {
            media = null
        }
        let reviewUrl: string | null = null
        if (asset.mediaKind === 'VIDEO' && version.muxPlaybackId) {
            // Fast path: the batch read above already found this asset's board — no query,
            // no write. Only a video whose link does not exist yet falls through to the
            // minting call, and only once, because the next load finds what it created.
            const known = slugByAsset.get(asset.id)
            if (known) {
                reviewUrl = `${guestBase}/r/${known}`
            } else {
                try {
                    reviewUrl = `${guestBase}/r/${await getOrCreateClientReviewSlug({
                        id: asset.id,
                        workspaceId: asset.workspaceId,
                        taskId: asset.taskId ?? null,
                        createdById: asset.createdById,
                    })}`
                } catch {
                    reviewUrl = null
                }
            }
        }

        const resolvedClientId = typeof clientId === 'number' && Number.isFinite(clientId) ? clientId : null
        const docAsset: DocumentAsset = {
            id: asset.id,
            folderId: visibleFolderId,
            title: asset.name,
            mediaKind: asset.mediaKind === 'VIDEO' ? 'video' : 'image',
            workspaceId: asset.workspaceId,
            workspaceName: workspaceNameById.get(asset.workspaceId) ?? null,
            clientId: resolvedClientId,
            clientName: resolvedClientId != null ? clientNameById.get(resolvedClientId) ?? null : null,
            statusLabel: asset.statusId ? clientLabelOf(asset.statusId) : null,
            reviewUrl,
            versionCount: versionCountByAsset.get(asset.id) ?? 1,
            currentVersion: {
                id: version.id,
                versionNumber: version.versionNumber,
                fileName: version.fileName,
                sizeBytes: version.sizeBytes.toString(),
                durationMs: version.durationMs ?? null,
                width: version.width ?? null,
                height: version.height ?? null,
                createdAt: version.createdAt.toISOString(),
                posterUrl: media?.posterUrl ?? null,
                storyboardVttUrl: media?.storyboardVttUrl ?? null,
                publicCommentCount: commentCountByVersion.get(version.id) ?? 0,
            },
            createdAt: asset.createdAt.toISOString(),
        }
        documentAssets.push(docAsset)
        downloadable.set(version.id, { versionId: version.id, fileName: version.fileName, r2Key: version.r2Key })

        const visibleDocFolder = folders.get(visibleFolderId)
        if (visibleDocFolder) visibleDocFolder.itemCount += 1
        addBytesToAncestors(folders, visibleFolderId, version.sizeBytes)
    }

    const sortedFolders = Array.from(folders.values()).sort((a, b) => {
        if (a.parentId === b.parentId) return a.name.localeCompare(b.name)
        return (a.parentId ?? '').localeCompare(b.parentId ?? '')
    })
    const sortedAssets = documentAssets.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title))

    return {
        scope,
        documents: {
            folders: sortedFolders,
            assets: sortedAssets,
            summary: {
                folderCount: sortedFolders.length,
                assetCount: sortedAssets.length,
                totalBytes: bytesLabelTotal(sortedAssets),
                processingCount,
                inProgressCount,
            },
            generatedAt: new Date().toISOString(),
        },
        downloadable,
    }
}

export async function getDocumentsViaToken(token: string): Promise<DocumentsSnapshot | null> {
    const built = await buildClientDocuments(token)
    return built?.documents ?? null
}

export async function downloadDocumentsViaToken(
    token: string,
    versionIds: string[],
): Promise<{
    success: boolean
    error?: string
    files?: { versionId: string; fileName: string; url: string; expiresAt: string }[]
}> {
    const built = await buildClientDocuments(token)
    if (!built) return { success: false, error: 'This link is invalid.' }

    const cleaned = Array.from(
        new Set((versionIds || []).filter((id) => typeof id === 'string' && id.length > 0)),
    )
    if (cleaned.length < 1) return { success: false, error: 'Please select at least one file.' }
    if (cleaned.length > MAX_DOWNLOAD_BATCH) {
        return { success: false, error: `You can download up to ${MAX_DOWNLOAD_BATCH} files at a time.` }
    }

    // [Parity review 2026-07] Was rateLimit(), a per-process in-memory Map: on serverless
    // every cold instance starts at zero, so in aggregate it capped nothing — and its key
    // mixed in an IP read from client-supplied X-Forwarded-For. The zip route next door
    // already rejected that design for exactly these bytes; same door, same lock now:
    // DB-backed, keyed on the share link, unspoofable.
    const rl = await limitDb(`portal-doc-download:${built.scope.shareLinkId}`, 60, 60 * 60, { failClosed: true })
    if (!rl.success) return { success: false, error: 'Too many downloads. Please try again in a little while.' }

    const allowed = cleaned
        .map((id) => built.downloadable.get(id))
        .filter((item): item is DownloadableVersion => !!item)
    if (allowed.length === 0) return { success: false, error: 'The selected files are no longer available.' }

    const files = await Promise.all(
        allowed.map(async (item) => ({
            versionId: item.versionId,
            fileName: item.fileName,
            url: await presignGetObject(item.r2Key, { expiresIn: DOWNLOAD_TTL_SEC, downloadFileName: item.fileName }),
            expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SEC * 1000).toISOString(),
        })),
    )

    void audit({
        workspaceId: null,
        actorUserId: null,
        action: 'share_link.accessed',
        targetType: 'ClientShareLink',
        targetId: built.scope.shareLinkId,
        after: {
            kind: 'document_download',
            versionCount: files.length,
            clientId: built.scope.clientId,
            profileId: built.scope.profileId,
        },
    })

    return { success: true, files }
}
