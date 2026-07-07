// [Review module P3-B / FR-10-flip] Admin approved internally → flip the task → A5
// ('Đã gửi video (khách)') from A2/A4/A7. Admin-only; predecessor-guarded server-side.
// NOTE: the portal bridge (ShareLink + Task.clientReview='AWAITING' + guest email) is P4
// (BR-05 / FR-10-portal) and runs ONLY on this admin approve — never on Mux READY.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { approveInternalAndSendToClient } from '@/lib/review/task-sync'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await approveInternalAndSendToClient(id))
})
