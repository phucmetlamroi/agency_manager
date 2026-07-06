// [Review module P6.2] "Xóa vĩnh viễn" (Delete forever, FR-B13 [S]) — ADMIN-only
// immediate purge of trashed items: same Mux+R2+row teardown as the nightly cron.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { purgeItemsAuthorized } from '@/lib/review/purge'

const PurgeSchema = z.object({
    items: z
        .array(z.object({ type: z.enum(['folder', 'asset']), id: z.string().min(1) }))
        .min(1)
        .max(200),
})

export const POST = withReviewRoute(async (req) => {
    const parsed = await parseBody(req, PurgeSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await purgeItemsAuthorized(parsed.data))
})
