import { prisma } from '@/lib/db'

/**
 * Read-only resolver: where a logged-in visitor landing on `/` should be
 * forwarded. Mirrors the post-login redirect in `auth-actions.ts` (loginAction)
 * WITHOUT modifying it — purely additive.
 *
 * Keyed on `sessionProfileId` (the profile already embedded in the session) so
 * the destination always satisfies the middleware's profile guard for /admin
 * (src/middleware.ts) and never bounces back to /login.
 *
 * @param user The decrypted `session.user` payload from getSession().
 */
export async function resolveHomeDestination(user: any): Promise<string> {
    if (!user) return '/login'

    // [Canonical Clients] The account portal was removed — clients use public
    // /share/[token] links now. Leftover CLIENT sessions go back to /login
    // (their accounts are LOCKED by the deactivate script).
    if (user.role === 'CLIENT') return '/login'

    // Without an active profile in the session we can't safely hit /admin
    // (middleware requires sessionProfileId) → send to the post-signup hub.
    const profileId: string | null = user.sessionProfileId ?? null
    if (!profileId) return '/welcome'

    const firstWs = await prisma.workspace.findFirst({
        where: { profileId, status: { not: 'SOFT_DELETED' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    })

    return firstWs ? `/${firstWs.id}/admin` : '/welcome'
}
