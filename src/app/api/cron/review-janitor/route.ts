// [Review module] Nightly janitor trigger (KIEN-TRUC §6.2).
// Vercel Cron hits this at 20:00 UTC (03:00 VN). The route ONLY checks the
// secret and fires one Inngest event — zero heavy work in the cron request
// (auth pattern mirrors the existing cron routes, e.g. cleanup-notifications).

import { NextResponse } from 'next/server'
import { inngest, REVIEW_EVENTS } from '@/lib/review/inngest'
import { reviewLog } from '@/lib/review/logger'
import { safeEqual } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization')
    const headerKey =
        request.headers.get('x-cron-secret') ||
        request.headers.get('x-cron-key') ||
        null
    const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const key = headerKey || bearerKey
    const secret = process.env.CRON_SECRET

    if (!secret) {
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }
    // [AUDIT SWEEP-2026-07-30 fix · CRON-TIMING] So theo thời-gian-hằng, helper dùng chung ở
    // @/lib/cron-auth. Phòng thủ chiều sâu — xem chú thích ở đó về mức độ thật.
    if (!safeEqual(key, secret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        await inngest.send({ name: REVIEW_EVENTS.JANITOR_REQUESTED, data: { firedAt: new Date().toISOString() } })
        reviewLog('info', 'cron.review_janitor.fired', {})
        return NextResponse.json({ success: true })
    } catch (e) {
        reviewLog('error', 'cron.review_janitor.failed', { error: String(e) })
        return NextResponse.json({ success: false, error: 'inngest send failed' }, { status: 502 })
    }
}
