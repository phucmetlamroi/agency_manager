// [Review module P2.1] Folder detail + breadcrumb (§1.2) / rename (§1.5).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { getFolder, renameFolder } from '@/lib/review/folders'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withReviewRoute<Ctx>(async (_req, { params }) => {
    const { id } = await params
    return apiJson(await getFolder(id))
})

const RenameSchema = z.object({
    name: z.string().min(1).max(255),
    expectedRowVersion: z.number().int().min(0),
})

export const PATCH = withReviewRoute<Ctx>(async (req, { params }) => {
    const { id } = await params
    const parsed = await parseBody(req, RenameSchema)
    if (!parsed.ok) return parsed.res
    const folder = await renameFolder(id, parsed.data)
    return apiJson({ folder })
})
