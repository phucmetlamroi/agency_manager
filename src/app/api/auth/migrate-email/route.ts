/**
 * POST /api/auth/migrate-email
 *
 * Step `request_otp`:  { step: 'request_otp', newEmail: string }
 * Step `verify_otp`:   { step: 'verify_otp', newEmail: string, otp: string }
 *
 * Authenticated endpoint — caller must have session với requiresEmailMigration claim.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
    requestEmailMigrationOtp,
    verifyEmailMigrationOtp,
} from '@/actions/email-migration-actions'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}))
        const step = body.step
        const newEmail = typeof body.newEmail === 'string' ? body.newEmail : ''
        const otp = typeof body.otp === 'string' ? body.otp : ''

        if (step === 'request_otp') {
            const result = await requestEmailMigrationOtp(newEmail)
            return NextResponse.json(result, { status: result.success ? 200 : 400 })
        }
        if (step === 'verify_otp') {
            const result = await verifyEmailMigrationOtp(newEmail, otp)
            return NextResponse.json(result, { status: result.success ? 200 : 400 })
        }
        return NextResponse.json(
            { success: false, message: 'Step không hợp lệ.' },
            { status: 400 }
        )
    } catch (err) {
        console.error('[/api/auth/migrate-email] error:', err)
        return NextResponse.json(
            { success: false, message: 'Đã xảy ra lỗi.' },
            { status: 500 }
        )
    }
}
