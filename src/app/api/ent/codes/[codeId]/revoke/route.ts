// [Giải trí] Thu hồi một mã. Có hiệu lực NGAY ở request kế tiếp của người đang
// cầm mã (cookie chỉ mang codeId, vai trò đọc lại từ DB mỗi lần — xem ent/auth.ts).

import { NextRequest } from 'next/server'
import { apiError, apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { verifyActiveSession } from '@/lib/security'
import { revokeEntCode } from '@/lib/ent/codes'
import { reviewLog } from '@/lib/review/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ codeId: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { status, dbUser } = await verifyActiveSession()
    if (status !== 'active' || !dbUser) throw apiError(401, 'UNAUTHORIZED', 'Cần đăng nhập.')
    if (dbUser.role !== 'ADMIN') throw apiError(403, 'FORBIDDEN', 'Chỉ quản trị hệ thống mới thu hồi được mã.')

    const { codeId } = await params
    const changed = await revokeEntCode(codeId)
    if (changed) reviewLog('info', 'ent.code.revoked', { codeId, by: dbUser.id })
    return apiJson({ revoked: true, changed })
})
