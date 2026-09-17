// [Giải trí] POST /api/ent/uploads/:sessionId/complete — chốt multipart trên R2
// rồi đẩy việc tạo asset Mux sang Inngest.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { requireEntSession } from '@/lib/ent/auth'
import { completeEntUpload } from '@/lib/ent/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ sessionId: string }> }

const schema = z
    .object({
        parts: z
            .array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1).max(200) }))
            .max(10_000)
            .default([]),
    })
    .strict()

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies, { role: 'ENT_ADMIN' })
    const { sessionId } = await params

    const parsed = await parseBody(req, schema)
    if (!parsed.ok) return parsed.res

    const result = await completeEntUpload(sessionId, parsed.data.parts ?? [])
    return apiJson(result)
})
