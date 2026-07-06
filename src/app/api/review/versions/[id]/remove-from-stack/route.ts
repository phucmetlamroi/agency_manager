// [Review module P3.1] Remove a version from its stack → new standalone asset in the
// same folder (FR-C03). Comments/annotations follow the version (they key off versionId).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { removeFromStack } from '@/lib/review/versions'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await removeFromStack(id))
})
