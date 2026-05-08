/**
 * POST /api/auth/reset-password
 * Body: { resetToken: string, newPassword: string }
 *
 * Validates password (≥12 chars, HIBP), updates User.password, bumps sessionVersion,
 * sends security alert email.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resetPasswordWithToken } from '@/actions/password-reset-actions'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}))
        const resetToken = typeof body.resetToken === 'string' ? body.resetToken : ''
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

        const result = await resetPasswordWithToken(resetToken, newPassword)
        return NextResponse.json(result, { status: result.success ? 200 : 400 })
    } catch (err) {
        console.error('[/api/auth/reset-password] error:', err)
        return NextResponse.json(
            { success: false, message: 'Đã xảy ra lỗi. Vui lòng thử lại.' },
            { status: 500 }
        )
    }
}
