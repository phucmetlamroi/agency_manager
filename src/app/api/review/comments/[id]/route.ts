// [Review module P4.1] PATCH (edit body — author only) / DELETE (author OR admin)
// a comment (API-SPEC §4.3–4.4).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { editComment, deleteComment, editCommentSchema } from '@/lib/review/comments'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { id } = await params
    const parsed = await parseBody(req, editCommentSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await editComment(id, parsed.data.body))
})

export const DELETE = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await deleteComment(id))
})
