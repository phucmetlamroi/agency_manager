import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth'

import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const sessionCookie = request.cookies.get('session')

    // 1. Handle non-authenticated paths early
    if (!sessionCookie) {
        if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/agency')) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        return applyDeviceHeaders(request, NextResponse.next())
    }

    // 2. Validate session
    try {
        const session = await decrypt(sessionCookie.value)
        const { role } = session?.user || {}

        if (!role) {
            throw new Error('Invalid session payload')
        }

        // Redirect away from login if already logged in
        if (pathname === '/login' || pathname === '/') {
            return NextResponse.redirect(new URL('/workspaces', request.url))
        }

        // ReBAC for CLIENT role
        if (role === 'CLIENT') {
            const isProtected = pathname.includes('/admin') || pathname.includes('/dashboard') || pathname.includes('/agency')
            const isWorkspaceRoot = pathname === '/workspaces'

            if (isProtected) {
                // If they have a workspace context in URL, try to push to portal
                const isWorkspaceRoute = pathname.match(/^\/([^/]+)\//)
                if (isWorkspaceRoute && isWorkspaceRoute[1] !== 'workspaces' && isWorkspaceRoute[1] !== 'portal' && !routing.locales.includes(isWorkspaceRoute[1] as any)) {
                    return NextResponse.redirect(new URL(`/portal`, request.url))
                }
                return NextResponse.redirect(new URL('/portal', request.url))
            }
            // Clients are allowed at /workspaces to pick their entry point
        }

        // 3. Internationalization for Portal
        const isPortalRoute = pathname.includes('/portal') || routing.locales.some(loc => pathname.startsWith(`/${loc}`))
        if (isPortalRoute) {
            const intlResponse = intlMiddleware(request)
            return applyDeviceHeaders(request, intlResponse)
        }

        return applyDeviceHeaders(request, NextResponse.next())

    } catch (error) {
        // Clear session and redirect to login if something is wrong
        const response = (pathname === '/login')
            ? NextResponse.next()
            : NextResponse.redirect(new URL('/login', request.url))

        response.cookies.delete('session')
        return applyDeviceHeaders(request, response)
    }
}

function applyDeviceHeaders(request: NextRequest, response: NextResponse) {
    // Skip for binary/static files if hit
    if (request.nextUrl.pathname.includes('.')) return response

    let deviceType = 'desktop'
    const viewModeCookie = request.cookies.get('view-mode')

    if (viewModeCookie?.value === 'desktop') {
        deviceType = 'desktop'
    } else if (viewModeCookie?.value === 'mobile') {
        deviceType = 'mobile'
    } else {
        const userAgent = request.headers.get('user-agent') || ''
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
        deviceType = isMobile ? 'mobile' : 'desktop'
    }

    response.headers.set('x-device-type', deviceType)
    response.headers.set('Vary', 'User-Agent')
    return response
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
