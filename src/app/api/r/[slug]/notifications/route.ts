// [review-fixes P4/FR-11] GET /api/r/:slug/notifications?assetId= — the current guest's email
// subscription state for one asset (drives the Settings gear + banner UI). Own data only.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { apiError, apiJson } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { guestSubscriptionStatus } from '@/lib/review/guest-subscribe'

type Ctx = { params: Promise<{ slug: string }> }

export const GET = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)

    const assetId = new URL(req.url).searchParams.get('assetId')
    if (!assetId) return apiError(400, 'VALIDATION_ERROR', 'assetId is required.')

    return apiJson(await guestSubscriptionStatus({ guest, assetId }))
})
