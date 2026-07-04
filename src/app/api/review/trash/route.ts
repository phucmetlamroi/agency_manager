// [Review module P2.1] Recently Deleted list (30-day trash, §1.9).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, apiError } from '@/lib/review/errors'
import { listTrash } from '@/lib/review/folders'

export const GET = withReviewRoute(async (req) => {
    const url = new URL(req.url)
    const workspaceId = url.searchParams.get('workspaceId')
    if (!workspaceId) return apiError(400, 'VALIDATION_ERROR', 'Thiếu workspaceId.')
    const limitRaw = Number(url.searchParams.get('limit'))
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : undefined
    const cursor = url.searchParams.get('cursor')
    return apiJson(await listTrash({ workspaceId, limit, cursor }))
})
