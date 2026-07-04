// [Review module P2.4] POST /api/review/folders/batch — recreate a folder tree
// from a folder-upload's relative dir paths (webkitdirectory). Get-or-creates by
// name within each parent; returns { map: path→folderId } the client uses to place
// each file. Caps enforced in the service (≤250 folders, ≤10 levels).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { createFolderTree } from '@/lib/review/folders'

const BatchSchema = z.object({
    workspaceId: z.string().min(1),
    parentId: z.string().min(1).nullable(),
    paths: z.array(z.string().min(1).max(4096)).min(1).max(250),
})

export const POST = withReviewRoute(async (req) => {
    const parsed = await parseBody(req, BatchSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await createFolderTree(parsed.data))
})
