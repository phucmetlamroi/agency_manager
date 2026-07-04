// [Review module P2.1] Soft-delete folders/assets → trash (single + multi, §1.8).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { deleteItems } from '@/lib/review/folders'

const DeleteSchema = z.object({
    items: z
        .array(z.object({ type: z.enum(['folder', 'asset']), id: z.string().min(1) }))
        .min(1)
        .max(200),
})

export const POST = withReviewRoute(async (req) => {
    const parsed = await parseBody(req, DeleteSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await deleteItems(parsed.data))
})
