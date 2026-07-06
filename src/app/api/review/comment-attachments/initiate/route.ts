// [Review module P4.1] POST presign a comment image attachment (API-SPEC §4.2).
// Member-only; image/* ≤10MB. Returns a presigned R2 PUT the browser uploads to,
// then attaches `attachmentId` (+ metadata) when creating the comment.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { initiateAttachment, initiateAttachmentSchema } from '@/lib/review/comments'

export const POST = withReviewRoute(async (req: NextRequest) => {
    const parsed = await parseBody(req, initiateAttachmentSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await initiateAttachment(parsed.data), { status: 201 })
})
