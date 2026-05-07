/**
 * Diagnostic endpoint to test email pipeline.
 * Protected by CRON_SECRET. DELETE after debugging.
 *
 * GET /api/test-email?to=user@example.com
 */

import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET
    const headerKey =
        request.headers.get('x-cron-secret') ||
        request.headers.get('authorization')?.replace('Bearer ', '') ||
        null

    if (!secret || headerKey !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const to = url.searchParams.get('to')

    // Diagnostic info
    const diag = {
        RESEND_API_KEY: process.env.RESEND_API_KEY ? `set (${process.env.RESEND_API_KEY.slice(0, 6)}...)` : 'NOT SET',
        RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || 'NOT SET (fallback: notification@agencymanager.com)',
        EMAIL_SENDER_NAME: process.env.EMAIL_SENDER_NAME || 'NOT SET (fallback: HustlyTasker)',
        JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'NOT SET',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'NOT SET',
    }

    if (!to) {
        return NextResponse.json({
            message: 'Add ?to=email@example.com to send a test email',
            diagnostics: diag,
        })
    }

    try {
        console.log(`[test-email] Sending test email to ${to}...`)
        await sendEmail({
            to,
            subject: '[HustlyTasker Test] Email Pipeline Check',
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #7C3AED;">✅ HustlyTasker Email Works!</h2>
                    <p>This is a test email from the diagnostic endpoint.</p>
                    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
                    <p><strong>From:</strong> ${process.env.RESEND_FROM_EMAIL || 'fallback'}</p>
                </div>
            `,
        })

        return NextResponse.json({
            success: true,
            message: `Test email sent to ${to}`,
            diagnostics: diag,
        })
    } catch (err: any) {
        console.error('[test-email] Error:', err)
        return NextResponse.json({
            success: false,
            error: err.message || String(err),
            diagnostics: diag,
        }, { status: 500 })
    }
}
