// [Review module P3.3] Manual task sync (FR-D02 / FR-A05 semi-auto approve). When a
// member has set a task's review asset to the approved-mapped status, the task drawer
// shows a banner; confirming here flips the TASK status to the mapped value.
//
// The actual task mutation is DELEGATED to the app's updateTaskStatus service, which
// owns the RBAC (workspace-admin OR the task's assignee), the status FSM, and optimistic
// locking — we do not re-implement any of that (and thus can't drift from it). This layer
// only adds the review-side guard (an approved asset must exist) + the audit activity.
// No finance fields are read from the task.

import { prisma } from '@/lib/db'
import { requireReviewAccess } from './access'
import { apiError } from './errors'
import { recordActivity, REVIEW_ACTIVITY, type RecordActivityInput } from './activity'
import { REVIEW_STATUS_MAP } from './status-map'
import { updateTaskStatus } from '@/actions/task-actions'
import { reviewLog } from './logger'
import { isValidStatus, canAutoTransition, STATUS_TRANSITIONS, isTerminalStatus, clientVisibleLabel } from '@/lib/task-statuses'
import { STATUS_REQUIRES_NULL_DEADLINE } from '@/lib/task-invariants'
import { notifyManagerOfReviewFlip } from './notify'
// [P4/BR-05 bridge] portal link-up + guest E1 — imported lazily-safe (all server libs).
import { getOrCreatePrimaryShareForAsset } from './shares'
import { notifyGuestsOfAsset } from './guest-notify'
import { guestAppBaseUrl } from './guest-emails/wrap'

export async function confirmTaskHoanTat(taskId: string): Promise<{ ok: true; taskId: string; status: string }> {
    // Guard: at least one LIVE review asset for this task must be at the approved status.
    const asset = await prisma.reviewAsset.findFirst({
        where: { taskId, deletedAt: null, statusId: REVIEW_STATUS_MAP.approved },
        select: { id: true, workspaceId: true },
    })
    if (!asset) {
        throw apiError(409, 'STATE_INVALID', 'Chưa có bản dựng nào ở trạng thái duyệt cho task này.', { reason: 'not_approved' })
    }
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })

    // Delegate the task write. updateTaskStatus re-checks admin/assignee + the FSM and
    // returns { error } (user-facing VN) on any refusal — surface it verbatim.
    const res = await updateTaskStatus(taskId, REVIEW_STATUS_MAP.approved, asset.workspaceId)
    if (res && typeof res === 'object' && 'error' in res && res.error) {
        const msg = String(res.error)
        const forbidden = /forbidden|quyền/i.test(msg)
        throw apiError(forbidden ? 403 : 409, forbidden ? 'FORBIDDEN' : 'STATE_INVALID', msg)
    }

    const clientExposed = await prisma.$transaction(async (tx) => {
        // [P4/R3] Settle the portal VIEW: a task completed out of the client-review phase must not
        // stay stuck on Task.clientReview='AWAITING' (→ deriveClientStatus "Awaiting your review" +
        // needsYou=true forever). Only settle tasks that were actually in the client flow
        // (clientReview not null); a purely-internal completion keeps clientReview null.
        const res = await tx.task.updateMany({
            where: { id: taskId, workspaceId: asset.workspaceId, clientReview: { not: null } },
            data: { clientReview: 'APPROVED', clientReviewedAt: new Date() },
        })
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.TASK_COMPLETED_FROM_ASSET,
            workspaceId: asset.workspaceId,
            taskId,
            assetId: asset.id,
            actorUserId: access.userId,
            meta: { status: REVIEW_STATUS_MAP.approved },
        })
        return res.count > 0
    })
    // [Q1] status_update email (T4) — wired end-to-end but NO producer ever fired it. When a
    // CLIENT-exposed task is completed, tell the client's /r/ subscribers + portal notify email that
    // the deliverable reached its terminal client-visible label ("Completed"). Gated on client-exposure
    // (res.count>0) so a purely-internal completion never emails the client. Fire-and-forget.
    if (clientExposed) {
        const label = clientVisibleLabel(REVIEW_STATUS_MAP.approved)
        if (label) void notifyGuestsOfAsset({ assetId: asset.id, event: 'status_update', statusLabel: label }).catch(() => {})
    }
    return { ok: true, taskId, status: REVIEW_STATUS_MAP.approved }
}

/**
 * [P3-B / F7 + guest] Generalized auto-transition writer for the paths that have NO
 * session (Inngest webhook, guest decision) and therefore CANNOT use `updateTaskStatus`.
 * A direct scoped write that replicates exactly what that service does for a plain status
 * change: status + deadline-null invariant (STATUS_REQUIRES_NULL_DEADLINE) + optimistic
 * `version` increment. No assignee reset / archive — those only apply to other targets.
 *
 * Guard (STATUS-MACHINE §3.2, R6): when `target` is a video-lifecycle status (i.e. it is a
 * key of STATUS_TRANSITIONS), the flip is applied ONLY when the CURRENT status is an allowed
 * predecessor — so a late Mux webhook can't drag an already-approved task back a step. For a
 * legacy target NOT in STATUS_TRANSITIONS (e.g. 'Revision'), there is no predecessor guard —
 * that path keeps its historical "flip from anywhere" behavior (K6). Cancelled/archived tasks
 * are never touched (finding P5-R#15). Returns `to` = the value actually written.
 */
export async function syncTaskFromReviewEvent(
    taskId: string,
    workspaceId: string,
    target: string,
    opts: { preserveDeadline?: boolean } = {},
): Promise<{ applied: boolean; from?: string; to?: string }> {
    if (!isValidStatus(target)) {
        // Mapping points at a status this app no longer has — record-only fallback (FR-D02).
        reviewLog('error', 'task_sync.bad_status_map', { taskId, target })
        return { applied: false }
    }
    const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true, status: true, isArchived: true },
    })
    if (!task) {
        reviewLog('warn', 'task_sync.task_missing', { taskId, workspaceId })
        return { applied: false }
    }
    if (task.isArchived || isTerminalStatus(task.status)) {
        // [E1/J1] Terminal = 'Hoàn tất' (completed, already paid) OR 'Đã hủy' (cancelled). A review
        // event — e.g. a guest firing "request changes" on a still-live /r/ link AFTER the admin
        // completed the task — must NOT silently re-open it (which would flip payroll back to pending
        // and leave clientReview stuck APPROVED). Only an explicit manual staff status change re-opens.
        reviewLog('info', 'task_sync.skipped_terminal', { taskId, from: task.status })
        return { applied: false, from: task.status }
    }
    if (task.status === target) return { applied: false, from: task.status, to: target } // already there
    // Predecessor guard — ONLY for video-lifecycle targets (keys of STATUS_TRANSITIONS).
    if (target in STATUS_TRANSITIONS && !canAutoTransition(task.status, target)) {
        reviewLog('info', 'task_sync.predecessor_guard_skip', { taskId, from: task.status, to: target })
        return { applied: false, from: task.status }
    }
    const res = await prisma.task.updateMany({
        where: { id: taskId, workspaceId, status: task.status, isArchived: false }, // lose races cleanly
        data: {
            status: target,
            version: { increment: 1 },
            // [AUDIT L2] `opts.preserveDeadline` keeps the existing deadline even for a
            // STATUS_REQUIRES_NULL_DEADLINE target — used by the guest-triggered legacy 'Revision'
            // fallback so a guest can't wipe a task's overdue-tracking deadline from the /r/ link.
            ...(!opts.preserveDeadline &&
            STATUS_REQUIRES_NULL_DEADLINE.includes(target as (typeof STATUS_REQUIRES_NULL_DEADLINE)[number])
                ? { deadline: null }
                : {}),
        },
    })
    if (res.count === 0) {
        reviewLog('warn', 'task_sync.race_lost', { taskId, from: task.status })
        return { applied: false, from: task.status }
    }
    reviewLog('info', 'task_sync.event_flip', { taskId, from: task.status, to: target })
    return { applied: true, from: task.status, to: target }
}

/**
 * [P5.4 + P3-B/F10-A6] Guest "Request changes" → task AUTO-flips (Inngest, no session).
 *
 * Conditional retarget (STATUS-MACHINE §3.6, K6): a change requested on a task that was
 * SENT to the client (current === A5 'Đã gửi video (khách)') advances the CLIENT-review
 * lifecycle to A6 ('Đã nhận feedback (khách)'); any other current status keeps the legacy
 * internal-reject target 'Revision' so the guest-rejected task stays in the "Sửa lại" tab
 * and payroll includes. `clientChangesRequested` (A6) is reachable ONLY from A5 via
 * STATUS_TRANSITIONS, so canAutoTransition IS the A5 test.
 *
 * ⚠️ already-A6 guard: if the task is ALREADY at A6, canAutoTransition(A6,A6)=false would
 * pick 'Revision' and the generic writer would DEMOTE A6→'Revision'. Short-circuit first.
 */
export async function syncTaskOnChangesRequested(
    taskId: string,
    workspaceId: string,
): Promise<{ applied: boolean; from?: string; to?: string }> {
    const client = REVIEW_STATUS_MAP.clientChangesRequested
    const legacy = REVIEW_STATUS_MAP.changesRequested
    const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { status: true, isArchived: true },
    })
    if (!task) {
        reviewLog('warn', 'task_sync.task_missing', { taskId, workspaceId })
        return { applied: false }
    }
    // Already INSIDE the post-send client-review lifecycle — A6 (awaiting the client-fix) OR
    // A7 (editor fixed, awaiting admin re-send). A repeat guest "request changes" here is a
    // no-op, NOT a demotion back to 'Revision': A6/A7 are NOT predecessors of A6 (only A5 is),
    // so without this guard canAutoTransition would fall through to legacy 'Revision' and DROP
    // the task out of the client-review phase (regressing the editor's confirmed fix + nulling
    // the deadline). The guest's new note is still captured as a comment by the decision route.
    if (task.status === client || task.status === REVIEW_STATUS_MAP.clientFixDone) {
        return { applied: false, from: task.status, to: task.status }
    }
    // [AUDIT L2] The legacy 'Revision' target is the "flip from anywhere" fallback (K6); when a GUEST
    // triggers it, keep the deadline so they can't wipe overdue-tracking. The proper client-review
    // transition (A5→A6) is unaffected.
    const usingLegacy = !canAutoTransition(task.status, client)
    const target = usingLegacy ? legacy : client
    const result = await syncTaskFromReviewEvent(taskId, workspaceId, target, { preserveDeadline: usingLegacy })
    // [P4/R3] Reflect the guest's decision on the portal VIEW so it doesn't stay stuck on "Awaiting
    // your review". Only when we actually entered the CLIENT-review round (A6); the legacy internal
    // 'Revision' target is not a client-facing decision. Best-effort (the flip already committed).
    if (result.applied && target === client) {
        await prisma.task
            .updateMany({ where: { id: taskId, workspaceId }, data: { clientReview: 'CHANGES', clientReviewedAt: new Date() } })
            .catch((e) => reviewLog('error', 'task_sync.client_review_write_failed', { taskId, error: String(e) }))
    }
    return result
}

// ─────────────────────── [P3-B] Staff auto-transition actions (F8 / F9 / F10) ───────────────
// These run inside /api/review/* route handlers → a staff SESSION exists, so unlike the
// Inngest/guest paths they DELEGATE the task write to `updateTaskStatus` (reuses its
// workspace-admin-OR-assignee RBAC + optimistic lock + StatusHistory + revalidatePath).
// They add: (1) the review-side access guard, (2) a role check tighter than updateTaskStatus's
// (F8/F10 admin-only; F9 admin-or-assignee), (3) the predecessor guard (canAutoTransition —
// updateTaskStatus does NOT enforce the FSM, R10). The editor's status-change email/in-app is
// emitted by updateTaskStatus's generic notifyTaskStatusChanged; the MANAGER-directed notify
// (F9, whose actor === assignee → generic self-skips) is added explicitly.

/** Resolve the LIVE asset + its task context, or throw the standard review error envelope. */
async function loadAssetTaskContext(assetId: string): Promise<{
    asset: { id: string; workspaceId: string; taskId: string }
    access: Awaited<ReturnType<typeof requireReviewAccess>>
    task: { status: string; assigneeId: string | null; version: number; isArchived: boolean }
}> {
    const asset = await prisma.reviewAsset.findFirst({
        where: { id: assetId, deletedAt: null },
        select: { id: true, workspaceId: true, taskId: true },
    })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy bản dựng.')
    if (!asset.taskId) throw apiError(409, 'STATE_INVALID', 'Bản dựng này chưa gắn với task nào.', { reason: 'no_task' })
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })
    const task = await prisma.task.findFirst({
        where: { id: asset.taskId, workspaceId: asset.workspaceId },
        select: { status: true, assigneeId: true, version: true, isArchived: true },
    })
    if (!task) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy task của bản dựng.')
    // [status-audit 2026-07-23] Refuse an ARCHIVED (cancelled) task. The event-driven writer
    // syncTaskFromReviewEvent has always refused these, but the three session-path actions that
    // share this loader (F8 / F9 / F10) did not — and neither does the updateTaskStatus predicate
    // they delegate to. So a cancelled task could still be walked forward through the review
    // lifecycle, emitting "đã sửa xong" / "đã gửi khách" notifications for work that was called
    // off. A guard the other path does not share is not a guard.
    if (task.isArchived) {
        throw apiError(409, 'STATE_INVALID', 'Task này đã bị hủy/lưu trữ — không đổi được trạng thái.', {
            reason: 'archived',
        })
    }
    return { asset: { id: asset.id, workspaceId: asset.workspaceId, taskId: asset.taskId }, access, task }
}

/** Delegate a guarded flip to updateTaskStatus (session path) + map its {error} to the envelope. */
async function delegateFlip(
    taskId: string,
    target: string,
    workspaceId: string,
    currentVersion: number,
): Promise<void> {
    const res = await updateTaskStatus(taskId, target, workspaceId, undefined, undefined, currentVersion)
    if (res && typeof res === 'object' && 'error' in res && res.error) {
        const msg = String(res.error)
        const forbidden = /forbidden|quyền/i.test(msg)
        throw apiError(forbidden ? 403 : 409, forbidden ? 'FORBIDDEN' : 'STATE_INVALID', msg)
    }
}

/** The audit row after a committed flip is BEST-EFFORT: a logging failure must NOT surface as
 *  a 500 on an action whose status change already succeeded, nor suppress a follow-up notify. */
async function safeRecordActivity(input: RecordActivityInput): Promise<void> {
    try {
        await recordActivity(prisma, input)
    } catch (e) {
        reviewLog('error', 'task_sync.activity_failed', { type: input.type, taskId: input.taskId, error: String(e) })
    }
}

/**
 * [F8] Admin closed/opened an internal feedback session → flip → A3 ('Đang sửa feedback (nội bộ)')
 * + email the editor (the generic status-change email, keyed by updateTaskStatus). Admin-only.
 * "Confirm" here = open the session; comments are already persisted on Enter (no draft-mode).
 * Reachable from A2 (round 1, right after upload) OR A4 (RE-OPEN a new round after the editor
 * already confirmed a prior fix — multi-round feedback loop, spec §Giai đoạn 4).
 */
export async function markFeedbackDone(assetId: string): Promise<{ ok: true; taskId: string; status: string }> {
    const { asset, access, task } = await loadAssetTaskContext(assetId)
    if (!access.isAdmin) throw apiError(403, 'FORBIDDEN', 'Chỉ người quản lý mới chốt được phiên feedback.')
    const target = REVIEW_STATUS_MAP.internalFeedbackOpen // A3
    if (!canAutoTransition(task.status, target)) {
        throw apiError(409, 'STATE_INVALID', 'Chỉ mở được phiên feedback khi task ở "Đã nộp video (nội bộ)" hoặc "Đã sửa feedback (nội bộ)".', { from: task.status })
    }
    await delegateFlip(asset.taskId, target, asset.workspaceId, task.version)
    await safeRecordActivity({
        type: REVIEW_ACTIVITY.TASK_FEEDBACK_CLOSED,
        workspaceId: asset.workspaceId,
        taskId: asset.taskId,
        assetId: asset.id,
        actorUserId: access.userId,
        meta: { from: task.status, to: target },
    })
    return { ok: true, taskId: asset.taskId, status: target }
}

/**
 * [F9] Editor confirmed the fix → flip A3 → A4 ('Đã sửa feedback (nội bộ)') on the internal
 * round, OR A6 → A7 ('Đã sửa feedback (khách)') on the client round (same button, target chosen
 * from the current status). Admin OR the task's assignee. Notifies the manager it's ready to
 * review/re-approve. The caller (route) enforces the resolved-comment gate in the UI; the server
 * guards the predecessor.
 */
export async function confirmFixDone(assetId: string): Promise<{ ok: true; taskId: string; status: string }> {
    const { asset, access, task } = await loadAssetTaskContext(assetId)
    const isAssignee = task.assigneeId != null && task.assigneeId === access.userId
    if (!access.isAdmin && !isAssignee) {
        throw apiError(403, 'FORBIDDEN', 'Chỉ người được giao task mới xác nhận đã sửa.')
    }
    // Internal round A3→A4, or client round A6→A7 — pick the target reachable from the current status.
    const target =
        canAutoTransition(task.status, REVIEW_STATUS_MAP.internalFixDone)
            ? REVIEW_STATUS_MAP.internalFixDone
            : canAutoTransition(task.status, REVIEW_STATUS_MAP.clientFixDone)
              ? REVIEW_STATUS_MAP.clientFixDone
              : null
    if (!target) {
        throw apiError(409, 'STATE_INVALID', 'Task không ở trạng thái đang sửa feedback.', { from: task.status })
    }
    await delegateFlip(asset.taskId, target, asset.workspaceId, task.version)
    // [feedback-flow spec §4.2] The editor's confirmation CLOSES the current feedback round: mark
    // every still-open parent comment on this asset as resolved. This is what makes the next round's
    // fresh comments (open) stand out from the round just addressed (dimmed + green tick — CommentItem
    // renders `resolvedAt != null` that way). It also means the editor no longer has to hand-tick each
    // comment before confirming (the button's confirm dialog is the safety instead). Best-effort: the
    // status flip already committed, so a resolve failure must NOT 500 the confirm.
    try {
        const versions = await prisma.reviewVersion.findMany({ where: { assetId: asset.id }, select: { id: true } })
        const versionIds = versions.map((v) => v.id)
        if (versionIds.length > 0) {
            const r = await prisma.reviewComment.updateMany({
                where: { versionId: { in: versionIds }, parentId: null, resolvedAt: null, deletedAt: null },
                data: { resolvedAt: new Date(), resolvedById: access.userId },
            })
            reviewLog('info', 'task_sync.round_resolved', { taskId: asset.taskId, assetId: asset.id, resolved: r.count })
        }
    } catch (e) {
        reviewLog('error', 'task_sync.resolve_round_failed', { taskId: asset.taskId, assetId: asset.id, error: String(e) })
    }
    // Tell the manager the editor is done (in-app + email) BEFORE the best-effort audit row, so
    // an audit failure can never suppress the notify. When the editor confirms their OWN fix
    // (actor === assignee) updateTaskStatus's generic notify self-skips — the manager would
    // otherwise hear nothing. Exclude the assignee: if an ADMIN confirms and the assignee is a
    // manager recipient, the assignee already got the generic notify (no double — R6).
    void notifyManagerOfReviewFlip({
        taskId: asset.taskId,
        workspaceId: asset.workspaceId,
        assetId: asset.id,
        fromStatus: task.status,
        toStatus: target,
        actorId: access.userId,
        alsoExcludeIds: [task.assigneeId],
    })
    // [video-fix ⑤] Client round A6→A7: the editor confirmed the CLIENT's requested fix. The client
    // registered their email on /r/ and MUST be told the changes were applied (owner requirement #5) —
    // previously only the internal manager was notified. A7 is internalOnly so clientVisibleLabel()
    // returns null; pass an explicit client-facing EN label instead of relying on that gate. The /r/
    // decision path subscribes the sign-off email, so notifyGuestsOfAsset can reach it. Fire-and-forget.
    if (target === REVIEW_STATUS_MAP.clientFixDone) {
        void notifyGuestsOfAsset({
            assetId: asset.id,
            event: 'status_update',
            statusLabel: 'Revised — pending final approval',
        }).catch(() => {})
    }
    await safeRecordActivity({
        type: REVIEW_ACTIVITY.TASK_FIX_CONFIRMED,
        workspaceId: asset.workspaceId,
        taskId: asset.taskId,
        assetId: asset.id,
        actorUserId: access.userId,
        meta: { from: task.status, to: target },
    })
    return { ok: true, taskId: asset.taskId, status: target }
}

/**
 * [F10-flip] Admin approved internally → flip → A5 ('Đã gửi video (khách)') from A2/A4/A7.
 * Admin-only. The editor's in-app notice comes from updateTaskStatus's generic notify.
 * ⚠️ The portal bridge (create ShareLink + Task.clientReview='AWAITING' + guest email) is P4
 * (BR-05 / FR-10-portal) — it must run ONLY here (admin approve), never on Mux READY.
 */
export async function approveInternalAndSendToClient(
    assetId: string,
): Promise<{ ok: true; taskId: string; status: string }> {
    const { asset, access, task } = await loadAssetTaskContext(assetId)
    if (!access.isAdmin) throw apiError(403, 'FORBIDDEN', 'Chỉ người quản lý mới duyệt gửi khách.')
    const target = REVIEW_STATUS_MAP.sentToClient // A5
    if (!canAutoTransition(task.status, target)) {
        throw apiError(409, 'STATE_INVALID', 'Task chưa sẵn sàng để duyệt gửi khách.', { from: task.status })
    }
    await delegateFlip(asset.taskId, target, asset.workspaceId, task.version)
    await safeRecordActivity({
        type: REVIEW_ACTIVITY.TASK_SENT_TO_CLIENT,
        workspaceId: asset.workspaceId,
        taskId: asset.taskId,
        assetId: asset.id,
        actorUserId: access.userId,
        meta: { from: task.status, to: target },
    })

    // [P4 / BR-05 + FR-10-portal] Bridge review → client portal — runs ONLY here (admin Duyệt),
    // NEVER on Mux READY (R5: an unapproved internal cut must never reach the client). Best-effort:
    // the A5 flip already committed, so a bridge failure must not 500 the approve.
    //   1. get-or-create the ACTIVE share for this asset (the /r/{slug} the client watches on);
    //   2. light the portal: Task.clientReview='AWAITING' (→ deriveClientStatus "Awaiting your
    //      review" + the portal Approve/Request-changes buttons) + point productLink at the review;
    //   3. E1 VERSION_SENT → email any guests already subscribed to this asset (round ≥ 2).
    try {
        const { share } = await getOrCreatePrimaryShareForAsset(asset.id)
        const reviewUrl = `${guestAppBaseUrl()}/r/${share.slug}`
        // Don't clobber a real staff-entered delivery URL: productLink is a first-class, staff-editable
        // field surfaced to the client (portal "Open review" + the taskDelivered email). Only (re)write
        // it when it's empty or already a /r/ review link (safe to repoint at the current slug).
        const current = await prisma.task.findFirst({
            where: { id: asset.taskId, workspaceId: asset.workspaceId },
            select: { productLink: true },
        })
        const setReviewLink = !current?.productLink || current.productLink.includes('/r/')
        await prisma.task.updateMany({
            where: { id: asset.taskId, workspaceId: asset.workspaceId },
            data: { clientReview: 'AWAITING', clientReviewedAt: null, ...(setReviewLink ? { productLink: reviewUrl } : {}) },
        })
        void notifyGuestsOfAsset({ assetId: asset.id, event: 'version_sent' })
    } catch (e) {
        reviewLog('error', 'task_sync.bridge_failed', { taskId: asset.taskId, assetId: asset.id, error: String(e) })
    }
    return { ok: true, taskId: asset.taskId, status: target }
}

/**
 * [P4/R5 — BLOCKER fix] A NEW version just became the head of `assetId`. If that asset's task was
 * already SENT to the client (Task.clientReview='AWAITING'), the client's /r/{slug} share — which
 * serves the stack HEAD, not a pinned version — would immediately expose this new, un-re-approved
 * internal cut. That breaks R5 ("an unapproved internal cut must never reach the client"): the
 * approve→client bridge gates the EMAIL + the clientReview signal, but NOT video visibility, and
 * a ShareLink can only ever track HEAD (it references the asset/stack, never a versionId).
 *
 * So when a fresh head lands on a client-sent task, REVOKE the asset's active shares and clear the
 * client signal. The client's link goes dead until the admin re-Duyệt (approveInternalAndSendToClient),
 * which get-or-creates a FRESH active share + re-emails the guest — i.e. the client only ever sees
 * an ADMIN-approved cut. No-op when the task was never sent (clientReview not 'AWAITING'), so the
 * first-cut A1→A2 path and internal-only rounds are untouched. Best-effort: never throws.
 */
/**
 * Returns the status the task was pulled OUT of, when this call reset a client-facing
 * task back to internal review — `null` when it was a no-op.
 *
 * [Client escalation 2026-07] The caller NEEDS this. Revoking already writes A2, so the
 * `syncTaskFromReviewEvent(..., submitted)` that runs right after sees `task.status ===
 * target` and reports `applied:false` — which is what gates `notifyManagerOfReviewFlip`.
 * Net effect on the live system: an editor delivered a revision, the client's link went
 * dead, the client's status regressed to "In progress", no email went out — AND nobody on
 * the agency side was told there was anything to re-approve. Work sat until a human
 * happened to look. A real client cited exactly this ("we're getting behind on changes")
 * when asking to move back to Frame.io.
 */
export async function revokeClientExposureOnNewVersion(
    taskId: string,
    assetId: string,
    workspaceId: string,
): Promise<{ resetFrom: string | null }> {
    try {
        const task = await prisma.task.findFirst({
            where: { id: taskId, workspaceId },
            select: { clientReview: true, status: true },
        })
        // [AUDIT M1] Act whenever the client currently holds a LIVE link — 'AWAITING' (sent, not yet
        // decided) OR 'CHANGES' (they requested changes and are still watching the same /r/ link). The
        // original guard only covered 'AWAITING', so a fresh head landing AFTER a change-request would
        // slip the un-re-approved cut straight to the client on the still-live 'CHANGES' link (R5 gap).
        // 'APPROVED'/null are settled — nothing live to revoke.
        if (task?.clientReview !== 'AWAITING' && task?.clientReview !== 'CHANGES') return { resetFrom: null }

        // [AUDIT M1-v2] Revoking the share + nulling clientReview is NOT enough: the client PORTAL derives
        // exposure from the task STATUS (isClientFacingPhase substring-matches "khách", independent of
        // clientReview), and — finding the old share revoked — RE-MINTS a fresh OPEN /r/ link to the head.
        // For the 'CHANGES' case the F7 auto-flip A6→A2 is blocked by the predecessor guard, so the task
        // is stuck in the client-facing phase (A5/A6/A7 all contain "khách"). Force it back to internal
        // review (A2 'Đã nộp video (nội bộ)') so the new cut must pass admin re-approval (F10) before the
        // client can ever see it again. Never touch a terminal task.
        const clientPhase = [
            REVIEW_STATUS_MAP.sentToClient,
            REVIEW_STATUS_MAP.clientChangesRequested,
            REVIEW_STATUS_MAP.clientFixDone,
        ]
        const resetStatus = !!task.status && (clientPhase as string[]).includes(task.status) && !isTerminalStatus(task.status)
        const sharesRevoked = await prisma.$transaction(async (tx) => {
            const r = await tx.shareLink.updateMany({
                where: { items: { some: { assetId } }, revokedAt: null },
                data: { revokedAt: new Date() },
            })
            await tx.task.updateMany({
                where: { id: taskId, workspaceId, clientReview: { in: ['AWAITING', 'CHANGES'] } },
                data: {
                    clientReview: null,
                    clientReviewedAt: null,
                    ...(resetStatus ? { status: REVIEW_STATUS_MAP.submitted, version: { increment: 1 } } : {}),
                },
            })
            return r.count
        })
        reviewLog('info', 'task_sync.client_exposure_revoked', { taskId, assetId, sharesRevoked })
        return { resetFrom: resetStatus ? task.status : null }
    } catch (e) {
        reviewLog('error', 'task_sync.revoke_exposure_failed', { taskId, assetId, error: String(e) })
        return { resetFrom: null }
    }
}
