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
        } catch (err) {
            const res = NextResponse.redirect(new URL('/login', request.url))
            res.cookies.delete('session')
            res.cookies.delete('current_profile_id')
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
