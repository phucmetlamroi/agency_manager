import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'
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

    // 2. Auth Guard ONLY
    if (!sessionCookie) {
        const protectedPaths = ['/workspace', '/portal', '/admin', '/dashboard', '/agency', '/profile']
        if (protectedPaths.some(p => pathname.startsWith(p))) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    } else {
        try {
            const session = await decrypt(sessionCookie.value)
            if (!session?.user) throw new Error('Invalid session')
            
            const role = session.user.role

            // Handle Root and Login direct access
            if (pathname === '/login' || pathname === '/') {
                const target = role === 'CLIENT' ? '/portal/en' : '/profile'
                return NextResponse.redirect(new URL(target, request.url))
            }
            
            // Basic role isolation
            if (role === 'CLIENT' && !pathname.startsWith('/portal') && !pathname.startsWith('/api')) {
                return NextResponse.redirect(new URL('/portal/en', request.url))
            }

            // Mandatory ToS Check
            if (session.user.hasAcceptedTerms === false) {
                if (pathname !== '/user-agreement' && !pathname.startsWith('/api')) {
                    return NextResponse.redirect(new URL('/user-agreement', request.url))
                }
            } else if (pathname === '/user-agreement') {
                return NextResponse.redirect(new URL('/profile', request.url))
            }

            // VERCEL FIX 4: CHECK EMBEDDED PROFILE ID
            // If they are trying to access a workspace or admin panel but haven't selected a profile
            const requiresProfilePaths = ['/workspace', '/admin', '/dashboard', '/agency'];
            if (requiresProfilePaths.some(p => pathname.startsWith(p))) {
                if (!session.user.sessionProfileId) {
                    console.log(`[Middleware] Missing sessionProfileId for path ${pathname}. Redirecting to /profile`);
                    return NextResponse.redirect(new URL('/profile', request.url))
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

    // 3. I18n and Response Assembly
    let finalResponse: NextResponse;
    if (pathname === '/portal' || pathname === '/portal/') {
        finalResponse = NextResponse.redirect(new URL(`/portal/${routing.defaultLocale}`, request.url))
    } else {
        const localeMatch = pathname.match(/^\/portal\/([a-z]{2})(\/|$)/)
        if (localeMatch && routing.locales.includes(localeMatch[1] as any)) {
            requestHeaders.set('x-portal-locale', localeMatch[1])
        }
        finalResponse = NextResponse.next({ request: { headers: requestHeaders } })
    }

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
