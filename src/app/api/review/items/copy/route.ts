// [Review module P2.5] Copy / Duplicate folders + assets (copy-on-reference, §1.7).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { copyItems } from '@/lib/review/folders'

const CopySchema = z.object({
    items: z
        .array(z.object({ type: z.enum(['folder', 'asset']), id: z.string().min(1) }))
        .min(1)
        .max(200),
    targetFolderId: z.string().min(1).nullable(),
    duplicate: z.boolean().optional(),
})

export const POST = withReviewRoute(async (req) => {
    const parsed = await parseBody(req, CopySchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await copyItems(parsed.data))
})
