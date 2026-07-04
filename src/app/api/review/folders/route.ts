// [Review module P2.1] Create folder (API-SPEC §1.1).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { createFolder } from '@/lib/review/folders'

const CreateSchema = z.object({
    workspaceId: z.string().min(1),
    parentId: z.string().min(1).nullable(),
    name: z.string().optional(),
})

export const POST = withReviewRoute(async (req) => {
    const parsed = await parseBody(req, CreateSchema)
    if (!parsed.ok) return parsed.res
    const folder = await createFolder(parsed.data)
    return apiJson({ folder }, { status: 201 })
})
