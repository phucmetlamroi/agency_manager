/**
 * Auth Phase 4 — Cron: trial expiration + reminder emails.
 *
 * Schedule (vercel.json): daily 02:00 UTC.
 *
 * Logic:
 *   1. Find Profiles có trialEndsAt = today + 3 days → gửi "trial-3-days-left"
 *   2. Find Profiles có trialEndsAt < now + subscriptionTier='TRIAL' → set FREE + gửi expired email
 *
 * Auth: x-cron-secret header (cùng pattern như hard-delete-workspaces).
 */

import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { sendEmail } from '@/lib/email'
import { buildTrial3DaysLeftEmail } from '@/lib/notification-emails/templates/auth/trial-3-days-left'
import { buildTrialExpiredEmail } from '@/lib/notification-emails/templates/auth/trial-expired'

// H1 fix: timingSafeEqual để chống timing-side-channel attack trên secret comparison
function safeEqual(a: string | null, b: string): boolean {
    if (!a) return false
    const aBuf = Buffer.from(a)
    const bBuf = Buffer.from(b)
    if (aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
}

export async function GET(request: Request) {
    // Auth check (timing-safe). Removed undocumented x-cron-key alias.
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'
    const upgradeUrl = `${appUrl}/upgrade`

    let remindersSent = 0
    let expirationsProcessed = 0

    try {
        const now = new Date()

        // ── 1. 3-days-left reminder ──
        // Find Profiles trialing với trialEndsAt nằm trong [now+2.5d, now+3.5d]
        const reminderStart = new Date(now.getTime() + 2.5 * 24 * 60 * 60 * 1000)
        const reminderEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000)

        const remindCandidates = await prisma.profile.findMany({
            where: {
                subscriptionTier: 'TRIAL',
                trialEndsAt: { gte: reminderStart, lte: reminderEnd },
            },
            select: {
                id: true,
                name: true,
                trialEndsAt: true,
                users: {
                    select: { id: true, email: true, displayName: true, username: true, nickname: true },
                    where: { email: { not: null } },
                    take: 5,  // Top 5 users của profile (thường chỉ có OWNER, đôi khi nhiều)
                },
            },
        })

        for (const profile of remindCandidates) {
            for (const user of profile.users) {
                if (!user.email) continue
                const displayName = user.displayName ?? user.nickname ?? user.username
                const daysLeft = Math.ceil(
                    (profile.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
                )
                const { subject, html } = buildTrial3DaysLeftEmail({
                    displayName,
                    daysRemaining: daysLeft,
                    upgradeUrl,
                })
                try {
                    await sendEmail({ to: user.email, subject, html })
                    remindersSent++
                } catch (e) {
                    console.error(`[trial-cron] reminder send failed for ${user.email}:`, e)
                }
            }
        }

        // ── 2. Expiration: TRIAL → FREE ──
        const expiredCandidates = await prisma.profile.findMany({
            where: {
                subscriptionTier: 'TRIAL',
                trialEndsAt: { lt: now },
            },
            select: {
                id: true,
                name: true,
                users: {
                    select: { id: true, email: true, displayName: true, username: true, nickname: true },
                    where: { email: { not: null } },
                    take: 5,
                },
            },
        })

        for (const profile of expiredCandidates) {
            try {
                await prisma.profile.update({
                    where: { id: profile.id },
                    data: { subscriptionTier: 'FREE' },
                })
                expirationsProcessed++

                // Audit log
                try {
                    await prisma.auditLog.create({
                        data: {
                            workspaceId: null,
                            actorUserId: null, // system
                            action: 'subscription.trial_expired',
                            targetType: 'Profile',
                            targetId: profile.id,
                            beforeData: { subscriptionTier: 'TRIAL' },
                            afterData: { subscriptionTier: 'FREE' },
                        },
                    })
                } catch { /* non-blocking */ }

                // Send expiration email to all users với email
                for (const user of profile.users) {
                    if (!user.email) continue
                    const displayName = user.displayName ?? user.nickname ?? user.username
                    const { subject, html } = buildTrialExpiredEmail({ displayName, upgradeUrl })
                    sendEmail({ to: user.email, subject, html }).catch(e => {
                        console.error(`[trial-cron] expired email failed for ${user.email}:`, e)
                    })
                }
            } catch (e) {
                console.error(`[trial-cron] failed to expire profile ${profile.id}:`, e)
            }
        }

        return NextResponse.json({
            ok: true,
            remindersSent,
            expirationsProcessed,
            timestamp: now.toISOString(),
        })
    } catch (err: any) {
        console.error('[trial-cron] error:', err)
        return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
    }
}
