import { NextResponse, userAgent } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt, encrypt, SESSION_MAX_AGE } from '@/lib/jwt'

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
    // [QĐ-13] Giữ payload đã decrypt để rolling-refresh ở cuối (re-issue khi còn <50% hạn).
    let sessionPayload: any = null

    // ── [Mobile P1 §2.2] DEVICE DETECTION — 1 nguồn chân lý ────────────────────
    // Ưu tiên 1: cookie `view-mode` (toggle thủ công qua toggleMobileView, maxAge 1 năm).
    // Ưu tiên 2: userAgent(req) — parser chính thức của next/server. QĐ-1: tablet +
    // undefined ⇒ 'desktop' (iPadOS 13+ giả UA desktop → tablet nhận desktop layout).
    // Set trên requestHeaders → finalResponse (§ "Response Assembly") forward tới layout.
    const viewMode = request.cookies.get('view-mode')?.value
    let deviceType: 'mobile' | 'desktop'
    if (viewMode === 'mobile' || viewMode === 'desktop') {
        deviceType = viewMode
    } else {
        const { device } = userAgent(request)
        deviceType = device.type === 'mobile' ? 'mobile' : 'desktop'
    }
    requestHeaders.set('x-device-type', deviceType)
    // ───────────────────────────────────────────────────────────────────────────

    // 1.5. Block Deprecated Paths (Phase 1)
    if (pathname.startsWith('/download') || pathname.startsWith('/extract')) {
        return NextResponse.rewrite(new URL('/404', request.url))
    }

    // 1.6. [Canonical Clients] /share/[token] is INTENTIONALLY PUBLIC —
    // the 256-bit token in the URL is the credential (verified server-side
    // by resolveShareToken with hash-at-rest + rate limit + uniform 404).
    // Early-return so neither the session guard nor a logged-in user's
    // role-isolation redirects can interfere with a client opening a link.
    // X-Robots-Tag backstops the page-level noindex metadata.
    if (pathname.startsWith('/share')) {
        const res = NextResponse.next()
        res.headers.set('X-Robots-Tag', 'noindex, nofollow')
        res.headers.set('Referrer-Policy', 'no-referrer')
        return res
    }

    // 1.7. [Review module] /r/[slug] is the PUBLIC guest review page (Q10 —
    // docs/review-module). Same public treatment as /share: slug is an opaque
    // address; real access control (password/expiry/revoke) is resolved
    // server-side by resolveShare() in the page/API layer (Edge has no Prisma).
    // Middleware only sets a request id for log correlation + anti-index headers.
    if (pathname.startsWith('/r/')) {
        const res = NextResponse.next()
        res.headers.set('X-Robots-Tag', 'noindex, nofollow')
        res.headers.set('Referrer-Policy', 'no-referrer')
        res.headers.set('x-request-id', crypto.randomUUID())
        return res
    }

    // 2. Auth Guard ONLY
    if (!sessionCookie) {
        const protectedPaths = ['/admin', '/dashboard']
        if (protectedPaths.some(p => pathname.startsWith(p))) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    } else {
        try {
            const session = await decrypt(sessionCookie.value)
            if (!session?.user) throw new Error('Invalid session')
            sessionPayload = session

            const role = session.user.role;

            // [Canonical Clients] The account-based client portal was removed —
            // clients access via public /share/[token] links now. Leftover
            // CLIENT sessions (accounts get LOCKED by the deactivate script)
            // have nowhere to go: keep them out of staff surfaces.
            if (role === 'CLIENT' && !pathname.startsWith('/api') && pathname !== '/login') {
                return NextResponse.redirect(new URL('/login', request.url));
            }

            // VERCEL FIX 4: CHECK EMBEDDED PROFILE ID
            // If they are trying to access a workspace or admin panel but haven't selected a profile
            const requiresProfilePaths = ['/admin', '/dashboard'];
            if (requiresProfilePaths.some(p => pathname.startsWith(p))) {
                if (!session.user.sessionProfileId) {
                    console.log(`[Middleware] Missing sessionProfileId for path ${pathname}. Redirecting to /login`);
                    return NextResponse.redirect(new URL('/login', request.url))
                }
            }
        } catch (err) {
            const name = (err as Error)?.name
            console.error('[Middleware] Session decrypt error for path', pathname, name);
            // [Rủi ro #5] GIỮ cookie CHỈ khi lỗi có thể TRANSIENT — secret rotate chưa đồng bộ
            // trên Edge (JWSSignatureVerificationFailed). Token hết hạn/hỏng THẬT (JWTExpired,
            // JWSInvalid, JWTInvalid…) → XÓA cookie, nếu không cookie chết còn nguyên sẽ gây
            // LOOP redirect vô hạn (trang bảo vệ → /login → /login cũng qua middleware → …).
            const transient = name === 'JWSSignatureVerificationFailed'
            // Trang KHÔNG bảo vệ (vd /login, /signup) phải được render — chỉ dọn cookie hỏng
            // rồi next(), KHÔNG redirect (redirect /login khi đang ở /login = loop).
            const protectedPaths = ['/admin', '/dashboard']
            if (!protectedPaths.some(p => pathname.startsWith(p))) {
                const res = NextResponse.next()
                if (!transient) res.cookies.delete('session')
                return res
            }
            const loginUrl = new URL('/login', request.url)
            loginUrl.searchParams.set('next', pathname) // pathname-only → không open-redirect
            const res = NextResponse.redirect(loginUrl)
            if (!transient) res.cookies.delete('session')
            return res
        }
    }

    // 3. Response Assembly
    // [Canonical Clients] portal i18n rewrite removed with the account portal.
    const finalResponse: NextResponse = NextResponse.next({ request: { headers: requestHeaders } })

    const trackingId = request.cookies.get('tracking_session_id')?.value || crypto.randomUUID()
    finalResponse.cookies.set('tracking_session_id', trackingId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 60,
        path: '/'
    })

    // [QĐ-13] Rolling refresh (jose — Edge-compatible): re-issue cookie session khi token
    // còn <50% hạn (còn <15 ngày) → user active không bao giờ hết hạn giữa phiên (sliding
    // window). BỎ QUA session impersonation — giữ nguyên TTL 2h của nó, tránh vô tình gia
    // hạn phiên đóng-vai admin lên 30 ngày.
    // ⚠️ Thu hồi phiên (force-logout / đổi mật khẩu → bump sessionVersion) KHÔNG enforce ở
    // đây: Edge không có DB. Cổng thu hồi THẬT là verifyActiveSession() (src/lib/security.ts)
    // so sessionVersion(JWT) vs DB ở tầng DAL — refresh chỉ gia hạn cookie, DAL vẫn chặn data.
    if (sessionPayload?.user && !sessionPayload.user.isImpersonating) {
        const msLeft = ((sessionPayload.exp ?? 0) * 1000) - Date.now()
        if (msLeft > 0 && msLeft < (SESSION_MAX_AGE * 1000) / 2) {
            // Giữ parity với login(): kèm claim `expires` (consumer /api/profile/select đọc nó)
            // + copy nguyên `user` (role/sessionVersion/sessionProfileId… đều còn).
            const fresh = await encrypt(
                { user: sessionPayload.user, expires: new Date(Date.now() + SESSION_MAX_AGE * 1000) },
                `${SESSION_MAX_AGE}s`,
            )
            finalResponse.cookies.set('session', fresh, {
                maxAge: SESSION_MAX_AGE,
                httpOnly: true,
                // Khớp secure của auth.ts (Electron desktop chạy http → không đặt secure).
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
            })
        }
    }

    return finalResponse;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
