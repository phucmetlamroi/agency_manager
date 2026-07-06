// [Review module P4.1] POST (resolve / Mark as Complete) / DELETE (un-resolve) a
// comment (API-SPEC §4.5). Replies cannot be resolved individually (404).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { setResolved } from '@/lib/review/comments'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await setResolved(id, true))
})

export const DELETE = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await setResolved(id, false))
})
