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
