// [Review module P3.2] Status dropdown options — the app's task-status list, read
// dynamically (FR-D01). Member-only.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { getReviewStatusOptions } from '@/lib/review/status'

export const GET = withReviewRoute(async () => {
    return apiJson(await getReviewStatusOptions())
})
