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
 *  - Rate limit not applied — error spam is rare; if abused later, add Upstash.
 */
export async function POST(req: Request) {
    try {
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
