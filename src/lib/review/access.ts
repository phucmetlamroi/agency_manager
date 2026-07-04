// [Review module] Internal-auth helper (KIEN-TRUC §7). Wraps the app's real
// session + workspace scoping — NEVER builds a second auth system.
//
// Rules (v1): ADMIN + USER get full module access inside workspaces they can
// see; LOCKED (and CLIENT leftovers) are rejected. Guest access NEVER passes
// through here — guests are resolved from ShareLink rows (P5's resolveShare).

import { getSession } from '@/lib/auth'
import { verifyWorkspaceAccess } from '@/lib/security'

export class ReviewAccessError extends Error {
    constructor(
        public status: 401 | 403,
        message: string,
    ) {
        super(message)
        this.name = 'ReviewAccessError'
    }
}

export interface ReviewAccessContext {
    userId: string
    role: string
    isAdmin: boolean
}

/**
 * Require a live internal session with review-module access.
 * Pass `workspaceId` to ALSO enforce workspace membership (defense in depth —
 * every mutation re-checks, never trusting layout guards).
 */
export async function requireReviewAccess(opts?: {
    workspaceId?: string
    admin?: boolean
}): Promise<ReviewAccessContext> {
    const session = await getSession()
    const user = session?.user as { id?: string; role?: string } | undefined
    if (!user?.id) throw new ReviewAccessError(401, 'Chưa đăng nhập.')

    const role = user.role ?? 'USER'
    if (role === 'LOCKED' || role === 'CLIENT') {
        throw new ReviewAccessError(403, 'Tài khoản không có quyền dùng module review.')
    }
    if (opts?.admin && role !== 'ADMIN') {
        throw new ReviewAccessError(403, 'Chỉ ADMIN được thực hiện thao tác này.')
    }

    if (opts?.workspaceId) {
        try {
            const auth = await verifyWorkspaceAccess(opts.workspaceId, 'MEMBER')
            return { userId: auth.userId, role, isAdmin: role === 'ADMIN' }
        } catch {
            throw new ReviewAccessError(403, 'Không có quyền trên workspace này.')
        }
    }
    return { userId: user.id, role, isAdmin: role === 'ADMIN' }
}
