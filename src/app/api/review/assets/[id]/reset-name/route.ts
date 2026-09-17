// [owner request 2026-07-27] "Reset về tên Task" — put a deliverable's name back to its task title
// and hand it back to automatic sync. Authorization + the name-collision suffix live in the
// service; the route only resolves the id.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { resetAssetNameToTask } from '@/lib/review/folders'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req, { params }) => {
    const { id } = await params
    return apiJson({ asset: await resetAssetNameToTask(id) })
})
