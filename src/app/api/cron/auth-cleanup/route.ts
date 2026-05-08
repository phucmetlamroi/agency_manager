/**
 * Auth Phase 4 — Cron: cleanup expired auth tokens & old login attempts.
 *
 * Schedule (vercel.json): daily 03:00 UTC.
 *
 * Cleanup targets:
 *   - EmailVerificationToken: delete những token đã expired
 *   - PasswordResetOTP: delete OTP đã consumed > 7 ngày OR expired
 *   - LoginAttempt: delete records > 90 ngày (giữ 90d cho security audit)
 *
 * Auth: x-cron-secret header.
 */

import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

// H1 fix: timingSafeEqual để chống timing-side-channel attack trên secret comparison
function safeEqual(a: string | null, b: string): boolean {
    if (!a) return false
    const aBuf = Buffer.from(a)
    const bBuf = Buffer.from(b)
    if (aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
}

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization')
    const headerKey = request.headers.get('x-cron-secret')
    const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const key = headerKey || bearerKey
    const secret = process.env.CRON_SECRET

    if (!secret) {
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }
    if (!safeEqual(key, secret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const now = new Date()
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

        // 1. Email verification tokens — delete expired (regardless of usedAt)
        const tokenDel = await prisma.emailVerificationToken.deleteMany({
            where: { expiresAt: { lt: now } },
        })

        // 2. Password reset OTPs — delete expired OR consumed > 7 ngày
        const otpDel = await prisma.passwordResetOTP.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: now } },
                    { consumedAt: { not: null, lt: sevenDaysAgo } },
                ],
            },
        })

        // 3. Login attempts — delete > 90 ngày
        const attemptDel = await prisma.loginAttempt.deleteMany({
            where: { createdAt: { lt: ninetyDaysAgo } },
        })

        return NextResponse.json({
            ok: true,
            deletedTokens: tokenDel.count,
            deletedOtps: otpDel.count,
            deletedLoginAttempts: attemptDel.count,
            timestamp: now.toISOString(),
        })
    } catch (err: any) {
        console.error('[auth-cleanup] error:', err)
        return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
    }
}
