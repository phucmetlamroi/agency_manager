// [Review module P1.7] POST /api/review/versions/:id/download-url (API-SPEC §2.9).
// Member-only. Returns a short-lived presigned R2 GET of the original file for a READY
// version (internal download has no approval gate — that is guest-only, §5.5.7).

import { NextRequest } from 'next/server'
import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getVersionDownloadUrl } from '@/lib/review/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await getVersionDownloadUrl(id))
})
