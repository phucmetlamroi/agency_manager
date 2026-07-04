// [Review module P1.2] POST /api/review/uploads/:uploadSessionId/complete
// (API-SPEC §2.2). CompleteMultipartUpload on R2, then image→READY / video→
// PROCESSING (+ Inngest review/upload.completed). Idempotent on re-call.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { completeUpload } from '@/lib/review/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CompleteSchema = z.object({
    parts: z
        .array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1) }))
        .optional(),
})

type Ctx = { params: Promise<{ uploadSessionId: string }> }

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { uploadSessionId } = await params
    const parsed = await parseBody(req, CompleteSchema)
    if (!parsed.ok) return parsed.res
    const result = await completeUpload(uploadSessionId, parsed.data.parts ?? [])
    return apiJson(result)
})
