// [foldering 2026-07-27] POST /api/review/folders/ungroup — "Bỏ thư mục".
// Lifts a folder's videos up to its parent and removes the empty wrapper. The manual inverse
// of the automatic grouping the task-upload path applies to a dropped SET.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { ungroupFolder } from '@/lib/review/folders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Schema = z.object({ folderId: z.string().min(1) })

export const POST = withReviewRoute(async (req: NextRequest) => {
    const parsed = await parseBody(req, Schema)
    if (!parsed.ok) return parsed.res
    const result = await ungroupFolder({ folderId: parsed.data.folderId })
    return apiJson(result)
})
