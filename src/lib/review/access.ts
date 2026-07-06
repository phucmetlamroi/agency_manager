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
            // isAdmin is WORKSPACE-scoped (canonical predicate from verifyProfileAdminAccess):
            // OWNER/ADMIN of THIS workspace OR its profile. NEVER the global JWT User.role —
            // a globally-ADMIN user who is only a MEMBER of this workspace must NOT be admin
            // here (that would let them bypass the FR-B07 folder-delete creator guard on
            // other members' folders). deleteItems is the sole consumer of this flag.
            const isWorkspaceAdmin =
                auth.workspaceRole === 'OWNER' ||
                auth.workspaceRole === 'ADMIN' ||
                auth.profileRole === 'OWNER' ||
                auth.profileRole === 'ADMIN'
            return { userId: auth.userId, role, isAdmin: isWorkspaceAdmin }
        } catch (e) {
            if (e instanceof ReviewAccessError) throw e
            throw new ReviewAccessError(403, 'Không có quyền trên workspace này.')
        }
    }
    // No workspace scope → isAdmin is meaningless for authorization (no consumer relies
    // on it here); report false rather than trusting the global role.
    return { userId: user.id, role, isAdmin: false }
}
