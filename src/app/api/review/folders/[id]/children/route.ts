// [Review module P2.1] List folder children + summary (§1.3). `:id = "root"`
// aliases the workspace root (requires ?workspaceId=).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, apiError } from '@/lib/review/errors'
import { listChildren, type SortField, type SortDir } from '@/lib/review/folders'

type Ctx = { params: Promise<{ id: string }> }

const SORTS: SortField[] = ['name', 'createdAt', 'status', 'duration', 'sizeBytes', 'uploader', 'commentCount']

export const GET = withReviewRoute<Ctx>(async (req, { params }) => {
    const { id } = await params
    const url = new URL(req.url)
    const rawSort = url.searchParams.get('sort')
    const sort: SortField = rawSort && SORTS.includes(rawSort as SortField) ? (rawSort as SortField) : 'createdAt'
    const dir: SortDir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
    const limitRaw = Number(url.searchParams.get('limit'))
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : undefined
    const cursor = url.searchParams.get('cursor')

    if (id === 'root') {
        const workspaceId = url.searchParams.get('workspaceId')
        if (!workspaceId) return apiError(400, 'VALIDATION_ERROR', 'Thiếu workspaceId.')
        return apiJson(await listChildren({ workspaceId, folderId: null, sort, dir, limit, cursor }))
    }
    return apiJson(await listChildren({ folderId: id, sort, dir, limit, cursor }))
})
