// [Review module P2.1] Folder tree for the module sidebar (§1.4).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, apiError } from '@/lib/review/errors'
import { getFolderTree } from '@/lib/review/folders'

export const GET = withReviewRoute(async (req) => {
    const workspaceId = new URL(req.url).searchParams.get('workspaceId')
    if (!workspaceId) return apiError(400, 'VALIDATION_ERROR', 'Thiếu workspaceId.')
    return apiJson(await getFolderTree(workspaceId))
})
