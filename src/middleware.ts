import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth'

import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
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

    // 2. Not Logged In
    if (!sessionCookie) {
        // Protected routes require login
        const isProtectedRoute =
            pathname.startsWith('/admin') ||
            pathname.startsWith('/dashboard') ||
            pathname.startsWith('/agency') ||
            pathname.startsWith('/workspaces') ||
            pathname.startsWith('/portal')

        if (isProtectedRoute) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        return applyDeviceHeaders(request, NextResponse.next())
    }

    // 3. Logged In
    try {
        const session = await decrypt(sessionCookie.value)
        const role = session?.user?.role

        if (!role) throw new Error('Invalid Session')

        // If at login page and already logged in, go to workspaces
        if (pathname === '/login') {
            return NextResponse.redirect(new URL('/workspaces', request.url))
        }

        // Handle exactly '/' -> go to workspaces
        if (pathname === '/') {
            return NextResponse.redirect(new URL('/workspaces', request.url))
        }

        // ReBAC: Restrict CLIENT role
        if (role === 'CLIENT') {
            const isAdminPath = pathname.includes('/admin') || pathname.includes('/dashboard') || pathname.includes('/agency')
            if (isAdminPath) {
                return NextResponse.redirect(new URL('/portal', request.url))
            }
        }

        // 4. i18n for Portal
        const isPortalRoute = pathname.includes('/portal') || routing.locales.some(loc => pathname.startsWith(`/${loc}`))
        if (isPortalRoute) {
            const intlResponse = intlMiddleware(request)
            return applyDeviceHeaders(request, intlResponse)
        }

        return applyDeviceHeaders(request, NextResponse.next())

    } catch (error) {
        // Session validation failed - clear it and go to login
        const response = pathname === '/login'
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
