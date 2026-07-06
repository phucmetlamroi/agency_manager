// [Review module P3.1] List a stack's versions (Manage Versions modal, §3).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { listVersions } from '@/lib/review/versions'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await listVersions(id))
})
