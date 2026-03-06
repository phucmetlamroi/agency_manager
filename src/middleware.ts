import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'
import { decrypt } from '@/lib/auth'

const intlMiddleware = createIntlMiddleware(routing)

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

    const sessionCookie = request.cookies.get('session')

    // 2. Redirect logic (Basic)
    if (!sessionCookie) {
        const isProtectedRoute =
            pathname.startsWith('/admin') ||
            pathname.startsWith('/dashboard') ||
            pathname.startsWith('/agency') ||
            pathname.startsWith('/workspaces') ||
            pathname.includes('/portal')

        if (isProtectedRoute && pathname !== '/login') {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    } else {
        // Logged in
        if (pathname === '/login' || pathname === '/') {
            return NextResponse.redirect(new URL('/workspaces', request.url))
        }

        // ReBAC for CLIENT role (optional check in middleware for faster redirect)
        // We can temporarily disable decryption here to avoid hangs
        /*
        try {
            const session = await decrypt(sessionCookie.value)
            if (session?.user?.role === 'CLIENT') {
                if (pathname.includes('/admin') || pathname.includes('/dashboard') || pathname.includes('/agency')) {
                    return NextResponse.redirect(new URL('/portal', request.url))
                }
            }
        } catch (e) {}
        */
    }

    // 3. Internationalization for Portal
    const isPortalRoute = pathname.includes('/portal') || routing.locales.some(loc => pathname.startsWith(`/${loc}`))
    if (isPortalRoute) {
        return intlMiddleware(request)
    }

    // Default: Continue
    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
