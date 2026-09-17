// [Review module P1] ReviewActivity event-log writer (DATA-MODEL §4.10).
// The activity feed is the source that surfaces into the task's "Bình luận &
// hoạt động" panel + admin audit. Rows have NO foreign keys on purpose — the
// log must outlive purged assets/versions/shares.

import type { Prisma } from '@prisma/client'

/** Catalog of activity `type` strings (DATA-MODEL §4.10). String, not enum, so
 * new events can be added without a migration. Only the P1 upload set here. */
export const REVIEW_ACTIVITY = {
    VERSION_UPLOADED: 'version.uploaded', // CompleteMultipartUpload OK
    VERSION_READY: 'version.ready', // pipeline READY (image now / video webhook)
    VERSION_ERROR: 'version.error', // pipeline FAILED
    FOLDER_CREATED: 'folder.created', // user or auto (task-upload tree)
    // ── P3: version stack + status + task sync ──
    VERSION_DELETED: 'version.deleted', // soft-delete one version from a stack (FR-C02)
    VERSION_DETACHED: 'version.detached', // "Remove from stack" → new standalone asset (FR-C03)
    STACK_MERGED: 'stack.merged', // drag asset onto asset → merged as newest version (FR-C01 path 2)
    STATUS_CHANGED: 'asset.status_changed', // member set the card status (FR-D01/D02; meta {old,new})
    TASK_COMPLETED_FROM_ASSET: 'task.completed_from_asset', // confirmTaskHoanTat (FR-D02/A05)
    // ── P3-B: staff auto-transitions on the video lifecycle (F8/F9/F10; meta {from,to}) ──
    TASK_FEEDBACK_CLOSED: 'task.feedback_closed', // F8 — admin closed the feedback session → A3
    TASK_FIX_CONFIRMED: 'task.fix_confirmed', // F9 — editor confirmed the fix → A4 (internal) / A7 (client)
    TASK_SENT_TO_CLIENT: 'task.sent_to_client', // F10 — admin approved & sent to client → A5
    // ── P4: player comments (FR-E03–E08) ──
    COMMENT_CREATED: 'comment.created', // new comment/reply on a version (meta {timecodeMs, isInternal, parentId})
    COMMENT_RESOLVED: 'comment.resolved', // Mark as Complete
    COMMENT_REOPENED: 'comment.reopened', // un-resolve
    // ── P5: share links + guest review (FR-F01/F06, DATA-MODEL §4.10) ──
    SHARE_CREATED: 'share.created', // member created a link (meta {slug})
    SHARE_REVOKED: 'share.revoked', // kill-switch on (meta {slug})
    SHARE_UNREVOKED: 'share.unrevoked', // kill-switch back off [S]
    SHARE_LINK_OPENED: 'share.link_opened', // guest opened /r/{slug} (throttled 30min/session)
    SHARE_ASSET_VIEWED: 'share.asset_viewed', // guest started playback (meta {versionNumber})
    SHARE_DOWNLOADED: 'share.downloaded', // guest downloaded the original (meta {versionNumber})
    REVIEW_APPROVED: 'review.approved', // guest decision (meta {versionNumber}) — P5.4
    REVIEW_CHANGES_REQUESTED: 'review.changes_requested', // guest decision (meta {versionNumber}) — P5.4
    // ── P6: trash purge (FR-B13) ──
    TRASH_PURGED: 'trash.purged', // 30-day auto-purge OR manual Delete-forever (meta {kind, itemName, deleteBatchId})
    // ── foldering 2026-07-27: a HUMAN renamed a deliverable (meta {old, new}) ──
    // Renames left no trace at all before this, which was already a gap in a module that logs
    // everything else. It is also load-bearing now: the task-upload path keeps a single-deliverable
    // asset's name in sync with its task title, and must NOT overwrite a name someone chose by hand.
    // The presence of this row is what tells the two apart — ReviewAsset.rowVersion cannot, since
    // moves, status changes and the Mux webhook all bump it too.
    ASSET_RENAMED: 'asset.renamed',
    /** "Reset về tên Task" — hands the name back to automatic sync (meta {old, new}). The gate is
     *  RECENCY, not presence: the name is auto-managed when the newest reset is newer than the
     *  newest manual rename. That way a reset restores sync without deleting history. */
    ASSET_NAME_RESET: 'asset.name_reset',
} as const

export type ReviewActivityType = (typeof REVIEW_ACTIVITY)[keyof typeof REVIEW_ACTIVITY]

export interface RecordActivityInput {
    type: ReviewActivityType | string
    workspaceId: string
    taskId?: string | null
    folderId?: string | null
    assetId?: string | null
    versionId?: string | null
    commentId?: string | null
    shareLinkId?: string | null
    actorUserId?: string | null
    guestSessionId?: string | null
    guestName?: string | null
    meta?: Prisma.InputJsonValue
}

/**
 * Append one ReviewActivity row. Pass a transaction client (`tx`) when the
 * activity must be atomic with the state change that produced it (e.g. the
 * version.uploaded row committed together with the pipeline transition).
 */
export async function recordActivity(
    db: Prisma.TransactionClient,
    input: RecordActivityInput,
): Promise<void> {
    await db.reviewActivity.create({
        data: {
            type: input.type,
            workspaceId: input.workspaceId,
            taskId: input.taskId ?? null,
            folderId: input.folderId ?? null,
            assetId: input.assetId ?? null,
            versionId: input.versionId ?? null,
            commentId: input.commentId ?? null,
            shareLinkId: input.shareLinkId ?? null,
            actorUserId: input.actorUserId ?? null,
            guestSessionId: input.guestSessionId ?? null,
            guestName: input.guestName ?? null,
            ...(input.meta !== undefined ? { meta: input.meta } : {}),
        },
    })
}
