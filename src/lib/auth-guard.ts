import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { cache } from 'react'
import { UserRole } from '@prisma/client'

export type AuthContext = {
    id: string
    role: UserRole
    agencyId: string | null
    ownedAgencyId: string | null
    isSuperAdmin: boolean
    isAgencyOwner: boolean
    email: string | null
    username: string | null
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
        where: { id: session.user.id },
        include: { ownedAgency: true }
    })

    if (!user) throw new Error('Unauthorized: User không tồn tại.')

    return {
        id: user.id,
        role: user.role as UserRole, // Ensure proper casting if needed or define Role explicitly
        agencyId: user.agencyId,
        ownedAgencyId: user.ownedAgency[0]?.id || null,
        isSuperAdmin: user.role === 'ADMIN',
        isAgencyOwner: user.ownedAgency.length > 0,
        email: user.email,
        username: user.username
    }
})
