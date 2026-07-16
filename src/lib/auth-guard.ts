import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { cache } from 'react'
import { UserRole } from '@prisma/client'

export type AuthContext = {
    id: string
    role: UserRole
    isSuperAdmin: boolean
    isTreasurer: boolean
    email: string | null
    username: string | null
    nickname: string | null
    profileId: string | null
}

/**
 * Layer 1 & 2: Authentication & Role Context Guard
 * Sử dụng React cache để Request Deduplication (chỉ query DB 1 lần/request).
 */
export const getCurrentUser = cache(async (): Promise<AuthContext> => {
    const session = await getSession()

    // 1. Auth Check
    if (!session || !session.user || !session.user.id) {
        throw new Error('Unauthorized: Vui lòng đăng nhập.')
    }

    // 2. Fetch User Context
    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) throw new Error('Unauthorized: User không tồn tại.')

    // [AUDIT HT-033 fix] Central liveness gate for EVERY getCurrentUser() caller. Without it, a
    // banned (LOCKED) account or a session revoked by "logout all devices" / password-reset /
    // email-migration (which bump User.sessionVersion) could keep mutating through any action that
    // authenticates via getCurrentUser until its JWT expires. One check here fixes all callers.
    if (user.role === 'LOCKED') {
        throw new Error('Unauthorized: Tài khoản đã bị khóa.')
    }
    const tokenVersion = ((session.user as any).sessionVersion ?? 0) as number
    const dbVersion = ((user as any).sessionVersion ?? 0) as number
    if (tokenVersion < dbVersion) {
        throw new Error('Unauthorized: Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.')
    }

    return {
        id: user.id,
        role: user.role as UserRole, // Ensure proper casting if needed or define Role explicitly
        isSuperAdmin: user.role === 'ADMIN',
        isTreasurer: user.isTreasurer,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        profileId: user.profileId
    }
})
