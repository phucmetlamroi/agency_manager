// [Giải trí] POST /api/ent/auth/verify-code — đổi mã lấy cookie phiên kho phim.
//
// Dò mã là toàn bộ mô hình đe doạ của route này, nên chặn theo HAI khoá:
//   • theo IP   — chặn một máy thử hàng loạt
//   • theo user — chặn kẻ đổi IP (VPN/4G) mà vẫn dùng một tài khoản
// Cả hai đều failClosed: bộ đếm hỏng thì TỪ CHỐI, không được âm thầm mở cửa.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { reviewLog } from '@/lib/review/logger'
import { consumeCodeAttempt } from '@/lib/ent/codes'
import { ENT_COOKIE, ENT_COOKIE_TTL_SEC, entCookieAttrs, signEntCookie } from '@/lib/ent/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ code: z.string().min(1).max(64) }).strict()

export const POST = withReviewRoute(async (req: NextRequest) => {
    const session = await getSession()
    if (!session?.user?.id) {
        throw apiError(401, 'UNAUTHORIZED', 'Cần đăng nhập trước khi nhập mã.')
    }
    const userId = session.user.id

    const [byIp, byUser] = await Promise.all([
        limitDb(`ent:code:${getClientIp(req)}`, 8, 900, { failClosed: true }),
        limitDb(`ent:code:u:${userId}`, 8, 900, { failClosed: true }),
    ])
    if (!byIp.success || !byUser.success) {
        return apiError(429, 'RATE_LIMITED', 'Bạn đã thử quá nhiều lần. Vui lòng đợi rồi thử lại.', {
            retryAfterSec: Math.max(byIp.retryAfterSec, byUser.retryAfterSec),
        })
    }

    const parsed = await parseBody(req, schema)
    if (!parsed.ok) return parsed.res

    const hit = await consumeCodeAttempt(parsed.data.code)
    if (!hit) {
        // Mã sai và mã đã thu hồi trả CÙNG một câu — nếu khác nhau thì màn này
        // thành máy dò xem mã nào từng tồn tại.
        reviewLog('warn', 'ent.code_fail', { userId })
        return apiError(403, 'FORBIDDEN', 'Mã không hợp lệ.')
    }

    const token = await signEntCookie(hit.codeId)
    const res = apiJson({ ok: true, role: hit.role })
    res.cookies.set(ENT_COOKIE, token, entCookieAttrs(ENT_COOKIE_TTL_SEC))
    reviewLog('info', 'ent.code_ok', { userId, role: hit.role })
    return res
})
