import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { UserRole } from '@prisma/client'

/**
 * Mức độ đỏ (Critical Security Check): Hàm kiểm tra chéo (Cross-check) chống BOLA/IDOR.
 * Đảm bảo rằng Session ID hiện tại thực sự có quyền truy cập vào WorkspaceID đang được thao tác.
 * Tránh việc User F12 đổi thông số workspaceId để phá hoại team khác.
 */
export async function verifyWorkspaceAccess(workspaceId: string, requiredRole: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const session = await getSession()
    
    if (!session || !session.user || !session.user.id) {
        throw new Error('SECURITY_VIOLATION: Unauthorized. No valid session.')
    }

    const userId = session.user.id
    const globalRole = session.user.role

    // Global ADMINs (hoặc Treasurer) có quyền ghi/đọc tất cả.
    const isGlobalAdmin = globalRole === UserRole.ADMIN || session.user.isTreasurer
    
    // Nếu không phải Global Admin, BẮT BUỘC phải check trong bảng WorkspaceMember
    let workspaceRole = 'MEMBER'
    
    if (!isGlobalAdmin) {
        const membership = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: userId,
                    workspaceId: workspaceId
                }
            }
        })

        if (!membership) {
            console.error(`[SECURITY] User ${userId} attempted to access unauthorized workspace ${workspaceId}`)
            throw new Error('SECURITY_VIOLATION: Bạn không có quyền truy cập vào Workspace này (IDOR Blocked).')
        }
        
        workspaceRole = membership.role

        if (requiredRole === 'ADMIN' && workspaceRole !== 'ADMIN' && workspaceRole !== 'OWNER') {
            console.error(`[SECURITY] User ${userId} attempted to perform ADMIN action on workspace ${workspaceId}`)
            throw new Error('SECURITY_VIOLATION: Bạn không có quyền quản trị tại Workspace này.')
        }
    } else {
        workspaceRole = 'ADMIN' // Global admins get local admin privileges
    }

    return {
        session,
        user: session.user,
        userId: session.user.id,
        workspaceRole,
        isGlobalAdmin
    }
}

/**
 * Kiểm tra Session chống lưu Cookie cũ chưa hết hạn (Session Fixation Block).
 * Hàm này dùng để đảm bảo mỗi khi gọi data, user chưa bị Locked bởi Admin.
 */
export async function verifyActiveSession() {
    const session = await getSession()
    if (!session || !session.user || !session.user.id) {
        throw new Error('SECURITY_VIOLATION: Unauthorized.')
    }

    // Hit DB để check role hiện hành, đề phòng bị Ban hôm qua nhưng Cookie vẫn còn sống 7 ngày.
    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, id: true, isTreasurer: true }
    })

    if (!dbUser || dbUser.role === 'LOCKED') {
        throw new Error('SECURITY_VIOLATION: Tài khoản của bạn đã bị khóa hoặc không tồn tại.')
    }

    return {
        session,
        dbUser,
        isAdmin: dbUser.role === 'ADMIN' || dbUser.isTreasurer
    }
}
