// [Review module P2.1] Move folders/assets (single + multi, §1.6).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { moveItems } from '@/lib/review/folders'

const MoveSchema = z.object({
    items: z
        .array(
            z.object({
                type: z.enum(['folder', 'asset']),
                id: z.string().min(1),
                expectedRowVersion: z.number().int().min(0),
            }),
        )
        .min(1)
        .max(200),
    targetFolderId: z.string().min(1).nullable(),
})

export const POST = withReviewRoute(async (req) => {
    const parsed = await parseBody(req, MoveSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await moveItems(parsed.data))
})
