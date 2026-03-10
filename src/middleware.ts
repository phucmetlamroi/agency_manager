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

    let finalResponse: NextResponse | null = null;
    let isRedirecting = false; // flag to prevent overwriting response
    const sessionCookie = request.cookies.get('session')
    const profileCookie = request.cookies.get('current_profile_id')

    // 2. Redirect logic
    if (!sessionCookie) {
        const protectedPaths = ['/workspaces', '/portal', '/admin', '/dashboard', '/agency', '/profile-selection']
        const isProtectedRoute = protectedPaths.some(p => pathname.startsWith(p))

        if (isProtectedRoute && pathname !== '/login') {
            finalResponse = NextResponse.redirect(new URL('/login', request.url))
            isRedirecting = true
        }
    } else {
        try {
            const session = await decrypt(sessionCookie.value)
            const role = session?.user?.role

            // --- MULTI-TENANT PROFILE GUARD ---
            if (!profileCookie && pathname !== '/profile-selection' && !pathname.startsWith('/api')) {
                finalResponse = NextResponse.redirect(new URL('/profile-selection', request.url))
                isRedirecting = true
            }

            if (!isRedirecting) {
                if (role === 'CLIENT') {
                    const adminPaths = ['/workspaces', '/admin', '/dashboard', '/agency']
                    if (adminPaths.some(p => pathname.startsWith(p))) {
                        finalResponse = NextResponse.redirect(new URL('/portal', request.url))
                        isRedirecting = true
                    }
                } else {
                    if (pathname.startsWith('/portal')) {
                        finalResponse = NextResponse.redirect(new URL('/workspaces', request.url))
                        isRedirecting = true
                    }
                }

                if (!isRedirecting && (pathname === '/login' || pathname === '/')) {
                    if (!profileCookie) {
                        finalResponse = NextResponse.redirect(new URL('/profile-selection', request.url))
                    } else {
                        const target = role === 'CLIENT' ? '/portal' : '/workspaces'
                        finalResponse = NextResponse.redirect(new URL(target, request.url))
                    }
                    isRedirecting = true
                }
            }
        } catch (err) {
            finalResponse = NextResponse.redirect(new URL('/login', request.url))
            finalResponse.cookies.delete('session')
            finalResponse.cookies.delete('current_profile_id') // clean up profile cookie on failure
            isRedirecting = true
        }
    }

    if (!finalResponse) {
        // 3. Internationalization for Portal index
        if (pathname === '/portal' || pathname === '/portal/') {
            finalResponse = NextResponse.redirect(new URL(`/portal/${routing.defaultLocale}`, request.url))
        } else {
            // 4. Inject locale header so i18n/request.ts can read the locale from URL
            const localeMatch = pathname.match(/^\/portal\/([a-z]{2})(\/|$)/)
            if (localeMatch && routing.locales.includes(localeMatch[1] as any)) {
                requestHeaders.set('x-portal-locale', localeMatch[1])
            }
            finalResponse = NextResponse.next({ request: { headers: requestHeaders } })
        }
    }

    // --- TRACKING SESSION COOKIE INJECTION ---
    let trackingId = request.cookies.get('tracking_session_id')?.value
    if (!trackingId) {
        trackingId = crypto.randomUUID()
    }
    
    // Always refresh the expiration so it acts as a sliding window (30 minutes)
    finalResponse.cookies.set('tracking_session_id', trackingId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 60, // 30 minutes
        path: '/'
    })

    return finalResponse;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}

