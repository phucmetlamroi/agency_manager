import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

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

    // 2. Ultra-Light Redirect logic (NO DECRYPTION)
    // This prevents any crypto-related hangs in the middleware hot-path
    if (!sessionCookie) {
        const protectedPaths = ['/workspaces', '/portal', '/admin', '/dashboard', '/agency']
        const isProtectedRoute = protectedPaths.some(p => pathname.startsWith(p))

        if (isProtectedRoute && pathname !== '/login') {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    } else {
        // Logged in (has cookie)
        if (pathname === '/login' || pathname === '/') {
            // Passive redirect - if they have a cookie, push to workspaces
            return NextResponse.redirect(new URL('/workspaces', request.url))
        }
    }

    // 3. Internationalization for Portal
    if (pathname === '/portal' || pathname === '/portal/') {
        return NextResponse.redirect(new URL(`/portal/${routing.defaultLocale}/invoices`, request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
