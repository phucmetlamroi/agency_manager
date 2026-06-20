/**
 * [Client Portal → extracted 2026-06] Pure status-derivation helpers shared
 * by the (removed) account portal and the public share-link portal. Moved
 * out of client-portal-actions.ts so share-portal-actions.ts keeps the exact
 * same client-facing status semantics after the account portal is deleted.
 */

/**
 * [Redesign] Maps each REAL admin task status to a faithful client-facing
 * English label (mirroring the admin status vocabulary instead of the old
 * lossy 5-state abstraction). Purely-internal staffing states are folded:
 *   - 'Đang đợi giao' (not-yet-assigned)  → "In production"
 *   - 'Sửa frame' (internal frame fix)    → "In progress"
 *   - 'Quá hạn' (cron overdue flag)       → "In progress" (don't surface "Delayed")
 *   - 'Đã hủy' (cancelled)                → "Closed" (excluded from lists upstream)
 * Order matters — most-specific substrings first.
 */
export function mapClientTaskStatus(internalStatus: string): string {
    const s = (internalStatus || '').toLowerCase()

    if (s.includes('hoàn tất') || s.includes('lưu trữ')) return 'Completed'
    if (s.includes('hủy')) return 'Closed'
    if (s.includes('revision')) return 'In revision'
    if (s.includes('gửi lại')) return 'Revisions delivered'
    if (s.includes('sửa')) return 'In progress'        // 'Sửa frame' (internal) folded
    if (s.includes('tạm ng')) return 'On hold'          // 'Tạm ngưng'
    if (s.includes('quá hạn')) return 'In progress'     // soften — don't show "Delayed"
    if (s.includes('thực hiện')) return 'In progress'
    if (s.includes('nhận')) return 'Received'           // 'Nhận task' / 'Đã nhận task'
    if (s.includes('đợi')) return 'In production'       // 'Đang đợi giao' (pre-assignment)
    return 'Received'
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
    const s = (t.status || '').toLowerCase()
    const done = s.includes('hoàn tất') || s.includes('lưu trữ') || s.includes('hủy')
    return !!t.productLink && !done
}
