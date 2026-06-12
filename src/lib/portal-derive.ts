/**
 * [Client Portal → extracted 2026-06] Pure status-derivation helpers shared
 * by the (removed) account portal and the public share-link portal. Moved
 * out of client-portal-actions.ts so share-portal-actions.ts keeps the exact
 * same client-facing status semantics after the account portal is deleted.
 */

/**
 * Maps the 8 internal task states into 5 abstract states suitable for the
 * client-facing portal.
 */
export function mapClientTaskStatus(internalStatus: string): string {
    const statusLower = internalStatus.toLowerCase()

    if (statusLower.includes('đợi') || statusLower.includes('đã nhận')) {
        return 'Pending'
    }
    if (statusLower.includes('thực hiện')) {
        return 'In Progress'
    }
    if (statusLower.includes('review')) {
        return 'Action Required'
    }
    if (statusLower.includes('revision') || statusLower.includes('sửa')) {
        return 'Revising'
    }
    if (statusLower.includes('hoàn tất') || statusLower.includes('lưu trữ')) {
        return 'Completed'
    }

    return 'Pending'
}

/**
 * Client-facing status, refined by the `clientReview` field (decoupled from
 * the internal status FSM). AWAITING = a cut is ready for the client to review.
 */
export function deriveClientStatus(status: string, clientReview?: string | null): string {
    if (clientReview === 'AWAITING') return 'Action Required'
    if (clientReview === 'APPROVED') return 'Completed'
    if (clientReview === 'CHANGES') return 'Revising'
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
