// [Review module P5.1] POST /api/review/shares (create, API-SPEC §5.1)
//                      GET  /api/review/shares?workspaceId=&taskId=&assetId=&state=&limit=&cursor= (§5.2)
// Member-only. Creation validates items live + same-workspace; USER listing is
// scoped to own links + links on their assigned tasks (ADMIN sees all).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { createShareLink, listShares, type ShareState } from '@/lib/review/shares'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z
    .object({
        workspaceId: z.string().min(1),
        items: z
            .array(z.object({ type: z.enum(['asset', 'folder']), id: z.string().min(1) }))
            .min(1)
            .max(20),
        name: z.string().max(200).optional(),
        allowComments: z.boolean().optional(),
        allowDownload: z.boolean().optional(),
        downloadOnlyWhenApproved: z.boolean().optional(),
        showAllVersions: z.boolean().optional(),
        password: z.string().max(200).nullable().optional(),
        expiresAt: z.string().nullable().optional(),
    })
    .strict()

export const POST = withReviewRoute(async (req: NextRequest) => {
    const parsed = await parseBody(req, createSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await createShareLink(parsed.data), { status: 201 })
})

export const GET = withReviewRoute(async (req: NextRequest) => {
    const sp = new URL(req.url).searchParams
    const workspaceId = sp.get('workspaceId')
    if (!workspaceId) return apiError(400, 'VALIDATION_ERROR', 'Thiếu workspaceId.')
    const state = sp.get('state')
    if (state && !['active', 'revoked', 'expired'].includes(state)) {
        return apiError(400, 'VALIDATION_ERROR', 'state phải là active|revoked|expired.')
    }
    return apiJson(
        await listShares({
            workspaceId,
            taskId: sp.get('taskId') ?? undefined,
            assetId: sp.get('assetId') ?? undefined,
            state: (state as ShareState | null) ?? undefined,
            limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
            cursor: sp.get('cursor') ?? undefined,
        }),
    )
})
