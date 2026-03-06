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

    const sessionCookie = request.cookies.get('session')

    // 2. Redirect logic
    if (!sessionCookie) {
        const protectedPaths = ['/workspaces', '/portal', '/admin', '/dashboard', '/agency']
        const isProtectedRoute = protectedPaths.some(p => pathname.startsWith(p))

        if (isProtectedRoute && pathname !== '/login') {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    } else {
        // Logged in (has cookie)
        try {
            const session = await decrypt(sessionCookie.value)
            const role = session?.user?.role

            // If user is CLIENT but trying to access non-portal protected routes
            if (role === 'CLIENT') {
                const adminPaths = ['/workspaces', '/admin', '/dashboard', '/agency']
                if (adminPaths.some(p => pathname.startsWith(p))) {
                    return NextResponse.redirect(new URL('/portal', request.url))
                }
            } else {
                // If STAFF but trying to access /portal
                if (pathname.startsWith('/portal')) {
                    return NextResponse.redirect(new URL('/workspaces', request.url))
                }
            }

            if (pathname === '/login' || pathname === '/') {
                const target = role === 'CLIENT' ? '/portal' : '/workspaces'
                return NextResponse.redirect(new URL(target, request.url))
            }
        } catch (err) {
            // Invalid session - delete cookie and redirect to login
            const response = NextResponse.redirect(new URL('/login', request.url))
            response.cookies.delete('session')
            return response
        }
    }

    // 3. Internationalization for Portal index
    if (pathname === '/portal' || pathname === '/portal/') {
        return NextResponse.redirect(new URL(`/portal/${routing.defaultLocale}`, request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
