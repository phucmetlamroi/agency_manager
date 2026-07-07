// [Review module P1.10] Read model for the task-drawer BÀN GIAO block
// (API-SPEC §6.2). Returns the deliverable stacks for a task (card list, polled
// 3s while any version is uploading/processing) + the upload-context the confirm
// strip previews BEFORE an upload starts (destination breadcrumb + "next version"
// hint). Read-only; access is re-checked from the task's resolved workspace, never
// from a caller-supplied scope. Carries NO finance/assignee fields — the review
// models have none, so nothing here can leak jobPriceUSD to non-admin staff.

import { prisma } from '@/lib/db'
import { requireReviewAccess } from './access'
import { apiError } from './errors'
import { serializeVersion, toUserRef, type VersionDto } from './dto'
import { buildMediaLinks } from './media-links'
import { parseVideoTitle } from './parse-task-context'

export interface TaskDeliverableDto {
    assetId: string
    name: string
    taskId: string | null
    statusId: string | null
    currentVersion: VersionDto | null
    /** Unresolved top-level comments on the current version (drives the drawer badge). */
    unresolvedCommentCount: number
    createdAt: string
    updatedAt: string
}

export interface TaskUploadContextDto {
    /** Destination folders top→leaf, e.g. Team / Michael / North… / Bathroom 1. */
    breadcrumb: { name: string }[]
    /** false = the "Khách / Brand · Video" convention didn't parse (show a warning). */
    parsedOk: boolean
    /** Non-null when a second upload would stack a new version onto an existing card. */
    existingAsset: { id: string; name: string; nextVersionNumber: number } | null
}

export interface TaskAssetsResult {
    /** The task's workspace — the client builds the player link `/{workspaceId}/team/asset/{id}`. */
    workspaceId: string
    assets: TaskDeliverableDto[]
    uploadContext: TaskUploadContextDto
}

/**
 * Load the BÀN GIAO deliverables + upload context for a task. Mirrors the
 * resolution rules of `initiateTaskUpload` (same task→workspace access check,
 * same case-insensitive `(taskId, video-name)` auto-version match) so the strip's
 * preview matches what the upload will actually do.
 */
export async function getTaskAssets(taskId: string): Promise<TaskAssetsResult> {
    const task = await prisma.task.findFirst({
        where: { id: taskId },
        select: {
            id: true,
            title: true,
            workspaceId: true,
            client: { select: { name: true } },
            workspace: { select: { name: true } },
        },
    })
    if (!task) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy task.')
    if (!task.workspaceId) throw apiError(409, 'STATE_INVALID', 'Task chưa thuộc workspace nào.')
    const workspaceId = task.workspaceId
    // Defense in depth: re-verify workspace membership from the resolved scope.
    await requireReviewAccess({ workspaceId })

    const assetRows = await prisma.reviewAsset.findMany({
        where: { taskId: task.id, workspaceId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { currentVersion: true },
    })

    // Resolve uploader display for each head version in one round-trip.
    const uploaderIds = Array.from(
        new Set(assetRows.map((a) => a.currentVersion?.uploaderId).filter((x): x is string => !!x)),
    )
    const uploaders = uploaderIds.length
        ? await prisma.user.findMany({
              where: { id: { in: uploaderIds } },
              select: { id: true, displayName: true, username: true, nickname: true, avatarUrl: true },
          })
        : []
    const uploaderById = new Map(uploaders.map((u) => [u.id, u]))

    // Unresolved top-level comments per current version (one grouped query).
    const curVersionIds = assetRows.map((a) => a.currentVersion?.id).filter((x): x is string => !!x)
    const unresolvedByVersion = new Map<string, number>()
    if (curVersionIds.length) {
        const grouped = await prisma.reviewComment.groupBy({
            by: ['versionId'],
            where: { versionId: { in: curVersionIds }, parentId: null, resolvedAt: null, deletedAt: null },
            _count: { _all: true },
        })
        for (const g of grouped) unresolvedByVersion.set(g.versionId, g._count._all)
    }

    const assets: TaskDeliverableDto[] = assetRows.map((a) => {
        const v = a.currentVersion
        const currentVersion = v
            ? serializeVersion(v, {
                  uploader: toUserRef(uploaderById.get(v.uploaderId)),
                  media: buildMediaLinks({ muxPlaybackId: v.muxPlaybackId, thumbTime: v.thumbTime }),
              })
            : null
        return {
            assetId: a.id,
            name: a.name,
            taskId: a.taskId,
            statusId: a.statusId,
            currentVersion,
            unresolvedCommentCount: v ? unresolvedByVersion.get(v.id) ?? 0 : 0,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
        }
    })

    // Upload-context preview: mirror parseVideoTitle + the ensureTaskFolderPath breadcrumb
    // shape (root → client → [brand] → video), WITHOUT creating any folders.
    const parsed = parseVideoTitle(task.title, task.client?.name ?? '')
    const breadcrumb: { name: string }[] = [{ name: task.workspace?.name || 'Team' }, { name: parsed.client }]
    if (parsed.brand) breadcrumb.push({ name: parsed.brand })
    breadcrumb.push({ name: parsed.video })

    // Existing-asset match = same rule initiateTaskUpload uses to auto-version.
    const match = assetRows.find((a) => a.name.trim().toLowerCase() === parsed.video.trim().toLowerCase())
    let existingAsset: TaskUploadContextDto['existingAsset'] = null
    if (match) {
        // Number from MAX(versionNumber) across ALL version rows — EXACTLY like initiateUpload
        // (upload-service §asset-branch), NOT from the head pointer. A video's head only advances
        // to the newest version on the Mux ready webhook, so while a v2 is still PROCESSING (or
        // ended FAILED) the head lags MAX and `head + 1` would mispredict the version the upload
        // actually creates. MAX + 1 keeps the confirm-strip preview honest.
        const agg = await prisma.reviewVersion.aggregate({
            where: { assetId: match.id },
            _max: { versionNumber: true },
        })
        existingAsset = { id: match.id, name: match.name, nextVersionNumber: (agg._max.versionNumber ?? 0) + 1 }
    }

    return {
        workspaceId,
        assets,
        uploadContext: { breadcrumb, parsedOk: parsed.matched, existingAsset },
    }
}
