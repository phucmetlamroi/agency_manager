// [Review module] Mux webhook receiver (KIEN-TRUC §5.2 + §8.4).
//
// Contract: read RAW body first (signature covers the exact bytes), verify
// HMAC ±5 minutes (fail closed 401), write the WebhookEvent ledger row
// (idempotent on Mux event id), fire the Inngest event, return 200 FAST.
// All heavy work happens inside Inngest steps — never in this request.

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { inngest, REVIEW_EVENTS } from '@/lib/review/inngest'
import { reviewLog } from '@/lib/review/logger'
import { ENT_EVENTS, parseEntPassthrough } from '@/lib/ent/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOLERANCE_SEC = 5 * 60

/**
 * Verify `Mux-Signature: t=<unix>,v1=<hex>` — HMAC-SHA256 over "{t}.{rawBody}"
 * with MUX_WEBHOOK_SECRET. Returns false (never throws) on any bad input.
 */
function verifyMuxSignature(rawBody: string, header: string | null): boolean {
    const secret = process.env.MUX_WEBHOOK_SECRET
    if (!secret || !header) return false
    try {
        const parts = Object.fromEntries(
            header.split(',').map((kv) => {
                const i = kv.indexOf('=')
                return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
            }),
        )
        const t = parts['t']
        const v1 = parts['v1']
        if (!t || !v1) return false

        const ageSec = Math.abs(Date.now() / 1000 - Number(t))
        if (!Number.isFinite(ageSec) || ageSec > TOLERANCE_SEC) return false

        const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
        const a = Buffer.from(expected, 'utf8')
        const b = Buffer.from(v1, 'utf8')
        if (a.length !== b.length) return false
        return timingSafeEqual(a, b)
    } catch {
        return false
    }
}

export async function POST(req: NextRequest) {
    const rawBody = await req.text()
    const sig = req.headers.get('mux-signature')

    if (!verifyMuxSignature(rawBody, sig)) {
        reviewLog('warn', 'webhook.mux.bad_signature', { hasSig: !!sig })
        // Fail closed — 401 so Mux marks the delivery failed (and retries).
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    let payload: any
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'bad json' }, { status: 400 })
    }

    const eventId: string | undefined = payload?.id
    const type: string = payload?.type ?? 'unknown'
    if (!eventId) return NextResponse.json({ ok: true }) // nothing to ledger

    // Ledger insert-or-ignore = replay/duplicate protection (FR-G04).
    let duplicated = false
    try {
        await prisma.webhookEvent.create({
            data: { id: eventId, provider: 'mux', type, payload },
        })
    } catch (e: any) {
        if (e?.code === 'P2002') duplicated = true // already ledgered — ack, don't refire
        else throw e
    }
    reviewLog('info', 'webhook.mux.received', { eventId, type, duplicated })

    if (!duplicated) {
        // [Giải trí 2026-08] Một tài khoản Mux phục vụ HAI module. Passthrough là thứ
        // duy nhất phân biệt: tiền tố `ent:` ⇒ kho phim, còn lại ⇒ module Tệp. Gửi nhầm
        // nhánh thì consumer kia không tìm thấy bản ghi, đánh dấu đã-xử-lý, và video
        // treo "đang xử lý" vĩnh viễn.
        const eventName = parseEntPassthrough(payload?.data?.passthrough)
            ? ENT_EVENTS.MUX_EVENT_RECEIVED
            : REVIEW_EVENTS.MUX_EVENT_RECEIVED
        // Fire-and-forget into Inngest; the ledger is the source of truth, so a
        // failed send is recovered by the reconcile job (P1) — never block the 200.
        try {
            await inngest.send({
                name: eventName,
                data: { webhookEventId: eventId, type },
            })
        } catch (e) {
            reviewLog('error', 'webhook.mux.inngest_send_failed', { eventId, error: String(e) })
        }
    }

    return NextResponse.json({ ok: true, duplicated })
}
