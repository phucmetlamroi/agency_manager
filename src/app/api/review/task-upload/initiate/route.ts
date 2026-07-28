// [Review module P1.5] POST /api/review/task-upload/initiate (API-SPEC §6.1).
// The task-drawer "Up thẳng video" entry: resolves/creates the folder tree from
// the task, auto-versions onto the existing deliverable, then returns the §2.1
// presigned multipart response + { createdNewAsset, folderPath }.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { initiateTaskUpload } from '@/lib/review/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TaskInitiateSchema = z.object({
    taskId: z.string().min(1),
    fileName: z.string().min(1).max(255),
    sizeBytes: z.string().regex(/^\d+$/, 'sizeBytes phải là chuỗi số nguyên (BigInt string).'),
    mimeType: z.string().min(1).max(255),
    // [foldering 2026-07-27] How many files this single drop/pick contained. 1 (or absent) = a
    // cut/revision → flat + task-named + auto-versioned. >1 = a multi-hook set → grouped folder +
    // per-file asset names. Capped so a hostile client can't claim an absurd batch.
    batchSize: z.number().int().min(1).max(50).optional(),
    /** Uploader picked the deliverable to version, instead of letting the name matcher guess. */
    targetAssetId: z.string().min(1).optional(),
})

export const POST = withReviewRoute(async (req: NextRequest) => {
    const parsed = await parseBody(req, TaskInitiateSchema)
    if (!parsed.ok) return parsed.res
    const result = await initiateTaskUpload({
        taskId: parsed.data.taskId,
        fileName: parsed.data.fileName,
        sizeBytes: BigInt(parsed.data.sizeBytes),
        mimeType: parsed.data.mimeType,
        batchSize: parsed.data.batchSize,
        idempotencyKey: req.headers.get('idempotency-key'),
    })
    return apiJson(result.body, { status: result.status })
})
