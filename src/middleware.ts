import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth'

import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

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

        // Redirect logged in user away from login page to Workspace portal
        if (request.nextUrl.pathname === '/login') {
            return NextResponse.redirect(new URL('/workspaces', request.url))
        }

        // If trying to access exactly root '/', push to workspaces
        if (request.nextUrl.pathname === '/') {
            return NextResponse.redirect(new URL('/workspaces', request.url))
        }

        // ReBAC Security: Isolate CLIENT role
        if (role === 'CLIENT') {
            // If they are trying to access admin, finance, dashboard, queue, etc.
            if (request.nextUrl.pathname.includes('/admin') ||
                request.nextUrl.pathname.includes('/dashboard') ||
                request.nextUrl.pathname.includes('/agency')) {
                // Redirect to their portal or workspace selection
                const isWorkspaceRoute = request.nextUrl.pathname.match(/^\/([^/]+)\//)
                if (isWorkspaceRoute && isWorkspaceRoute[1] !== 'workspaces' && isWorkspaceRoute[1] !== 'portal' && !routing.locales.includes(isWorkspaceRoute[1] as any)) {
                    // Redirect to portal within that workspace, or general portal
                    // Since new Client Portal uses /portal, we just dump them to /portal
                    return NextResponse.redirect(new URL(`/portal`, request.url))
                }
                if (!request.nextUrl.pathname.includes('/portal')) {
                    return NextResponse.redirect(new URL('/portal', request.url))
                }
            }
        }

        // Apply i18n routing only to /portal paths 
        // (including /en/portal, /vi/portal, etc. or bare /portal)
        const isPortalRoute = request.nextUrl.pathname.includes('/portal') || routing.locales.some(loc => request.nextUrl.pathname.startsWith(`/${loc}`))
        if (isPortalRoute) {
            const intlResponse = intlMiddleware(request)
            // Preserve device headers
            intlResponse.headers.set('x-device-type', response.headers.get('x-device-type') || 'desktop')
            return intlResponse
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
