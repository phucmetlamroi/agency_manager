// [Review module P4.1] POST an emoji reaction to a comment (API-SPEC §4.6).
// Duplicate (user, comment, emoji) is an idempotent no-op.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { addReaction, reactionSchema } from '@/lib/review/comments'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { id } = await params
    const parsed = await parseBody(req, reactionSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await addReaction(id, parsed.data.emoji))
})
