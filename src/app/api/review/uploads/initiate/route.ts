// [Review module P1.2] POST /api/review/uploads/initiate (API-SPEC §2.1).
// Creates the asset/version + R2 multipart, returns presigned part URLs.
// Idempotency-Key header ⇒ safe network retry (same session, fresh URLs).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { initiateUpload } from '@/lib/review/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const InitiateSchema = z.object({
    fileName: z.string().min(1).max(255),
    sizeBytes: z.string().regex(/^\d+$/, 'sizeBytes phải là chuỗi số nguyên (BigInt string).'),
    mimeType: z.string().min(1).max(255),
    target: z.discriminatedUnion('kind', [
        z.object({
            kind: z.literal('folder'),
            folderId: z.string().min(1).nullable(),
            workspaceId: z.string().min(1),
        }),
        z.object({ kind: z.literal('asset'), assetId: z.string().min(1) }),
    ]),
})

export const POST = withReviewRoute(async (req: NextRequest) => {
    const parsed = await parseBody(req, InitiateSchema)
    if (!parsed.ok) return parsed.res
    const result = await initiateUpload({
        fileName: parsed.data.fileName,
        sizeBytes: BigInt(parsed.data.sizeBytes),
        mimeType: parsed.data.mimeType,
        target: parsed.data.target,
        idempotencyKey: req.headers.get('idempotency-key'),
    })
    return apiJson(result.body, { status: result.status })
})
