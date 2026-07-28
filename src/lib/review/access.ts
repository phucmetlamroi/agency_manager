// [Review module] Internal-auth helper (KIEN-TRUC §7). Wraps the app's real
// session + workspace scoping — NEVER builds a second auth system.
//
// Rules (v1): ADMIN + USER get full module access inside workspaces they can
// see; LOCKED (and CLIENT leftovers) are rejected.
//
// [kiểm toán 2026-07 · Q3] Có HAI loại "khách", đừng lẫn:
//   • Khách qua LINK CHIA SẺ — không có phiên đăng nhập, giải quyết ở resolveShare
//     (P5). Loại này VẪN không đi qua đây, câu trên vẫn đúng nguyên văn.
//   • KHÁCH CỦA WORKSPACE — tài khoản nội bộ thật, có hàng WorkspaceMember với
//     role GUEST. Chủ sản phẩm chốt ở Q3: loại này ĐƯỢC vào Tệp, mức "chỉ xem +
//     bình luận", và chỉ thấy tài nguyên gắn với task được giao cho họ.
//
// Cách mở: `allowGuest` phải được KHAI BÁO RÕ ở từng lời gọi. Mặc định vẫn là
// MEMBER, nên mọi đường chưa được xét duyệt bằng tay đều tự động 403 với khách —
// đóng-khi-thiếu, không phải mở-khi-quên.

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
    /**
     * [Q3] true khi người gọi là KHÁCH CỦA WORKSPACE (WorkspaceMember.role = GUEST).
     * Chỉ có thể true ở những lời gọi đã khai báo `allowGuest` — dùng để giao diện
     * ẩn nút ghi. KHÔNG dùng làm cổng chặn ghi: cổng đó là chính việc đường ghi
     * không khai báo allowGuest, nên khách bị verifyWorkspaceAccess chặn từ đầu.
     */
    isGuest: boolean
}

/**
 * Require a live internal session with review-module access.
 * Pass `workspaceId` to ALSO enforce workspace membership (defense in depth —
 * every mutation re-checks, never trusting layout guards).
 */
export async function requireReviewAccess(opts?: {
    workspaceId?: string
    admin?: boolean
    /**
     * [Q3] Cho phép KHÁCH CỦA WORKSPACE (role GUEST) qua cổng này. Chỉ đặt ở đường
     * ĐỌC, và ở đúng một đường ghi mà chủ sản phẩm đã chốt: tạo bình luận.
     * Bỏ trống = MEMBER = khách bị chặn. Đừng đặt "cho tiện".
     */
    allowGuest?: boolean
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
            const auth = await verifyWorkspaceAccess(opts.workspaceId, opts.allowGuest ? 'GUEST' : 'MEMBER')
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
            // GUEST không bao giờ là OWNER/ADMIN nên isAdmin tự khắc false; getFolderScope
            // vì thế giới hạn khách theo task được giao — đúng vế thứ hai của Q3.
            return { userId: auth.userId, role, isAdmin: isWorkspaceAdmin, isGuest: auth.workspaceRole === 'GUEST' }
        } catch (e) {
            if (e instanceof ReviewAccessError) throw e
            throw new ReviewAccessError(403, 'Không có quyền trên workspace này.')
        }
    }
    // No workspace scope → isAdmin is meaningless for authorization (no consumer relies
    // on it here); report false rather than trusting the global role.
    return { userId: user.id, role, isAdmin: false, isGuest: false }
}
