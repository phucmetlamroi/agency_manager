// [Review module P3.3] Confirm "Chuyển task sang Hoàn tất" from the drawer banner
// (FR-D02). Delegates the task write (with its own RBAC + FSM) to updateTaskStatus.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { confirmTaskHoanTat } from '@/lib/review/task-sync'

type Ctx = { params: Promise<{ taskId: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { taskId } = await params
    return apiJson(await confirmTaskHoanTat(taskId))
})
