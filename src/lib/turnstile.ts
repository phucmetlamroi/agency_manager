/**
 * Auth Phase 3 — Cloudflare Turnstile server-side verification.
 *
 * Turnstile flow:
 *   1. Client renders widget với SITE_KEY (public)
 *   2. User passes challenge (invisible mode tự động)
 *   3. Widget cấp token (300s TTL, single-use)
 *   4. Client gửi token kèm form
 *   5. Server gọi siteverify với SECRET_KEY → confirm
 *
 * Theo official Cloudflare docs:
 *   - "Each token is valid for 300 seconds (5 minutes) after generation"
 *   - "Tokens are single-use. A replayed token will be rejected with timeout-or-duplicate"
 *
 * Fail-open trong dev (không có TURNSTILE_SECRET_KEY) — tránh block local development.
 * Production deploy MUST set TURNSTILE_SECRET_KEY.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileVerifyResult = {
    success: boolean
    errorCodes?: string[]
    challenge_ts?: string
    hostname?: string
}

/**
 * Verify Turnstile token với Cloudflare siteverify API.
 *
 * @param token Token từ client widget.
 * @param remoteip IP của client (best-effort — không bắt buộc).
 * @returns success=true nếu token valid; success=false với errorCodes nếu fail.
 *
 * Fail-open trong dev environment để không block local testing.
 */
export async function verifyTurnstileToken(token: string, remoteip?: string): Promise<TurnstileVerifyResult> {
    const secret = process.env.TURNSTILE_SECRET_KEY

    // Dev fallback: nếu chưa configure, return success
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[turnstile] TURNSTILE_SECRET_KEY missing in production!')
            return { success: false, errorCodes: ['missing-secret-key'] }
        }
        console.warn('[turnstile] secret not configured — bypassing verification in dev.')
        return { success: true }
    }

    if (!token || typeof token !== 'string') {
        return { success: false, errorCodes: ['missing-input-response'] }
    }

    const formData = new URLSearchParams()
    formData.set('secret', secret)
    formData.set('response', token)
    if (remoteip) formData.set('remoteip', remoteip)

    try {
        const res = await fetch(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
            // Timeout 5s
            signal: AbortSignal.timeout(5000),
        })

        if (!res.ok) {
            console.error(`[turnstile] siteverify returned HTTP ${res.status}`)
            return { success: false, errorCodes: [`http-${res.status}`] }
        }

        const data: any = await res.json()

        // C3 fix: validate hostname để ngăn cross-site token replay.
        // Nếu attacker dùng cùng site key trên domain khác (vd test env), they could
        // get a valid token và submit lại đây. Hostname check ngăn việc đó.
        const expectedHostname = (() => {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
            try {
                return new URL(appUrl).hostname
            } catch {
                return null
            }
        })()
        if (expectedHostname && data.hostname && data.hostname !== expectedHostname) {
            console.warn(`[turnstile] hostname mismatch: expected=${expectedHostname} got=${data.hostname}`)
            return { success: false, errorCodes: ['hostname-mismatch'] }
        }

        return {
            success: !!data.success,
            errorCodes: data['error-codes'],
            challenge_ts: data.challenge_ts,
            hostname: data.hostname,
        }
    } catch (err: any) {
        console.error('[turnstile] verify error:', err?.message ?? err)
        return { success: false, errorCodes: ['network-error'] }
    }
}
