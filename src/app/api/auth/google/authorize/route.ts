import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getGoogleRedirectUri } from '@/lib/google-auth'

/**
 * Start Google Sign-In: generate a random CSRF `state`, stash it in a short-lived
 * httpOnly cookie, and redirect to Google's consent screen. The callback verifies
 * the state cookie matches the returned `state` param.
 *
 * Pre-auth flow (no session yet) → state lives in a cookie, not in the JWT.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'

export async function GET() {
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
        console.error('[google authorize] GOOGLE_CLIENT_ID not configured')
        return NextResponse.redirect(new URL('/login?error=google', APP_URL))
    }

    const state = randomBytes(32).toString('base64url')

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', getGoogleRedirectUri())
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'openid email profile')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('prompt', 'select_account')

    const res = NextResponse.redirect(authUrl.toString())
    res.cookies.set('g_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !process.env.ELECTRON_DESKTOP,
        sameSite: 'lax', // must be lax so the cookie survives the redirect back from Google
        path: '/',
        maxAge: 300, // 5 minutes
    })
    return res
}
