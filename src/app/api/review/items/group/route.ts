// [foldering 2026-07-27] POST /api/review/items/group — "Gộp thành thư mục".
// Puts the selected videos into a new folder beside them. Covers the case the upload path
// deliberately refuses to guess: a second hook arriving days later as its own single upload,
// a gesture that already means "next version" and so must never auto-group.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { groupAssetsIntoFolder } from '@/lib/review/folders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Schema = z.object({
    assetIds: z.array(z.string().min(1)).min(2).max(200),
    name: z.string().min(1).max(255),
})

export const POST = withReviewRoute(async (req: NextRequest) => {
    const parsed = await parseBody(req, Schema)
    if (!parsed.ok) return parsed.res
    const result = await groupAssetsIntoFolder({ assetIds: parsed.data.assetIds, name: parsed.data.name })
    return apiJson(result)
})
