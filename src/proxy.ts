import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // 1. Skip static assets and internal next.js paths
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.includes('.') ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next()
    }

    const sessionCookie = request.cookies.get('session')

    // 2. Redirect logic (Passive - minimize server-side computation in proxy)
    const isProtectedRoute =
        pathname.startsWith('/admin') ||
        pathname.startsWith('/dashboard') ||
        pathname.startsWith('/agency') ||
        pathname.startsWith('/workspaces') ||
        pathname.includes('/portal')

    if (!sessionCookie && isProtectedRoute && pathname !== '/login') {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
    }

    if (sessionCookie && (pathname === '/login' || pathname === '/')) {
        const workspacesUrl = new URL('/workspaces', request.url)
        return NextResponse.redirect(workspacesUrl)
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
    // Only apply to routes that need logic (better performance)
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
