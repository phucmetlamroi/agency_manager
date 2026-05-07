import { sendDigestEmails } from '@/lib/notification-email'
import { NextResponse } from 'next/server'

/**
 * Cron route: Send email digests.
 *
 * Schedule: every hour (0 * * * *)
 * - Always processes HOURLY digest users
 * - At UTC hour 1 (≈8 AM UTC+7 Vietnam), also processes DAILY digest users
 */
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

    if (key !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Always run HOURLY digest
        const hourly = await sendDigestEmails('HOURLY')

        // Run DAILY digest at UTC hour 1 (≈ 8 AM Vietnam time, UTC+7)
        const utcHour = new Date().getUTCHours()
        let daily = { sent: 0, skipped: 0 }
        if (utcHour === 1) {
            daily = await sendDigestEmails('DAILY')
        }

        return NextResponse.json({
            success: true,
            hourly,
            daily,
            ranDailyDigest: utcHour === 1,
        })
    } catch (error) {
        console.error('Send Digest Cron Error:', error)
        return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
    }
}
