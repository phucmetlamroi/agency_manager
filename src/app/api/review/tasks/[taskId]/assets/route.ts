// [Review module P1.10] GET /api/review/tasks/:taskId/assets (API-SPEC §6.2).
// Powers the task-drawer BÀN GIAO block: the deliverable card list (polled 3s
// while a version is uploading/processing) + the confirm-strip upload context.
// force-dynamic + no-store: the card lifecycle must reflect the latest pipeline row.

import { NextRequest } from 'next/server'
import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getTaskAssets } from '@/lib/review/task-assets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ taskId: string }> }

export const GET = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { taskId } = await params
    const result = await getTaskAssets(taskId)
    return apiJson(result)
})
