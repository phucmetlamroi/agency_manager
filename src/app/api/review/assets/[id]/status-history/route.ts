// [Review module P6.4 / FR-G04] GET /api/review/assets/:id/status-history —
// the "Lịch sử trạng thái" list for the player's Thông tin tab. Member-only.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getAssetStatusHistory } from '@/lib/review/status-history'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withReviewRoute<Ctx>(async (_req, { params }) => {
    const { id } = await params
    return apiJson(await getAssetStatusHistory(id))
})
