// [Review module P1.10] Read model for the task-drawer BÀN GIAO block
// (API-SPEC §6.2). Returns the deliverable stacks for a task (card list, polled
// 3s while any version is uploading/processing) + the upload-context the confirm
// strip previews BEFORE an upload starts (destination breadcrumb + "next version"
// hint). Read-only; access is re-checked from the task's resolved workspace, never
// from a caller-supplied scope. Carries NO finance/assignee fields — the review
// models have none, so nothing here can leak jobPriceUSD to non-admin staff.

import { prisma } from '@/lib/db'
import { requireReviewAccess } from './access'
import { getFolderScope, isPathVisible } from './folder-scope'
import { apiError } from './errors'
import { serializeVersion, toUserRef, type VersionDto } from './dto'
import { buildMediaLinks } from './media-links'
import { parseVideoTitle } from './parse-task-context'
import { resolveTaskFolderPreview } from './task-folder'
import { REVIEW_ACTIVITY } from './activity'
import { REVIEW_MODULE_LABEL } from './labels'
import { canAutoTransition } from '@/lib/task-statuses'
import { REVIEW_STATUS_MAP } from './status-map'

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
    /** `exists: false` = this level does not exist yet and the upload will create it. */
    breadcrumb: { name: string; exists: boolean }[]
    /** false = the "Khách / Brand · Video" convention didn't parse (show a warning). */
    parsedOk: boolean
    /** Non-null when a second upload would stack a new version onto an existing card.
     *  `willRenameTo` is set when that card's name no longer matches the task title and the upload
     *  will bring it back in sync — announced up front so an automatic rename is never a surprise. */
    existingAsset: { id: string; name: string; nextVersionNumber: number; willRenameTo: string | null } | null
    /** [owner request 2026-07-27] Every live deliverable on this task, so a multi-hook upload can
     *  PICK the one to version instead of relying on the filename matching. Automatic matching is a
     *  guess; on a set of hooks a one-character difference silently mints a new video. */
    taskAssets: { id: string; name: string; nextVersionNumber: number }[]
}

/**
 * [status-audit 2026-07-23] Non-null when the VIEWER may confirm "đã sửa xong" (F9) on this
 * task right now — i.e. the task sits at A3 (internal round) or A6 (client round) and the
 * viewer is the assignee or an admin.
 *
 * Why this exists: F9 was reachable from exactly ONE screen, the review-player header. The
 * editor's natural loop is the task drawer (get the bell → open the task → upload the fix),
 * and the drawer had no exit from A3, so tasks sat there until an admin retyped the status by
 * hand. The rule below is the SAME one the server enforces in `confirmFixDone` (task-sync.ts)
 * — the UI must never be wider than the server, and this time it must not be narrower either.
 */
export interface TaskFixConfirmDto {
    /** Any live asset of this task — `confirmFixDone` resolves the task from it. */
    assetId: string
    /** The status the confirm will move the task to (A4 or A7), for honest button copy. */
    targetStatus: string
    /** true = an ADMIN confirming for the assignee (different wording, same action). */
    onBehalf: boolean
}

export interface TaskAssetsResult {
    /** The task's workspace — the client builds the player link `/{workspaceId}/team/asset/{id}`. */
    workspaceId: string
    assets: TaskDeliverableDto[]
    uploadContext: TaskUploadContextDto
    /** Null unless the viewer can confirm a finished feedback round — see TaskFixConfirmDto.
     *  Doubles as the "task is mid-revision AND you may act on it" signal the confirm-strip uses
     *  to offer "đây là bản đã sửa feedback?", so no separate status field is needed here. */
    fixConfirm: TaskFixConfirmDto | null
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
            // [status-audit] status + assigneeId + isArchived drive fixConfirm below. They are READ
            // to compute a boolean and are never serialized into the response, so the "carries no
            // finance/assignee fields" property of this DTO still holds.
            status: true,
            assigneeId: true,
            // Read only to resolve the destination folder chain (same clientKey the writer uses);
            // never serialized into the DTO.
            clientId: true,
            isArchived: true,
            client: { select: { name: true } },
            workspace: { select: { name: true } },
        },
    })
    if (!task) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy task.')
    if (!task.workspaceId) throw apiError(409, 'STATE_INVALID', 'Task chưa thuộc workspace nào.')
    const workspaceId = task.workspaceId
    // Defense in depth: re-verify workspace membership from the resolved scope.
    const access = await requireReviewAccess({ workspaceId })
    // [FR-03] editor chỉ thấy deliverable trong folder được giao — ẩn asset ngoài phạm vi
    // TRƯỚC serialize để không mint token thumbnail/storyboard Mux cho chúng.
    const scope = await getFolderScope({ userId: access.userId, workspaceId, isAdmin: access.isAdmin })

    const allAssetRows = await prisma.reviewAsset.findMany({
        where: { taskId: task.id, workspaceId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { currentVersion: true, folder: { select: { path: true } } },
    })
    const assetRows = scope.unrestricted ? allAssetRows : allAssetRows.filter((a) => isPathVisible(scope, a.folder.path))

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

    // Unresolved top-level comments per current version (one grouped query) — this drives the
    // per-CARD badge, which is deliberately head-only.
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

    // [status-audit 2026-07-23] Open feedback per ASSET, across EVERY live version — a separate
    // number from the head-only one above, and the only one fit to choose which asset carries the
    // round. The head pointer advances the moment a fix is ingested (inngest.ts re-points
    // currentVersionId unconditionally), so a head-only score drops the asset that actually holds
    // the feedback to 0 exactly when the editor is about to confirm it — handing the confirm to a
    // sibling deliverable, whose innocent comments then get stamped resolved while the real round
    // stays open. Two cheap queries beat that guess.
    const openByAsset = new Map<string, number>()
    if (assetRows.length) {
        const liveVersions = await prisma.reviewVersion.findMany({
            // deletedAt is load-bearing: deleting a version does NOT delete its comments, so a
            // trashed version's stale notes would otherwise score an asset and win the pick.
            where: { assetId: { in: assetRows.map((a) => a.id) }, deletedAt: null },
            select: { id: true, assetId: true },
        })
        if (liveVersions.length) {
            const assetIdByVersion = new Map(liveVersions.map((v) => [v.id, v.assetId]))
            const openGrouped = await prisma.reviewComment.groupBy({
                by: ['versionId'],
                where: {
                    versionId: { in: liveVersions.map((v) => v.id) },
                    parentId: null,
                    resolvedAt: null,
                    deletedAt: null,
                },
                _count: { _all: true },
            })
            for (const g of openGrouped) {
                const aid = assetIdByVersion.get(g.versionId)
                if (aid) openByAsset.set(aid, (openByAsset.get(aid) ?? 0) + g._count._all)
            }
        }
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

    // [audit 2026-07-27 · LOW] Upload-context preview. This used to be built purely from the task
    // title — zero queries — so it named folders that no longer existed under that name and called
    // the root by the workspace name while Tệp labels that same folder "Tệp". Resolve the real
    // systemKey chain instead (read-only, creates nothing) and report each level's actual name.
    const parsed = parseVideoTitle(task.title, task.client?.name ?? '')
    const levels = await resolveTaskFolderPreview({
        workspaceId,
        rootName: task.workspace?.name || 'Team',
        taskId: task.id,
        clientId: task.clientId != null ? String(task.clientId) : null,
        parsed,
    })
    const breadcrumb: { name: string; exists: boolean }[] = levels.map((l, i) => ({
        // Crumb 0 is the workspace root, which every Files surface calls "Tệp". Naming it after the
        // workspace sent the user looking for a folder that appears under a different label.
        name: i === 0 ? REVIEW_MODULE_LABEL : l.name,
        exists: l.exists,
    }))

    // Existing-asset match = same rule initiateTaskUpload uses to auto-version.
    let match = assetRows.find((a) => a.name.trim().toLowerCase() === parsed.video.trim().toLowerCase())
    // [owner request 2026-07-27] Mirror the server's single-deliverable adoption: when the task holds
    // exactly ONE video, a single upload versions THAT one whatever it is currently named — otherwise
    // renaming the task forked the stack into a second video. Requires the asset to be visible to
    // this viewer (assetRows is folder-scoped); if it is not, we simply show no preview rather than
    // reveal an out-of-scope name. The server still adopts it either way.
    let willRenameTo: string | null = null
    if (!match && assetRows.length === 1 && allAssetRows.length === 1) {
        match = assetRows[0]
        // Only report a rename when nobody has renamed it by hand — same rule the writer applies.
        const renamedByHand = await prisma.reviewActivity.count({
            where: { assetId: match.id, type: REVIEW_ACTIVITY.ASSET_RENAMED },
        })
        if (renamedByHand === 0 && match.name !== parsed.video) willRenameTo = parsed.video
    }
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
        existingAsset = { id: match.id, name: match.name, nextVersionNumber: (agg._max.versionNumber ?? 0) + 1, willRenameTo }
    }

    // Picker options. Scoped rows only (assetRows), so an editor never sees a deliverable outside
    // their assigned subtree. MAX(versionNumber) per stack, same rule as above — the head pointer
    // lags while a version is still PROCESSING, so head+1 would mispredict.
    const pickerCounts = assetRows.length
        ? await prisma.reviewVersion.groupBy({
              by: ['assetId'],
              where: { assetId: { in: assetRows.map((a) => a.id) } },
              _max: { versionNumber: true },
          })
        : []
    const maxByAsset = new Map(pickerCounts.map((r) => [r.assetId, r._max.versionNumber ?? 0]))
    const taskAssets = assetRows.map((a) => ({
        id: a.id,
        name: a.name,
        nextVersionNumber: (maxByAsset.get(a.id) ?? 0) + 1,
    }))

    // [status-audit 2026-07-23] Mirror `confirmFixDone`'s guard exactly: pick whichever of A4/A7
    // is reachable from the CURRENT status, and require assignee-or-admin. `assetRows` is already
    // folder-scoped, so an editor who cannot see any of this task's deliverables gets null and no
    // button — the server would refuse them anyway.
    const fixTarget = canAutoTransition(task.status ?? '', REVIEW_STATUS_MAP.internalFixDone)
        ? REVIEW_STATUS_MAP.internalFixDone
        : canAutoTransition(task.status ?? '', REVIEW_STATUS_MAP.clientFixDone)
          ? REVIEW_STATUS_MAP.clientFixDone
          : null
    const isAssignee = task.assigneeId != null && task.assigneeId === access.userId
    // WHICH asset carries the round matters: `confirmFixDone` resolves comments only across the
    // versions of the asset it is handed, and names that asset in the manager notification. On a
    // task with several deliverables, blindly taking the newest-created asset would flip the task
    // to A4 while leaving the ACTUAL feedback open on another one, and point the manager at the
    // wrong video. Prefer the asset that still has open feedback; fall back to the most recently
    // touched. (assetRows is ordered createdAt ASC — see the findMany above.)
    const fixAsset =
        [...assetRows].sort((a, b) => {
            const ua = openByAsset.get(a.id) ?? 0
            const ub = openByAsset.get(b.id) ?? 0
            if (ua !== ub) return ub - ua
            return b.updatedAt.getTime() - a.updatedAt.getTime()
        })[0] ?? null
    const fixConfirm: TaskFixConfirmDto | null =
        fixTarget && fixAsset && !task.isArchived && (isAssignee || access.isAdmin)
            ? { assetId: fixAsset.id, targetStatus: fixTarget, onBehalf: !isAssignee }
            : null

    return {
        workspaceId,
        assets,
        uploadContext: { breadcrumb, parsedOk: parsed.matched, existingAsset, taskAssets },
        fixConfirm,
    }
}
