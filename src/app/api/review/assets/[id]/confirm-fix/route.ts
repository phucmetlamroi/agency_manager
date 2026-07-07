// [Review module P3-B / FR-09] Editor confirmed the fix → flip A3 → A4 ('Đã sửa feedback
// (nội bộ)') on the internal round, or A6 → A7 on the client round + notify the manager.
// Admin OR the task assignee; predecessor-guarded server-side. The UI gates the button on
// unresolved-comment count == 0; the server only enforces the status predecessor.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { confirmFixDone } from '@/lib/review/task-sync'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await confirmFixDone(id))
})
