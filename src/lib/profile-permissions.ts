import { prisma } from '@/lib/db'

/**
 * Check: user có phải chủ home profile của profileId không?
 *
 * [Sprint Y] "Profile owner" = user.profileId === profileId (set khi signup).
 * Cross-team invitees (qua ProfileAccess) KHÔNG được tính là owner.
 * Global admin (User.role === 'ADMIN') KHÔNG override (strict mode per user spec).
 *
 * Dùng để gate:
 *   - Workspace creation (server action + UI button visibility)
 *   - Future: profile rename, profile delete, member invite... nếu cần
 */
export async function isProfileOwner(userId: string, profileId: string): Promise<boolean> {
    if (!userId || !profileId) return false
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { profileId: true },
    })
    return user?.profileId === profileId
}
