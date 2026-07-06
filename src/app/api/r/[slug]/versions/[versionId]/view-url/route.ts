// [Review module P5.3] GET /api/r/:slug/versions/:versionId/view-url — DISPLAY
// URL for an IMAGE asset (the image twin of the video playback token). This is
// NOT the download route: it serves inline (no attachment disposition) and is
// NOT gated by allowDownload — viewing the shared image IS the product, exactly
// like HLS playback for a video. Videos 404 here (their original stays behind
// the download gate).

import { NextRequest } from 'next/server'
import { apiError, apiJson } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { requireShare } from '@/lib/review/share-auth'
import { assertVersionInShare } from '@/lib/review/share-guest'
import { presignGetObject } from '@/lib/review/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; versionId: string }> }

export const GET = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug, versionId } = await params
    const rl = await limitDb(`r:view-url:${slug}:${getClientIp(req)}`, 60, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const { version, asset } = await assertVersionInShare(share, versionId)
    if (asset.mediaKind !== 'IMAGE') throw apiError(404, 'NOT_FOUND', 'Not found.')
    if (version.pipelineStatus !== 'READY' || !version.r2Key) {
        throw apiError(409, 'STATE_INVALID', 'This file is not ready yet.')
    }
    const url = await presignGetObject(version.r2Key, { expiresIn: 15 * 60 })
    return apiJson({ url, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
})
