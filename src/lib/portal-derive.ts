/**
 * [Client Portal → extracted 2026-06 · rewritten P3/F2] Pure status-derivation helpers
 * shared by the public share-link portal. As of P3 these read the CENTRAL TASK_STATUS_META
 * (an explicit value→label map with an `internalOnly` flag) instead of substring matching.
 * The substring version broke on the 6 new video statuses — e.g. 'Đã nhận feedback (khách)'
 * contains "nhận" → wrongly "Received"; 'Đã nộp video (nội bộ)' matched nothing → leaked the
 * default. The 11 legacy labels are UNCHANGED (regression K3).
 */

import { TASK_STATUS_META, PHASE_CLIENT_LABEL } from './task-statuses'

const META_BY_VALUE = new Map(TASK_STATUS_META.map((m) => [m.value as string, m]))

/**
 * The EN label a CLIENT sees for a given internal status. `internalOnly` statuses (every
 * "(nội bộ)" step + the editor-only client fix) fall back to the PHASE label so the raw VI
 * string never leaks. Unknown statuses default to a safe 'In progress' (never the VI value).
 */
export function clientLabelOf(status: string): string {
    const m = META_BY_VALUE.get(status)
    if (!m) return 'In progress'
    return m.internalOnly ? PHASE_CLIENT_LABEL[m.phase] : m.clientLabel
}

/** Back-compat alias — same signature/name the portal actions already import. */
export function mapClientTaskStatus(internalStatus: string): string {
    return clientLabelOf(internalStatus || '')
}

/** Whether a status is one the client must NOT see the raw VI string for. */
export function isInternalOnlyStatus(status: string): boolean {
    return META_BY_VALUE.get(status)?.internalOnly ?? false
}

/**
 * Client-facing status, refined by the `clientReview` field (decoupled from
 * the internal status FSM). AWAITING = a cut is ready for the client to review
 * — the single loudest, client-action state.
 */
export function deriveClientStatus(status: string, clientReview?: string | null): string {
    if (clientReview === 'AWAITING') return 'Awaiting your review'
    if (clientReview === 'APPROVED') return 'Completed'
    if (clientReview === 'CHANGES') return 'In revision'
    return mapClientTaskStatus(status)
}

/**
 * Whether this deliverable is waiting on the CLIENT (drives "Needs your
 * attention"). Explicit AWAITING, or heuristic: there's a cut (productLink)
 * and it isn't done, and the client hasn't already approved/asked for changes.
 */
export function deriveNeedsYou(t: { status: string; productLink?: string | null; clientReview?: string | null }): boolean {
    if (t.clientReview === 'AWAITING') return true
    if (t.clientReview === 'APPROVED' || t.clientReview === 'CHANGES') return false
    // [P3/F2] A5 = admin approved & sent to the client → client action needed even before
    // the P4 portal bridge sets clientReview='AWAITING'.
    if (needsClientAction(t.status)) return true
    const s = (t.status || '').toLowerCase()
    const done = s.includes('hoàn tất') || s.includes('lưu trữ') || s.includes('hủy')
    return !!t.productLink && !done
}

/** [P3/F2 §6.2] The status where the ball is in the CLIENT's court (drives "Approve"). */
export function needsClientAction(status: string): boolean {
    return status === 'Đã gửi video (khách)'
}

/**
 * [B5/P4] R5 gate — may a READY cut be surfaced to the CLIENT for this task?
 * TRUE only when the task is in a client-facing phase:
 *   - `clientReview != null`  → the bridge ran, or the client already decided; OR
 *   - the status string contains "khách" (client-phase, incl. a manually free-typed one).
 * Uses a SUBSTRING on "khách" ON PURPOSE (NOT isReviewPhaseStatus / meta-lookup) so a
 * free-typed client status still passes, while every internal "(nội bộ)" step (A2/A3/A4)
 * and every production/system status fails → an unapproved internal cut is never leaked.
 */
export function isClientFacingPhase(status: string | null | undefined, clientReview: string | null | undefined): boolean {
    return clientReview != null || /khách/i.test(status || '')
}
