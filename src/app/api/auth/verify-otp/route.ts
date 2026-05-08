/**
 * POST /api/auth/verify-otp
 * Body: { email: string, otp: string }
 * Response success: { success: true, resetToken: string, expiresIn: number }
 * Response fail: { success: false, message: string, attemptsRemaining?: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyPasswordResetOtp } from '@/actions/password-reset-actions'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}))
        const email = typeof body.email === 'string' ? body.email : ''
        const otp = typeof body.otp === 'string' ? body.otp : ''

        const result = await verifyPasswordResetOtp(email, otp)
        return NextResponse.json(result, { status: result.success ? 200 : 400 })
    } catch (err) {
        console.error('[/api/auth/verify-otp] error:', err)
        return NextResponse.json(
            { success: false, message: 'Đã xảy ra lỗi. Vui lòng thử lại.' },
            { status: 500 }
        )
    }
}
