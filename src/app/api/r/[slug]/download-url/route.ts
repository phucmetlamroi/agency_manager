// [Review module P5.1] GET /api/r/:slug/download-url?versionId= (API-SPEC §5.5.7).
// THE guest-only approval gate (the internal §2.9 route has none):
//   allowDownload && (!downloadOnlyWhenApproved || version.reviewState === APPROVED)
// 15-min presigned R2 GET with attachment disposition; activity `downloaded`.

import { NextRequest } from 'next/server'
import { apiError, apiJson } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { assertVersionInShare, resolveShareAssets } from '@/lib/review/share-guest'
import { recordDownloaded } from '@/lib/review/share-tracking'
import { presignGetObject } from '@/lib/review/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOWNLOAD_TTL_SEC = 15 * 60

type Ctx = { params: Promise<{ slug: string }> }

export const GET = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:download:${slug}:${getClientIp(req)}`, 30, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    if (!share.allowDownload) throw apiError(403, 'FORBIDDEN', 'Downloads are not enabled for this link.')

    // versionId param; absent → the single asset's current version (spec default).
    let versionId = new URL(req.url).searchParams.get('versionId')
    if (!versionId) {
        const assets = await resolveShareAssets(share)
        if (assets.length !== 1 || !assets[0].currentVersionId) {
            throw apiError(400, 'VALIDATION_ERROR', 'versionId is required.')
        }
        versionId = assets[0].currentVersionId
    }

    const { version, asset } = await assertVersionInShare(share, versionId)
    if (share.downloadOnlyWhenApproved && version.reviewState !== 'APPROVED') {
        throw apiError(403, 'FORBIDDEN', 'Download unlocks after approval.')
    }
    if (version.pipelineStatus !== 'READY' || !version.r2Key) {
        throw apiError(409, 'STATE_INVALID', 'This file is not ready yet.')
    }

    const url = await presignGetObject(version.r2Key, {
        expiresIn: DOWNLOAD_TTL_SEC,
        downloadFileName: version.fileName,
    })
    const guest = await getGuestSession(share, req.cookies)
    await recordDownloaded(
        share,
        { assetId: asset.id, versionId: version.id, versionNumber: version.versionNumber },
        guest,
    )
    return apiJson({ url, fileName: version.fileName, expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SEC * 1000).toISOString() })
})
