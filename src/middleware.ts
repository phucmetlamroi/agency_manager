import { NextResponse, userAgent } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt, encrypt, SESSION_MAX_AGE, SESSION_ABSOLUTE_MAX_AGE } from '@/lib/jwt'

/**
 * [AUDIT SWEEP-2026-07-30 fix · NEW-middleware-protected-prefix-never-matches]
 *
 * Vị từ cũ là `['/admin','/dashboard'].some(p => pathname.startsWith(p))` — và nó KHÔNG BAO GIỜ KHỚP,
 * vì mọi route thật đều có dạng `/{workspaceId}/admin|dashboard`. Tức cổng "chưa đăng nhập thì đá về
 * /login" của middleware chưa từng chạy cho đúng những trang nó định bảo vệ.
 *
 * Hệ quả chỉ là PHÒNG THỦ CHIỀU SÂU (đúng mức Low): layout vẫn gác việc render và mọi server action
 * thật đều tự gác — nên đây là một lớp lưới rách, không phải cửa mở.
 *
 * Đã kiểm các path KHÔNG được khớp để không tạo vòng lặp redirect: `/login`, `/signup`, `/welcome`,
 * `/account`, `/legal`, `/forgot-password`, `/portal-notify`, `/diagnostic` đều là một đoạn, hoặc
 * đoạn thứ hai không thuộc nhóm. `/share` và `/r/` đã return sớm ở trên.
 */
const PROTECTED_SEG = /^\/[^/]+\/(admin|dashboard|team|mc)(\/|$)/

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
        const protectedPaths = PROTECTED_SEG
        if (protectedPaths.test(pathname)) {
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
            // ⚠️ [AUDIT SWEEP-2026-07-30] VỊ TỪ NÀY CŨNG KHÔNG BAO GIỜ KHỚP — VÀ CỐ Ý ĐỂ NGUYÊN.
            // Sửa nó cho "khớp thật" sẽ HỒI SINH một lỗi UX đã bị xoá có chủ đích: `layout.tsx`
            // ([Z+1.fix3]) ghi rõ hành vi "sessionProfileId null → redirect /login" từng làm sập
            // trải nghiệm của người dùng cũ, và đã được thay bằng backfill profileId từ ProfileAccess
            // đầu tiên. Middleware chạy ở Edge, KHÔNG có DB để backfill — nên làm nó khớp thật là đá
            // mọi phiên legacy về /login vĩnh viễn. Chỉ vá hai nhánh cổng đăng nhập (:72, :111).
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
            const protectedPaths = PROTECTED_SEG
            if (!protectedPaths.test(pathname)) {
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
        // [AUDIT SWEEP-2026-07-30 fix · N8] HẠN TUYỆT ĐỐI. Vòng gia hạn ở đây trước kia KHÔNG có
        // điểm dừng: nó chép nguyên `sessionPayload.user` (gồm cả sessionVersion CŨ) vào cookie 30
        // ngày mới, và không đọc DB được vì đây là Edge. Nên một chuỗi JWT bị đánh cắp chỉ cần được
        // dùng GET một trang không-API mỗi <15 ngày là sống mãi — kể cả sau khi nạn nhân đã bấm
        // "đăng xuất mọi thiết bị" (thao tác đó bump sessionVersion, và cổng đó chỉ chặn DỮ LIỆU ở
        // tầng DAL, không chặn việc cookie tự gia hạn).
        // Nay chặn theo `authAt` — mốc đăng nhập thật. Token cũ chưa có claim này ⇒ `?? 0` ⇒ hiệu số
        // rất lớn ⇒ không gia hạn ⇒ tự rụng trong ≤30 ngày. Đó là hành vi MONG MUỐN, không phải lỗi.
        const sessionAge = Date.now() - (sessionPayload.user.authAt ?? 0)
        const withinAbsoluteWindow = sessionAge < SESSION_ABSOLUTE_MAX_AGE * 1000
        if (msLeft > 0 && msLeft < (SESSION_MAX_AGE * 1000) / 2 && withinAbsoluteWindow) {
            // [PHẢN BIỆN 2026-07-30 · R4-2] KẸP HẠN THEO NGÂN SÁCH TUYỆT ĐỐI CÒN LẠI.
            // `withinAbsoluteWindow` ở trên chỉ là ĐIỀU KIỆN VÀO. Nếu vẫn cấp trọn SESSION_MAX_AGE
            // thì một token gia hạn ở ngày thứ 89 sống tới ngày ~119 — trần thật là 120 ngày, không
            // phải 90 như hằng số và commit ghi. Người vận hành đọc con số đó để lập kế hoạch ứng
            // cứu, nên lệch 30 ngày là lệch thật, không phải chi tiết văn bản.
            const absRemainingSec = Math.floor(
                ((sessionPayload.user.authAt ?? 0) + SESSION_ABSOLUTE_MAX_AGE * 1000 - Date.now()) / 1000,
            )
            const ttlSec = Math.min(SESSION_MAX_AGE, absRemainingSec)
            if (ttlSec > 0) {
                // Giữ parity với login(): kèm claim `expires` (consumer /api/profile/select đọc nó)
                // + copy nguyên `user` (role/sessionVersion/sessionProfileId… đều còn).
                const fresh = await encrypt(
                    { user: sessionPayload.user, expires: new Date(Date.now() + ttlSec * 1000) },
                    `${ttlSec}s`,
                )
                finalResponse.cookies.set('session', fresh, {
                    maxAge: ttlSec,
                    httpOnly: true,
                    // Khớp secure của auth.ts (Electron desktop chạy http → không đặt secure).
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    path: '/',
                })
            }
        }
    }

    return finalResponse;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
