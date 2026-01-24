import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth'

export async function middleware(request: NextRequest) {
    const sessionCookie = request.cookies.get('session')

    // 1. Check if session exists
    if (!sessionCookie) {
        // If trying to access protected routes, redirect to login
        if (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/dashboard')) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        return NextResponse.next()
    }

    // 2. Validate session
    try {
        const session = await decrypt(sessionCookie.value)
        const { role } = session.user

        // 3. Role-based protection - DELEGATED TO LAYOUTS
        // We do NOT check roles here because cookies can be stale. 
        // Layouts will check fresh DB data and redirect if needed.

        // Redirect logged in user away from login page
        if (request.nextUrl.pathname === '/login') {
            if (role === 'ADMIN') return NextResponse.redirect(new URL('/admin', request.url))
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }

        return NextResponse.next()

    } catch (error) {
        // Session invalid
        return NextResponse.redirect(new URL('/login', request.url))
    }
}

export const config = {
    matcher: ['/admin/:path*', '/dashboard/:path*', '/login'],
}
