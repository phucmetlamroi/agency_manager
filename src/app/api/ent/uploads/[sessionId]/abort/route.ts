// [Giải trí] POST /api/ent/uploads/:sessionId/abort — huỷ giữa chừng
// (đóng multipart để R2 thôi giữ phần đã ghi). Idempotent.

import { NextRequest } from 'next/server'
import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { requireEntSession } from '@/lib/ent/auth'
import { abortEntUpload } from '@/lib/ent/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ sessionId: string }> }

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies, { role: 'ENT_ADMIN' })
    const { sessionId } = await params
    return apiJson(await abortEntUpload(sessionId))
})
