import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'
import { decrypt } from '@/lib/jwt'

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

    // 2. Redirect logic
    if (!sessionCookie) {
        // Protected routes require login
        const protectedPaths = ['/workspaces', '/portal', '/admin', '/dashboard', '/agency']
        const isProtectedRoute = protectedPaths.some(p => pathname.startsWith(p))

        if (isProtectedRoute && pathname !== '/login') {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    } else {
        // Logged in
        if (pathname === '/login' || pathname === '/') {
            try {
                // IMPORTANT: Use the safe decrypt from @/lib/jwt
                await decrypt(sessionCookie.value)
                return NextResponse.redirect(new URL('/workspaces', request.url))
            } catch (error) {
                // Invalid cookie - clear it and stay on login
                const response = (pathname === '/login') ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url))
                response.cookies.delete('session')
                return response
            }
        }
    }

    // 3. Internationalization for Portal
    const isPortalRoute = pathname.includes('/portal') || routing.locales.some(loc => pathname.startsWith(`/${loc}`))
    if (isPortalRoute) {
        return intlMiddleware(request)
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
