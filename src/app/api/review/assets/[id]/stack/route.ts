// [Review module P3.1] Merge a source stack into THIS asset as its newest version(s)
// (FR-C01 path 2 — drag asset onto asset). Body: { sourceAssetId }. Path id = target.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { mergeStacks } from '@/lib/review/versions'

type Ctx = { params: Promise<{ id: string }> }

const MergeSchema = z.object({ sourceAssetId: z.string().min(1) })

export const POST = withReviewRoute<Ctx>(async (req, { params }) => {
    const { id } = await params
    const parsed = await parseBody(req, MergeSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await mergeStacks(parsed.data.sourceAssetId, id))
})
