// [Review module P3-B / FR-08] Admin closed the internal feedback session → flip the task
// A2 → A3 ('Đang sửa feedback (nội bộ)') + email the editor. Admin-only; guarded server-side.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { markFeedbackDone } from '@/lib/review/task-sync'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await markFeedbackDone(id))
})
