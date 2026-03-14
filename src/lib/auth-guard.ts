import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { cache } from 'react'
import { UserRole } from '@prisma/client'

export type AuthContext = {
    id: string
    role: UserRole
    isSuperAdmin: boolean
    isTreasurer: boolean // Added
    email: string | null
    username: string | null
    nickname: string | null
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

    return {
        id: user.id,
        role: user.role as UserRole, // Ensure proper casting if needed or define Role explicitly
        isSuperAdmin: user.role === 'ADMIN',
        isTreasurer: user.isTreasurer,
        email: user.email,
        username: user.username,
        nickname: user.nickname
    }
})
