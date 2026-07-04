// [Review module P1.2] POST /api/review/uploads/:uploadSessionId/abort
// (API-SPEC §2.3). AbortMultipartUpload on R2 + discard garbage version/asset.
// Idempotent: aborting an already-aborted (or already-gone) session is a no-op.

import { NextRequest } from 'next/server'
import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { abortUpload } from '@/lib/review/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ uploadSessionId: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { uploadSessionId } = await params
    const result = await abortUpload(uploadSessionId)
    return apiJson(result)
})
