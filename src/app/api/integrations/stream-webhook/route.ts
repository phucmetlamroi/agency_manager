// [Video Review] Cloudflare Stream webhook receiver.
//
// Stream fires one account-level webhook when a video finishes processing (or
// errors). We HMAC-verify it, then backfill the matching VideoVersion row
// (ready flag + duration + thumbnail) and broadcast "new version available" so
// any open review page updates live. A single account webhook fans out by UID.
//
// Additive route — does not touch existing API logic (same pattern as the
// Velox scan-folder and Google-auth routes).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyStreamWebhookSignature } from '@/lib/cloudflare-stream'
import { broadcastReviewEvent, broadcastVersionLanded, REVIEW_EVENTS } from '@/lib/review-realtime'

// node:crypto (HMAC) + Prisma — must run on the Node.js runtime, not Edge.
export const runtime = 'nodejs'
// Never cache a webhook.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    // Raw body is required for signature verification — read it as text FIRST,
    // then JSON.parse ourselves (req.json() would consume the stream).
    const rawBody = await req.text()
    const sig = req.headers.get('webhook-signature')

    if (!verifyStreamWebhookSignature(rawBody, sig)) {
        // Fail closed. 401 so Cloudflare marks the delivery failed (and retries).
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    let payload: any
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'bad json' }, { status: 400 })
    }

    const uid: string | undefined = payload?.uid
    const state: string | undefined = payload?.status?.state
    if (!uid) return NextResponse.json({ ok: true }) // nothing to do

    // Find the version this UID belongs to (created at direct-upload time).
    const version = await prisma.videoVersion.findUnique({
        where: { streamUid: uid },
        select: { id: true, taskId: true, versionNumber: true },
    })
    // Unknown UID (e.g. a video uploaded outside this feature) — ack and ignore.
    if (!version) return NextResponse.json({ ok: true })

    if (state === 'ready') {
        const durationSec = typeof payload?.duration === 'number' ? payload.duration : undefined
        const thumbnailUrl = typeof payload?.thumbnail === 'string' ? payload.thumbnail : undefined
        await prisma.videoVersion.update({
            where: { id: version.id },
            data: {
                ready: true,
                ...(durationSec !== undefined ? { durationSec } : {}),
                ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
            },
        })
        // Live-notify the review room + the deliverable channel.
        broadcastReviewEvent(version.id, REVIEW_EVENTS.VERSION_NEW, {
            versionId: version.id,
            versionNumber: version.versionNumber,
            ready: true,
        })
        broadcastVersionLanded(version.taskId, {
            versionId: version.id,
            versionNumber: version.versionNumber,
        })
    } else if (state === 'error') {
        // Encoding failed — leave ready=false; surface via logs for now.
        console.error('[stream-webhook] encode error', {
            uid,
            versionId: version.id,
            reason: payload?.status?.errorReasonText ?? payload?.status?.errorReasonCode,
        })
    }

    return NextResponse.json({ ok: true })
}
