// [Review module P2.5] Asset rename (§1.5 — display name only, never a version's fileName).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { renameAsset } from '@/lib/review/folders'

type Ctx = { params: Promise<{ id: string }> }

const RenameSchema = z.object({
    name: z.string().min(1).max(255),
    expectedRowVersion: z.number().int().min(0),
})

export const PATCH = withReviewRoute<Ctx>(async (req, { params }) => {
    const { id } = await params
    const parsed = await parseBody(req, RenameSchema)
    if (!parsed.ok) return parsed.res
    const asset = await renameAsset(id, parsed.data)
    return apiJson({ asset })
})
