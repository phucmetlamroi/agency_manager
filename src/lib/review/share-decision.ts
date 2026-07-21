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
import { type ShareWithItems } from './share-auth'
import { notifyReview, resolveTaskRecipients, reviewPlayerUrl } from './notify'
import { isValidStatus, isTerminalStatus, SALARY_COMPLETED_STATUS } from '@/lib/task-statuses'
import { isClientFacingPhase } from '@/lib/portal-derive'
// [video-fix ③④⑤] Run the task-side effects SYNCHRONOUSLY (below) instead of relying only on the
// async Inngest fn, so the editor/manager notify + the A5→A6 status advance can't be silently dropped.
import { syncTaskOnChangesRequested } from './task-sync'
import { notifyGuestsOfAsset } from './guest-notify'
import { subscribeGuestOnDecision } from './guest-subscribe'

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

/** Persist a Request-changes note as a PUBLIC, timecode-less comment (FR-F03 AC2).
 *  Its own small tx so it survives even when the state flip is a no-op / lost race —
 *  the note is NEW content the team must never lose, independent of the flip. */
async function persistDecisionNote(
    share: ShareWithItems,
    guest: GuestSession,
    version: { id: string; versionNumber: number },
    asset: { id: string; workspaceId: string; taskId: string | null },
    note: string,
    signerName: string,
    signerEmail: string,
    // [AUDIT M4] Fire the staff notify from callers where the decision's own inngest event does NOT run
    // (the idempotent repeat / race-lost branches) — otherwise a 2nd "request changes" with a fresh note
    // is silently dropped into the feed and staff never hear about the extra feedback.
    notifyStaff: boolean,
): Promise<void> {
    // [AUDIT M2] When the agency has FROZEN comments (allowComments=false) the change-request note must
    // NOT appear as a new PUBLIC comment (that bypasses the freeze) — record it staff-INTERNAL instead,
    // so the change reason still reaches the team without re-opening the public thread.
    const isInternal = !share.allowComments
    const noteCommentId = randomUUID()
    await prisma.$transaction(async (tx) => {
        await tx.reviewComment.create({
            data: {
                id: noteCommentId,
                versionId: version.id,
                body: note,
                isInternal,
                authorId: null,
                guestSessionId: guest.id,
                guestName: signerName,
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
            guestName: signerName,
            meta: { timecodeMs: null, isInternal, isReply: false, excerpt: note.slice(0, 120), signerEmail },
        })
    })

    if (notifyStaff && asset.taskId) {
        // Fire-and-forget: the note is durable regardless of whether the notify lands.
        void (async () => {
            try {
                const rcpt = await resolveTaskRecipients(asset.taskId)
                await notifyReview({
                    recipientIds: [rcpt.assigneeId, ...rcpt.adminUserIds],
                    type: 'VIDEO_COMMENT_NEW',
                    title: `${signerName} đã gửi thêm yêu cầu chỉnh sửa (v${version.versionNumber})`,
                    body: note.slice(0, 140),
                    taskId: asset.taskId,
                    deepLinkUrl: reviewPlayerUrl({
                        workspaceId: asset.workspaceId,
                        assetId: asset.id,
                        versionId: version.id,
                        commentId: noteCommentId,
                    }),
                })
            } catch (e) {
                reviewLog('error', 'share.decision.note_notify_failed', { assetId: asset.id, error: String(e) })
            }
        })()
    }
}

export async function submitGuestDecision(
    share: ShareWithItems,
    guest: GuestSession,
    input: GuestDecisionInput,
): Promise<{ reviewState: ReviewStateDto; message: string }> {
    const { version, asset } = await assertVersionInShare(share, input.versionId)

    // [AUDIT H1] A decision (approve / request changes) is a client SIGN-OFF; accept it ONLY on a
    // share an admin actually opened to the client. A bare asset or Team share has no task at all,
    // so it can be viewed & commented on but never decided.
    if (!asset.taskId) {
        throw apiError(403, 'DECISIONS_DISABLED', 'This link is not open for approval.')
    }
    const decisionTask = await prisma.task.findFirst({
        where: { id: asset.taskId, workspaceId: asset.workspaceId },
        select: { clientReview: true, status: true, isArchived: true },
    })
    if (!decisionTask) {
        throw apiError(403, 'DECISIONS_DISABLED', 'This link is not open for approval.')
    }
    // [Owner bug video 2026-07-21 @01:02] This gate used to demand `clientReview != null`, i.e. the
    // F10 admin "Duyệt & gửi khách" bridge must have run. The CLIENT PORTAL never agreed with that:
    // share-portal-actions.ts surfaces a live /r/ board — and synthesizes `effClientReview =
    // task.clientReview ?? 'AWAITING'` for the badge — on the BROADER `isClientFacingPhase` test
    // (clientReview set, OR the status string contains "khách"). So a task an admin moved into a
    // client status by hand, without going through F10, showed the client "Awaiting your review",
    // opened the screening room, offered an enabled Approve button — and then the server refused it
    // with "This review is not open for approval yet." The UI and the gate were reading two different
    // fields. The owner reproduced exactly that on video.
    //
    // Align the gate with the predicate that already decides whether the client may SEE the cut at
    // all. That grants no new exposure: `isClientFacingPhase` is the same R5 gate that mints the
    // board, so anything decidable here was already watchable. Every internal "(nội bộ)" step still
    // fails it, so an unapproved internal cut is still undecidable — and unviewable.
    // CANCELLED only. Deliberately NOT every terminal status: 'Hoàn tất' must keep accepting a
    // decision, because it already did before this change (a completed task has clientReview set,
    // so the old gate passed) and because refusing would SILENTLY DROP a late client "request
    // changes" — the note, the comment and the staff notification all hang off this call. Payroll
    // is not at risk from allowing it: the terminal guard that matters lives downstream in
    // syncTaskFromReviewEvent (E1/J1), which refuses to move a completed task's STATUS. What must
    // be refused here is the tombstone — a cancelled/archived job is not live work to sign off.
    const cancelled = isTerminalStatus(decisionTask.status) && decisionTask.status !== SALARY_COMPLETED_STATUS
    if (decisionTask.isArchived || cancelled) {
        throw apiError(403, 'DECISIONS_DISABLED', 'This project is closed. Please contact your producer.')
    }
    if (!isClientFacingPhase(decisionTask.status, decisionTask.clientReview)) {
        throw apiError(403, 'DECISIONS_DISABLED', 'This review is not open for approval yet.')
    }

    // [Owner decision 2026-07-15] Approval is a lightweight sign-off: anyone the client gave the link to
    // may approve / request changes after adding a name + email — NO email PIN. The owner explicitly
    // waived impersonation protection here ("mạo danh không quan trọng"), so a self-declared identity is
    // accepted. This does NOT touch payroll: an editor still cannot move their OWN task to Hoàn tất — that
    // stays admin-only (H3, task-actions.ts). Gate 1 above still limits decisions to shares an admin
    // actually sent into the client-review flow. Attribution = the reviewer's self-declared name + email.
    const signerName = guest.name
    const signerEmail = guest.email

    if (version.pipelineStatus !== ReviewPipelineStatus.READY) {
        throw apiError(409, 'STATE_INVALID', 'This version is still processing — check back in a few minutes.')
    }
    const target = TARGET[input.decision]
    const note = input.decision === 'request_changes' ? (input.note ?? '').trim() : ''

    // A decision only drives the ASSET card status + TASK sync when it's on the CURRENT
    // head version. With showAllVersions=true a guest can decide on an OLD version; that
    // must stay version-level (flip its reviewState + record) and never rewrite the
    // asset's status or complete/revert the task from an obsolete cut. (showAllVersions=
    // false already 404s non-head decisions in assertVersionInShare.)
    const isHead = asset.currentVersionId === version.id

    // Idempotent repeat (double-click / retry). The note, if any, is STILL new content
    // → persist it even though the state flip is a no-op (else the second "Request
    // changes" note is silently lost while the UI toasts success).
    if (version.reviewState === target) {
        if (note) await persistDecisionNote(share, guest, version, asset, note, signerName, signerEmail, true)
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

    const flipped = await prisma.$transaction(async (tx) => {
        // Optimistic guard on the observed state — a concurrent decision/upload
        // loses the race cleanly instead of double-writing.
        const flip = await tx.reviewVersion.updateMany({
            where: { id: version.id, reviewState: version.reviewState },
            data: { reviewState: target },
        })
        if (flip.count === 0) return false

        if (statusOk && isHead) {
            await tx.reviewAsset.update({
                where: { id: asset.id },
                data: { statusId: mappedStatus, rowVersion: { increment: 1 } },
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
            guestName: signerName,
            meta: { versionNumber: version.versionNumber, decision: input.decision, old: reviewStateToDto(version.reviewState), isHead, signerEmail },
        })
        return true
    })

    if (!flipped) {
        // Re-read: if a concurrent request already landed the SAME target, that's still
        // success for this guest — but the note is new content, so persist it too.
        const now = await prisma.reviewVersion.findUnique({ where: { id: version.id }, select: { reviewState: true } })
        if (now?.reviewState === target) {
            if (note) await persistDecisionNote(share, guest, version, asset, note, signerName, signerEmail, true)
            return { reviewState: reviewStateToDto(target), message: MESSAGE[input.decision] }
        }
        throw apiError(409, 'STATE_INVALID', 'This version just changed — the page will refresh.')
    }

    // The flip committed → the note is durable content; persist it now (own tx) so a
    // later inngest.send failure can't take it down with the 500. notifyStaff:false here — the
    // DECISION_RECORDED inngest event below already notifies staff of this (real) change request.
    if (note) await persistDecisionNote(share, guest, version, asset, note, signerName, signerEmail, false)

    reviewLog('info', 'share.decision', { shareId: share.id, versionId: version.id, decision: input.decision, isHead })

    // Task-side effects (auto Revision, feed audit, notifications) only for a HEAD
    // decision — an old-version decision has no task meaning. The decision is ALREADY
    // committed; if the event send fails the guest should still see success (the async
    // side-effects can be reconciled — see IMPLEMENTATION-NOTES residual risk), not a
    // 500 that hides a committed decision.
    if (isHead) {
        // [video-fix ③④⑤] The owner's QA video showed that on a client "Request changes" the EDITOR
        // got NO email and the task status did NOT advance to A6 ('Đã nhận feedback (khách)'). Both of
        // those effects previously lived ONLY inside the async Inngest fn (reviewShareDecision) — so if
        // that fn never ran, both were silently lost while the comment (written above, synchronously)
        // still showed up. Do the CRITICAL effects here, in the request that definitely runs. The
        // decision is ALREADY committed, so a failure must never 500 the guest → whole block is caught.
        try {
            // (a) Register the sign-off email as a notification recipient, so the ack below + the
            //     later A7 "revised" email reach the address the client actually typed on /r/.
            await subscribeGuestOnDecision({
                email: signerEmail,
                assetId: asset.id,
                shareLinkId: share.id,
                guestSessionId: guest.id,
                ip: null,
            })

            // (b) Advance the task: request_changes → A6 (or legacy 'Revision'); approve → settle the
            //     client-review signal so the portal stops nagging "Awaiting your review".
            let syncApplied = false
            let syncTarget: string | undefined
            if (input.decision === 'request_changes') {
                const res = await syncTaskOnChangesRequested(asset.taskId, asset.workspaceId).catch(() => null)
                syncApplied = !!res?.applied
                syncTarget = res?.to
            } else {
                await prisma.task
                    .updateMany({
                        where: {
                            id: asset.taskId,
                            workspaceId: asset.workspaceId,
                            // NULL belongs here. The gate above now admits a task the admin put into a
                            // client status by hand, whose clientReview was never set by the F10 bridge.
                            // Without the null branch the approval would land on the version but never on
                            // the task, and the portal — which synthesizes AWAITING whenever a board is
                            // live and clientReview is null — would nag "Awaiting your review" forever,
                            // with the client's own approval already recorded. `in: [null, …]` is NOT a
                            // legal Prisma filter for a nullable column, hence the explicit OR.
                            OR: [{ clientReview: null }, { clientReview: { in: ['AWAITING', 'CHANGES'] } }],
                        },
                        data: { clientReview: 'APPROVED', clientReviewedAt: new Date() },
                    })
                    .catch(() => {})
            }

            // (c) Notify the EDITOR (assignee) + the MANAGER (assignedById) — owner requirement #3.
            const t = await prisma.task.findUnique({
                where: { id: asset.taskId },
                select: { title: true, assigneeId: true, assignedById: true },
            })
            const who = signerName || 'Khách'
            const deepLinkUrl = reviewPlayerUrl({ workspaceId: asset.workspaceId, assetId: asset.id, versionId: version.id })
            if (input.decision === 'request_changes') {
                await notifyReview({
                    recipientIds: [t?.assigneeId, t?.assignedById],
                    type: 'VIDEO_CHANGES_REQUESTED',
                    title: `${who} yêu cầu chỉnh sửa bản v${version.versionNumber}`,
                    body: syncApplied
                        ? `Task "${t?.title ?? ''}" đã tự chuyển sang "${syncTarget ?? REVIEW_STATUS_MAP.changesRequested}".`
                        : `Task "${t?.title ?? ''}" — khách yêu cầu chỉnh sửa, kiểm tra trạng thái task.`,
                    taskId: asset.taskId,
                    deepLinkUrl,
                    meta: { guestName: signerName, versionNumber: version.versionNumber },
                })
                // (d) Acknowledge the client — "we've received your feedback".
                void notifyGuestsOfAsset({ assetId: asset.id, event: 'feedback_received' }).catch(() => {})
            } else {
                await notifyReview({
                    recipientIds: [t?.assigneeId, t?.assignedById],
                    type: 'VIDEO_REVIEW_APPROVED',
                    title: `${who} đã duyệt bản v${version.versionNumber}`,
                    body: `Task "${t?.title ?? ''}" — mở chi tiết task để xác nhận chuyển Hoàn tất.`,
                    taskId: asset.taskId,
                    deepLinkUrl,
                    meta: { guestName: signerName, versionNumber: version.versionNumber },
                })
                void notifyGuestsOfAsset({ assetId: asset.id, event: 'approved' }).catch(() => {})
            }
        } catch (e) {
            reviewLog('error', 'share.decision.sync_effects_failed', {
                shareId: share.id,
                versionId: version.id,
                decision: input.decision,
                error: e instanceof Error ? e.message : String(e),
            })
        }

        // Inngest remains as an IDEMPOTENT backup: it re-runs the status sync (a no-op once the
        // synchronous path above already advanced it) and writes the task-activity feed row. Its
        // staff/client notifications were REMOVED (now done synchronously above) to avoid double-send.
        try {
            await inngest.send({
                name: REVIEW_EVENTS.DECISION_RECORDED,
                data: {
                    versionId: version.id,
                    assetId: asset.id,
                    taskId: asset.taskId,
                    workspaceId: asset.workspaceId,
                    shareLinkId: share.id,
                    decision: input.decision,
                    guestName: signerName,
                    versionNumber: version.versionNumber,
                },
            })
        } catch (e) {
            reviewLog('error', 'share.decision.event_send_failed', {
                shareId: share.id,
                versionId: version.id,
                decision: input.decision,
                error: e instanceof Error ? e.message : String(e),
            })
        }
    }
    return { reviewState: reviewStateToDto(target), message: MESSAGE[input.decision] }
}
