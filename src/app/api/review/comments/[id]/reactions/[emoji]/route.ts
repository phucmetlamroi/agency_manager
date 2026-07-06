// [Review module P4.1] DELETE the caller's own reaction of a given emoji (API-SPEC §4.6).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { removeReaction } from '@/lib/review/comments'

type Ctx = { params: Promise<{ id: string; emoji: string }> }

export const DELETE = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id, emoji } = await params
    return apiJson(await removeReaction(id, decodeURIComponent(emoji)))
})
