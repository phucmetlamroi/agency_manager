import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/jwt'

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // 1. Skip static assets and internal paths
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.includes('.') ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next()
    }

    const requestHeaders = new Headers(request.headers)
    const sessionCookie = request.cookies.get('session')

    // 1.5. Block Deprecated Paths (Phase 1)
    if (pathname.startsWith('/download') || pathname.startsWith('/extract')) {
        return NextResponse.rewrite(new URL('/404', request.url))
    }

    // 1.6. [Canonical Clients] /share/[token] is INTENTIONALLY PUBLIC —
    // the 256-bit token in the URL is the credential (verified server-side
    // by resolveShareToken with hash-at-rest + rate limit + uniform 404).
    // Early-return so neither the session guard nor a logged-in user's
    // role-isolation redirects can interfere with a client opening a link.
    // X-Robots-Tag backstops the page-level noindex metadata.
    if (pathname.startsWith('/share')) {
        const res = NextResponse.next()
        res.headers.set('X-Robots-Tag', 'noindex, nofollow')
        res.headers.set('Referrer-Policy', 'no-referrer')
        return res
    }

    // 2. Auth Guard ONLY
    if (!sessionCookie) {
        const protectedPaths = ['/admin', '/dashboard']
        if (protectedPaths.some(p => pathname.startsWith(p))) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    } else {
        try {
            const session = await decrypt(sessionCookie.value)
            if (!session?.user) throw new Error('Invalid session')

            const role = session.user.role;

            // [Canonical Clients] The account-based client portal was removed —
            // clients access via public /share/[token] links now. Leftover
            // CLIENT sessions (accounts get LOCKED by the deactivate script)
            // have nowhere to go: keep them out of staff surfaces.
            if (role === 'CLIENT' && !pathname.startsWith('/api') && pathname !== '/login') {
                return NextResponse.redirect(new URL('/login', request.url));
            }

            // VERCEL FIX 4: CHECK EMBEDDED PROFILE ID
            // If they are trying to access a workspace or admin panel but haven't selected a profile
            const requiresProfilePaths = ['/admin', '/dashboard'];
            if (requiresProfilePaths.some(p => pathname.startsWith(p))) {
                if (!session.user.sessionProfileId) {
                    console.log(`[Middleware] Missing sessionProfileId for path ${pathname}. Redirecting to /login`);
                    return NextResponse.redirect(new URL('/login', request.url))
                }
            }
        } catch (err) {
            console.error('[Middleware] Session Decrypt Error for path', pathname, err);
            // Don't overly-aggressively delete cookies, just redirect to login for a fresh start 
            // Vercel edge can sometimes throw errors decrypting if the key isn't perfectly synced.
            const res = NextResponse.redirect(new URL('/login', request.url))
            // Only drop the session if it's completely unreadable to prevent infinite loops, 
            // but log it so we know.
            console.log('[Middleware] Dropping session cookie due to decrypt error.');
            res.cookies.delete('session')
            return res
        }
    }

    // 3. Response Assembly
    // [Canonical Clients] portal i18n rewrite removed with the account portal.
    const finalResponse: NextResponse = NextResponse.next({ request: { headers: requestHeaders } })

    const trackingId = request.cookies.get('tracking_session_id')?.value || crypto.randomUUID()
    finalResponse.cookies.set('tracking_session_id', trackingId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 60,
        path: '/'
    })

    return finalResponse;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
