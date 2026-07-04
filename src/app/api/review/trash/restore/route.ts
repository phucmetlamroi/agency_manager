// [Review module P2.1] Restore folders/assets from trash (§1.9). Unlimited restores;
// re-homes to workspace root when the original parent is gone (movedToRoot).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { restoreItems } from '@/lib/review/folders'

const RestoreSchema = z.object({
    items: z
        .array(z.object({ type: z.enum(['folder', 'asset']), id: z.string().min(1) }))
        .min(1)
        .max(200),
})

export const POST = withReviewRoute(async (req) => {
    const parsed = await parseBody(req, RestoreSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await restoreItems(parsed.data))
})
