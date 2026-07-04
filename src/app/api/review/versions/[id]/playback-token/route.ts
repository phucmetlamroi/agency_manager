// [Review module P1.7] POST /api/review/versions/:id/playback-token (API-SPEC §2.9).
// Member-only. Mints 6h Mux signed tokens (playback/thumbnail/storyboard) for a READY
// video; the client appends ?token= to stream.mux.com / image.mux.com URLs.

import { NextRequest } from 'next/server'
import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getVersionPlaybackTokens } from '@/lib/review/upload-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    return apiJson(await getVersionPlaybackTokens(id))
})
