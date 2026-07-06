// [Review module P5.4] Guest decision service (API-SPEC §5.5.6, FR-F03/FR-D02).
// The synchronous half runs in ONE transaction: reviewState flip + asset card
// status per REVIEW_STATUS_MAP + activity + (optional) note→public comment.
// Task-side effects (auto "Revision", audit feed rows, notifications) are
// ASYNC via Inngest `review/decision.recorded` — the route stays fast.
//
// State machine: the PRD (higher authority than KIEN-TRUC's sketch) lets the
// guest flip their decision — latest wins, every flip recorded. So from a READY
// version: AWAITING_REVIEW → either; APPROVED ⇄ CHANGES_REQUESTED. Repeating
// the current decision is a 200 no-op (double-click safe). DRAFT/processing → 409.

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { Prisma, ReviewPipelineStatus, ReviewState, type GuestSession } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiError } from './errors'
import { reviewLog } from './logger'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { reviewStateToDto, type ReviewStateDto } from './dto'
import { assertVersionInShare } from './share-guest'
import { REVIEW_STATUS_MAP } from './status-map'
import { inngest, REVIEW_EVENTS } from './inngest'
import type { ShareWithItems } from './share-auth'
import { isValidStatus } from '@/lib/task-statuses'

const MAX_NOTE = 2000

export const guestDecisionSchema = z
    .object({
        versionId: z.string().min(1),
        decision: z.enum(['approve', 'request_changes']),
        note: z.string().max(MAX_NOTE).optional(),
    })
    .strict()
export type GuestDecisionInput = z.infer<typeof guestDecisionSchema>

const TARGET: Record<GuestDecisionInput['decision'], ReviewState> = {
    approve: ReviewState.APPROVED,
    request_changes: ReviewState.CHANGES_REQUESTED,
}
const MESSAGE: Record<GuestDecisionInput['decision'], string> = {
    approve: 'Thanks! Your approval has been recorded.',
    request_changes: 'Change request sent to the team.',
}

export async function submitGuestDecision(
    share: ShareWithItems,
    guest: GuestSession,
    input: GuestDecisionInput,
): Promise<{ reviewState: ReviewStateDto; message: string }> {
    const { version, asset } = await assertVersionInShare(share, input.versionId)
    if (version.pipelineStatus !== ReviewPipelineStatus.READY) {
        throw apiError(409, 'STATE_INVALID', 'This version is still processing — check back in a few minutes.')
    }
    const target = TARGET[input.decision]

    // Idempotent repeat (double-click, retried request).
    if (version.reviewState === target) {
        return { reviewState: reviewStateToDto(target), message: MESSAGE[input.decision] }
    }
    if (version.reviewState === ReviewState.DRAFT) {
        throw apiError(409, 'STATE_INVALID', 'This version is not open for review yet.')
    }

    // Card status per FR-D02 mapping; a broken mapping skips the status write
    // (state machine still records) instead of failing the guest.
    const mappedStatus = input.decision === 'approve' ? REVIEW_STATUS_MAP.approved : REVIEW_STATUS_MAP.changesRequested
    const statusOk = isValidStatus(mappedStatus)
    if (!statusOk) {
        reviewLog('error', 'share.decision.bad_status_map', { decision: input.decision, mappedStatus })
    }

    const note = input.decision === 'request_changes' ? (input.note ?? '').trim() : ''
    const noteCommentId = note ? randomUUID() : null

    const flipped = await prisma.$transaction(async (tx) => {
        // Optimistic guard on the observed state — a concurrent decision/upload
        // loses the race cleanly instead of double-writing.
        const flip = await tx.reviewVersion.updateMany({
            where: { id: version.id, reviewState: version.reviewState },
            data: { reviewState: target },
        })
        if (flip.count === 0) return false

        if (statusOk) {
            await tx.reviewAsset.update({
                where: { id: asset.id },
                data: { statusId: mappedStatus, rowVersion: { increment: 1 } },
            })
        }

        // "Summary of changes" → one PUBLIC comment without a timecode (FR-F03 AC2).
        if (noteCommentId) {
            await tx.reviewComment.create({
                data: {
                    id: noteCommentId,
                    versionId: version.id,
                    body: note,
                    isInternal: false,
                    authorId: null,
                    guestSessionId: guest.id,
                    guestName: guest.name,
                    shareLinkId: share.id,
                },
            })
            await tx.reviewVersion.update({ where: { id: version.id }, data: { commentCount: { increment: 1 } } })
            await recordActivity(tx, {
                type: REVIEW_ACTIVITY.COMMENT_CREATED,
                workspaceId: asset.workspaceId,
                taskId: asset.taskId,
                assetId: asset.id,
                versionId: version.id,
                commentId: noteCommentId,
                shareLinkId: share.id,
                guestSessionId: guest.id,
                guestName: guest.name,
                meta: { timecodeMs: null, isInternal: false, isReply: false, excerpt: note.slice(0, 120) },
            })
        }

        await recordActivity(tx, {
            type:
                input.decision === 'approve'
                    ? REVIEW_ACTIVITY.REVIEW_APPROVED
                    : REVIEW_ACTIVITY.REVIEW_CHANGES_REQUESTED,
            workspaceId: asset.workspaceId,
            taskId: asset.taskId,
            assetId: asset.id,
            versionId: version.id,
            shareLinkId: share.id,
            guestSessionId: guest.id,
            guestName: guest.name,
            meta: { versionNumber: version.versionNumber, decision: input.decision, old: reviewStateToDto(version.reviewState) },
        })
        return true
    })

    if (!flipped) {
        // Re-read: if a concurrent request already landed the SAME target, that's
        // still success for this guest; anything else = genuinely stale view.
        const now = await prisma.reviewVersion.findUnique({ where: { id: version.id }, select: { reviewState: true } })
        if (now?.reviewState === target) {
            return { reviewState: reviewStateToDto(target), message: MESSAGE[input.decision] }
        }
        throw apiError(409, 'STATE_INVALID', 'This version just changed — the page will refresh.')
    }

    reviewLog('info', 'share.decision', {
        shareId: share.id,
        versionId: version.id,
        decision: input.decision,
    })
    await inngest.send({
        name: REVIEW_EVENTS.DECISION_RECORDED,
        data: {
            versionId: version.id,
            assetId: asset.id,
            taskId: asset.taskId,
            workspaceId: asset.workspaceId,
            shareLinkId: share.id,
            decision: input.decision,
            guestName: guest.name,
            versionNumber: version.versionNumber,
        },
    })
    return { reviewState: reviewStateToDto(target), message: MESSAGE[input.decision] }
}
