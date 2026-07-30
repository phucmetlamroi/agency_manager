import { NextResponse } from 'next/server'

/**
 * Best-effort client-error reporting endpoint.
 *
 * Called by `app/global-error.tsx` whenever a client-side React tree crashes.
 * The payload is logged via console.error so it shows up in Vercel runtime
 * logs — gives us the actual error message + stack + URL + UA, replacing the
 * opaque "Application error: a client-side exception has occurred" generic
 * fallback.
 *
 * Trade-offs:
 *  - No auth required (errors must be reportable even on /login crash).
 *  - No persistence — just logs. Easier to query via Vercel MCP.
 *
 * [AUDIT SWEEP-2026-07-30 fix · P1-034] ĐÃ CÓ RATE-LIMIT. Chú thích cũ ("error spam is rare; if
 * abused later, add Upstash") là một dự đoán, không phải một chốt: endpoint unauth + không trần
 * nghĩa là bất kỳ ai bơm được vô hạn dòng log vào Vercel — mỗi bản ghi tốn phí ingest và làm nhiễu
 * đúng tín hiệu lỗi mà endpoint này sinh ra để thu. Chuỗi do người gọi kiểm soát cũng đi thẳng vào
 * log (log-injection / nhiễu điều tra).
 * Khoá theo IP, và CỐ Ý fail-OPEN (không `failClosed`): mục tiêu của endpoint là báo lỗi kể cả khi
 * hạ tầng đang có sự cố — chặn báo lỗi vì bộ đếm hỏng là đánh mất đúng lúc cần nhất.
 */
export async function POST(req: Request) {
    try {
        const { limitDb, getClientIp } = await import('@/lib/review/rate-limit-db')
        const ip = getClientIp(req)
        // Bỏ qua khi nền tảng không cho biết IP — gộp mọi khách vào một xô 'unknown' là tự tạo ra
        // chặn dịch vụ, đúng bài học đã ghi ở share-portal-actions.
        if (ip && ip !== 'unknown') {
            const rl = await limitDb(`client-error:${ip}`, 20, 60)
            if (!rl.success) {
                // 204 thay vì 429: đây là kênh best-effort, client không cần biết và không nên retry.
                return new NextResponse(null, { status: 204 })
            }
        }
        const body = await req.json().catch(() => ({}))
        const message = String(body?.message ?? '').slice(0, 500)
        const digest = String(body?.digest ?? '').slice(0, 64)
        const stack = String(body?.stack ?? '').slice(0, 2000)
        const url = String(body?.url ?? '').slice(0, 500)
        const userAgent = String(body?.userAgent ?? '').slice(0, 300)

        // Log structured payload — Vercel logs picks this up as "error" level
        console.error('[ClientError]', JSON.stringify({
            message,
            digest,
            stackPreview: stack.split('\n').slice(0, 6).join(' | '),
            url,
            userAgent,
            timestamp: new Date().toISOString(),
        }))

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[ClientError-LogEndpoint] failed:', err)
        return NextResponse.json({ ok: false }, { status: 500 })
    }
}
