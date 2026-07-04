// [Review module P1.2] GET /api/review/uploads/:uploadSessionId (API-SPEC §2.4).
// Poll during uploading/processing (client polls 3s; stops on ready|failed).

import { NextRequest } from 'next/server'
import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getUploadStatus } from '@/lib/review/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ uploadSessionId: string }> }

export const GET = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { uploadSessionId } = await params
    const result = await getUploadStatus(uploadSessionId)
    return apiJson(result)
})
