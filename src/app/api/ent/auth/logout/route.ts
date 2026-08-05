// [Giải trí] POST /api/ent/auth/logout — bỏ cookie kho phim (máy dùng chung).
// Không đụng phiên đăng nhập HustlyTasker.

import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { ENT_COOKIE, entCookieAttrs } from '@/lib/ent/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withReviewRoute(async () => {
    const res = apiJson({ ok: true })
    res.cookies.set(ENT_COOKIE, '', entCookieAttrs(0))
    return res
})
