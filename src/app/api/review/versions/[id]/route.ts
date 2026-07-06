// [Review module P3.1] Delete one version from a stack (FR-C02). Deleting the last
// live version trashes the whole stack; deleting the head re-points currentVersionId.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { deleteVersion } from '@/lib/review/versions'

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await deleteVersion(id))
})
