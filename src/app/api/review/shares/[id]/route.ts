// [Review module P5.1] GET /api/review/shares/:id (detail + latest activity, §5.2)
//                      PATCH (update options, creator|admin, optimistic-locked, §5.3)
//                      DELETE (hard delete, ADMIN only, §5.4)

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { deleteShare, getShareDetail, updateShareOptions } from '@/lib/review/shares'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z
    .object({
        name: z.string().max(200).optional(),
        allowComments: z.boolean().optional(),
        allowDownload: z.boolean().optional(),
        downloadOnlyWhenApproved: z.boolean().optional(),
        showAllVersions: z.boolean().optional(),
        password: z.string().max(200).nullable().optional(),
        expiresAt: z.string().nullable().optional(),
        expectedRowVersion: z.number().int().min(0),
    })
    .strict()

export const GET = withReviewRoute<Ctx>(async (_req, { params }) => {
    const { id } = await params
    return apiJson(await getShareDetail(id))
})

export const PATCH = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { id } = await params
    const parsed = await parseBody(req, patchSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await updateShareOptions(id, parsed.data))
})

export const DELETE = withReviewRoute<Ctx>(async (_req, { params }) => {
    const { id } = await params
    return apiJson(await deleteShare(id))
})
