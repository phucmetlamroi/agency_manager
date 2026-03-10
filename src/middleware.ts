import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'
import { decrypt } from '@/lib/jwt'

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // 1. Skip static assets and internal next.js paths early
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.includes('.') ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next()
    }

    // --- TRACKING METADATA PREPARATION ---
    const requestHeaders = new Headers(request.headers)
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const country = request.headers.get('x-vercel-ip-country') || 'Unknown'
    const city = request.headers.get('x-vercel-ip-city') || 'Unknown'

    requestHeaders.set('x-client-ip', ip)
    requestHeaders.set('x-client-country', country)
    requestHeaders.set('x-client-city', city)

    requestHeaders.set('x-client-city', city)
    const sessionCookie = request.cookies.get('session')
    const profileCookie = request.cookies.get('current_profile_id')
    let finalResponse: NextResponse | null = null;

    // 2. Redirect logic for unauthenticated users
    if (!sessionCookie) {
        const protectedPaths = ['/workspaces', '/portal', '/admin', '/dashboard', '/agency', '/profile-selection']
        if (protectedPaths.some(p => pathname.startsWith(p))) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    } else {
        // Authenticated user logic
        try {
            const session = await decrypt(sessionCookie.value)
            const role = session?.user?.role

            // --- MULTI-TENANT PROFILE GUARD ---
            // If No profile cookie AND not on selection page -> Go to selection
            if (!profileCookie && pathname !== '/profile-selection') {
                return NextResponse.redirect(new URL('/profile-selection', request.url))
            }

            // Role-based access control
            if (role === 'CLIENT') {
                const adminPaths = ['/workspaces', '/admin', '/dashboard', '/agency']
                if (adminPaths.some(p => pathname.startsWith(p))) {
                    return NextResponse.redirect(new URL('/portal', request.url))
                }
            } else {
                if (pathname.startsWith('/portal')) {
                    return NextResponse.redirect(new URL('/workspaces', request.url))
                }
            }

            // Redirect from login or root if authenticated
            if (pathname === '/login' || pathname === '/') {
                if (!profileCookie) {
                    return NextResponse.redirect(new URL('/profile-selection', request.url))
                } else {
                    const target = role === 'CLIENT' ? '/portal' : '/workspaces'
                    return NextResponse.redirect(new URL(target, request.url))
                }
            }
        } catch (err) {
            const res = NextResponse.redirect(new URL('/login', request.url))
            res.cookies.delete('session')
            res.cookies.delete('current_profile_id')
            return res
        }
    }

    // Default response (Allow through if not handled above)
    if (!finalResponse) {
        if (pathname === '/portal' || pathname === '/portal/') {
            finalResponse = NextResponse.redirect(new URL(`/portal/${routing.defaultLocale}`, request.url))
        } else {
            const localeMatch = pathname.match(/^\/portal\/([a-z]{2})(\/|$)/)
            if (localeMatch && routing.locales.includes(localeMatch[1] as any)) {
                requestHeaders.set('x-portal-locale', localeMatch[1])
            }
            finalResponse = NextResponse.next({ request: { headers: requestHeaders } })
        }
    }

    // --- TRACKING SESSION COOKIE INJECTION ---
    let trackingId = request.cookies.get('tracking_session_id')?.value || crypto.randomUUID()
    
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

