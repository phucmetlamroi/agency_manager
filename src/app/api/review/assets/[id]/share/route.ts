// [Review module P5.1] POST /api/review/assets/:id/share — "Copy link khách"
// (FR-A06 AC3): get-or-create the asset's primary ACTIVE share with defaults in
// one click. Returns { share, created }.

import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getOrCreatePrimaryShareForAsset } from '@/lib/review/shares'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req, { params }) => {
    const { id } = await params
    return apiJson(await getOrCreatePrimaryShareForAsset(id))
})
