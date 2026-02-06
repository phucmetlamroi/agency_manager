import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth'

export async function middleware(request: NextRequest) {
    const response = NextResponse.next()

    // --- DEVICE DETECTION LOGIC ---
    const url = request.nextUrl

    // Skip static files/api for detection optimization (already in matcher but good safety)
    if (!url.pathname.startsWith('/api') && !url.pathname.startsWith('/_next')) {
        let deviceType = 'desktop'

        // 1. Check Cookie Override
        const viewModeCookie = request.cookies.get('view-mode')

        if (viewModeCookie?.value === 'desktop') {
            deviceType = 'desktop'
        } else if (viewModeCookie?.value === 'mobile') {
            deviceType = 'mobile'
        } else {
            // 2. Check User-Agent
            const userAgent = request.headers.get('user-agent') || ''
            // Expanded Mobile Regex
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
            deviceType = isMobile ? 'mobile' : 'desktop'
        }

        // 3. Set Headers
        response.headers.set('x-device-type', deviceType)
        response.headers.set('Vary', 'User-Agent')
    }
    // -----------------------------

    const sessionCookie = request.cookies.get('session')

    // 1. Check if session exists
    if (!sessionCookie) {
        // If trying to access protected routes, redirect to login
        if (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/agency')) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        // Return the response with device headers
        return response
    }

    // 2. Validate session
    try {
        const session = await decrypt(sessionCookie.value)
        const { role } = session.user

        // Redirect logged in user away from login page
        if (request.nextUrl.pathname === '/login') {
            if (role === 'ADMIN') return NextResponse.redirect(new URL('/admin', request.url))
            if (role === 'AGENCY_ADMIN') return NextResponse.redirect(new URL('/agency', request.url))
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }

        return response

    } catch (error) {
        // Session invalid
        if (request.nextUrl.pathname === '/login') {
            const logoutResponse = NextResponse.next()
            logoutResponse.cookies.delete('session')
            // Preserve device headers
            logoutResponse.headers.set('x-device-type', response.headers.get('x-device-type') || 'desktop')
            return logoutResponse
        }

        const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
        redirectResponse.cookies.delete('session')
        return redirectResponse
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}
