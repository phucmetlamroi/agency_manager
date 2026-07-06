// [Review module P2.5] Folder download manifest (§1.7 [S]) — list of the subtree's
// READY head versions (versionId + relative path). The client downloads each via
// POST /api/review/versions/:id/download-url (which re-checks access + presigns R2).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson } from '@/lib/review/errors'
import { getFolderManifest } from '@/lib/review/folders'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await getFolderManifest(id))
})
