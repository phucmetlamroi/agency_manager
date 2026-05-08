/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Always returns 200 với generic message (anti-enumeration).
 * Rate-limited internally (3/email/h, 10/IP/h, 60s cooldown).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requestPasswordResetOtp } from '@/actions/password-reset-actions'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}))
        const email = typeof body.email === 'string' ? body.email : ''

        const result = await requestPasswordResetOtp(email)

        if (!result.success && (result as any).retryAfter) {
            return NextResponse.json(result, {
                status: 429,
                headers: { 'Retry-After': String((result as any).retryAfter) },
            })
        }

        return NextResponse.json(result, { status: 200 })
    } catch (err) {
        console.error('[/api/auth/forgot-password] error:', err)
        return NextResponse.json(
            { success: false, message: 'Đã xảy ra lỗi. Vui lòng thử lại.' },
            { status: 500 }
        )
    }
}
