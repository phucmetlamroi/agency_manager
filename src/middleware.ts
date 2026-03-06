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
        try {
            const session = await decrypt(sessionCookie.value)
            const role = session?.user?.role

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

            if (pathname === '/login' || pathname === '/') {
                const target = role === 'CLIENT' ? '/portal' : '/workspaces'
                return NextResponse.redirect(new URL(target, request.url))
            }
        } catch (err) {
            const response = NextResponse.redirect(new URL('/login', request.url))
            response.cookies.delete('session')
            return response
        }
    }

    // 3. Internationalization for Portal index
    if (pathname === '/portal' || pathname === '/portal/') {
        return NextResponse.redirect(new URL(`/portal/${routing.defaultLocale}`, request.url))
    }

    // 4. Inject locale header so i18n/request.ts can read the locale from URL
    //    URL pattern: /portal/[locale]/...
    const localeMatch = pathname.match(/^\/portal\/([a-z]{2})(\/|$)/)
    if (localeMatch && routing.locales.includes(localeMatch[1] as any)) {
        const requestHeaders = new Headers(request.headers)
        requestHeaders.set('x-portal-locale', localeMatch[1])
        return NextResponse.next({ request: { headers: requestHeaders } })
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}

