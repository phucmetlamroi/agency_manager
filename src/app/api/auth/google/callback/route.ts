import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { login, loginWithProfile } from '@/lib/auth'
import {
    exchangeCodeForToken,
    fetchGoogleUserInfo,
    findOrCreateGoogleUser,
    type GoogleAuthUser,
} from '@/lib/google-auth'

/**
 * Google Sign-In callback.
 *
 * Verifies CSRF state → exchanges code → reads verified email/profile →
 * finds/links/creates the user → sets the session cookie (login/loginWithProfile)
 * → redirects to the user's first workspace. Brand-new users land on
 * `/{ws}/admin` where the existing UsernameMigrationModal forces them to pick a
 * real username handle.
 *
 * NOTE: uses `redirect()` from next/navigation (NOT NextResponse.redirect) so the
 * session cookie set via next/headers inside login() attaches to the response —
 * the same pattern used by loginAction. All redirect() calls are kept OUTSIDE the
 * try/catch so the NEXT_REDIRECT control-flow error is not swallowed.
 */

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    const cookieStore = await cookies()
    const savedState = cookieStore.get('g_oauth_state')?.value
    // Single-use: clear the state cookie immediately.
    cookieStore.set('g_oauth_state', '', { path: '/', maxAge: 0 })

    // CSRF + presence check
    if (!code || !state || !savedState || state !== savedState) {
        redirect('/login?error=google')
    }

    // Exchange code → access token → Google profile
    const accessToken = await exchangeCodeForToken(code)
    if (!accessToken) redirect('/login?error=google')

    const info = await fetchGoogleUserInfo(accessToken)
    if (!info) redirect('/login?error=google')
    // Only link/create when Google has verified the email (prevents account takeover).
    if (!info.verifiedEmail || !info.email) redirect('/login?error=google_unverified')

    // Find by googleId → link by email → create (transaction). Outside-redirect catch.
    let user: GoogleAuthUser | null = null
    try {
        user = await findOrCreateGoogleUser(info)
    } catch (e) {
        console.error('[google callback] findOrCreateGoogleUser failed:', e)
    }
    if (!user) redirect('/login?error=google')

    // Build session payload — mirror loginAction (auth-actions.ts). Google email is
    // verified, so no restriction; requiresEmailMigration follows the user record.
    const sessionPayload = {
        id: user.id,
        username: user.username,
        role: user.role,
        profileId: user.profileId,
        sessionVersion: user.sessionVersion,
        email: user.email,
        displayName: user.displayName ?? user.username,
        restricted: false,
        requiresEmailMigration: !user.hasCompletedEmailMigration,
    }

    // Resolve landing profile (user.profileId → first ProfileAccess → none).
    let defaultProfileId = user.profileId
    if (!defaultProfileId) {
        const crossAccess = await prisma.profileAccess.findFirst({
            where: { userId: user.id },
            select: { profileId: true },
        })
        defaultProfileId = crossAccess?.profileId ?? null
    }

    if (!defaultProfileId) {
        await login(sessionPayload)
        redirect('/login')
    }

    await loginWithProfile(sessionPayload, defaultProfileId)
    const firstWs = await prisma.workspace.findFirst({
        where: { profileId: defaultProfileId, status: { not: 'SOFT_DELETED' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    })
    if (!firstWs) redirect('/login')
    redirect(`/${firstWs.id}/admin`)
}
