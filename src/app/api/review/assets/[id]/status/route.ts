// [Review module P3.2] Set / clear an asset's card status (FR-D01). statusId=null clears
// ("Bỏ trạng thái"). Member-only; writes a ReviewActivity audit row.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { setAssetStatus } from '@/lib/review/status'

type Ctx = { params: Promise<{ id: string }> }

const StatusSchema = z.object({
    statusId: z.string().min(1).max(120).nullable(),
    expectedRowVersion: z.number().int().min(0).optional(),
})

export const PUT = withReviewRoute<Ctx>(async (req, { params }) => {
    const { id } = await params
    const parsed = await parseBody(req, StatusSchema)
    if (!parsed.ok) return parsed.res
    return apiJson({ asset: await setAssetStatus(id, parsed.data) })
})
