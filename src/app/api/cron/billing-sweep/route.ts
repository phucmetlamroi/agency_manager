// [BILLING P7] Cron quét vòng đời gói — chạy 01:00 UTC (08:00 VN) mỗi ngày (vercel.json).
//
// Shape-1 (làm việc ngay trong route, như check-deadline): số subscription đếm bằng chục,
// không đáng một event Inngest. Việc:
//   1. ACTIVE/CANCELED quá hạn (periodEnd + overrideUntil đều qua) → GRACE + graceEndsAt
//      (+30 ngày, TRIAL.readOnlyGraceDays) + email grace-started.
//   2. GRACE quá graceEndsAt → EXPIRED + email expired.
//   3. Nhắc gia hạn D-7 và D-1 (không auto-charge nên email LÀ cơ chế gia hạn).
//
// LƯU Ý ĐỘC LẬP: deriveEntitlements dẫn xuất trạng thái từ NGÀY GIỜ, không tin cột status —
// cron này chạy trễ một ngày cũng KHÔNG ai bị khoá sớm hay mở muộn. Cron chỉ làm hai việc
// dẫn xuất không làm được: ghi bền trạng thái (cho ops query) và GỬI EMAIL đúng một lần.
// Dedup email: so DẤU MỐC — chuyển trạng thái chỉ xảy ra một lần nên email đi cùng lần
// chuyển; riêng nhắc D-7/D-1 dedup bằng khoảng ngày (chạy 1 lần/ngày → mỗi mốc bắn 1 lần).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readCronKey, safeEqual } from '@/lib/cron-auth'
import { TRIAL, getPlan, type PlanCode } from '@/lib/billing/plans'
import { sendEmail } from '@/lib/email'
import { buildRenewalReminderEmail, buildGraceStartedEmail, buildExpiredEmail } from '@/lib/notification-emails/templates/billing/lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000
const GRACE_MS = TRIAL.readOnlyGraceDays * DAY_MS

/** OWNER/ADMIN đã verify email của một profile + deep-link trang billing. */
async function recipientsOf(profileId: string): Promise<{ emails: string[]; billingUrl: string; profileName: string }> {
    const [profile, admins, ws] = await Promise.all([
        prisma.profile.findUnique({ where: { id: profileId }, select: { name: true } }),
        prisma.profileAccess.findMany({
            where: { profileId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { user: { select: { email: true, emailVerified: true } } },
            take: 5,
        }),
        prisma.workspace.findFirst({
            where: { profileId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        }),
    ])
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'
    return {
        emails: admins.map((a) => a.user).filter((u) => u.email && u.emailVerified).map((u) => u.email as string),
        billingUrl: ws ? `${base}/${ws.id}/admin/billing` : base,
        profileName: profile?.name ?? 'Tổ chức của bạn',
    }
}

export async function GET(request: NextRequest) {
    const key = readCronKey(request)
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    if (!safeEqual(key, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const now = new Date()
    const processed: string[] = []
    const mail = async (to: string[], subject: string, html: string) => {
        for (const addr of to) await sendEmail({ to: addr, subject, html }).catch(() => {})
    }

    // ── 1. Hết hiệu lực → GRACE ────────────────────────────────────────────────
    // "Hết hiệu lực" = KHÔNG còn mốc nào che: periodEnd qua rồi VÀ override (nếu có) cũng
    // qua rồi. Ngoại lệ vĩnh viễn (override có giá trị, overrideUntil null) không bao giờ khớp.
    const toGrace = await prisma.subscription.findMany({
        where: {
            status: { in: ['ACTIVE', 'CANCELED'] },
            currentPeriodEnd: { not: null, lt: now },
            OR: [
                { overrideSeats: null, overrideStorageBytes: null }, // không có ngoại lệ
                { overrideUntil: { not: null, lt: now } }, // ngoại lệ có hạn và đã qua
            ],
        },
        select: { id: true, ownerProfileId: true, planCode: true, currentPeriodEnd: true, overrideUntil: true },
        take: 200,
    })
    for (const sub of toGrace) {
        const lastEnd = [sub.currentPeriodEnd, sub.overrideUntil]
            .filter((d): d is Date => d !== null)
            .reduce((a, b) => (b > a ? b : a))
        const graceEndsAt = new Date(lastEnd.getTime() + GRACE_MS)
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'GRACE', graceEndsAt } })
        const r = await recipientsOf(sub.ownerProfileId)
        const { subject, html } = buildGraceStartedEmail({
            profileName: r.profileName,
            planLabel: getPlan(sub.planCode as PlanCode).label,
            graceEndsISO: graceEndsAt.toISOString(),
            billingUrl: r.billingUrl,
        })
        await mail(r.emails, subject, html)
        processed.push(`grace:${sub.ownerProfileId}`)
    }

    // ── 2. Hết GRACE → EXPIRED ─────────────────────────────────────────────────
    const toExpire = await prisma.subscription.findMany({
        where: { status: 'GRACE', graceEndsAt: { not: null, lt: now } },
        select: { id: true, ownerProfileId: true },
        take: 200,
    })
    for (const sub of toExpire) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } })
        const r = await recipientsOf(sub.ownerProfileId)
        const { subject, html } = buildExpiredEmail({ profileName: r.profileName, billingUrl: r.billingUrl })
        await mail(r.emails, subject, html)
        processed.push(`expired:${sub.ownerProfileId}`)
    }

    // ── 3. Nhắc gia hạn D-7 / D-1 ──────────────────────────────────────────────
    // CANCELED cố ý bị loại: người ta đã nói dừng thì đừng nhắc. Cron chạy 1 lần/ngày nên
    // cửa sổ [D, D+1) bắn đúng một lần cho mỗi mốc.
    for (const days of [7, 1]) {
        const winStart = new Date(now.getTime() + days * DAY_MS)
        const winEnd = new Date(now.getTime() + (days + 1) * DAY_MS)
        const due = await prisma.subscription.findMany({
            where: { status: 'ACTIVE', currentPeriodEnd: { gte: winStart, lt: winEnd } },
            select: { ownerProfileId: true, planCode: true, currentPeriodEnd: true },
            take: 200,
        })
        for (const sub of due) {
            const r = await recipientsOf(sub.ownerProfileId)
            const { subject, html } = buildRenewalReminderEmail({
                profileName: r.profileName,
                planLabel: getPlan(sub.planCode as PlanCode).label,
                periodEndISO: sub.currentPeriodEnd!.toISOString(),
                daysLeft: days,
                billingUrl: r.billingUrl,
            })
            await mail(r.emails, subject, html)
            processed.push(`remind${days}:${sub.ownerProfileId}`)
        }
    }

    // Đơn PENDING quá hạn → EXPIRED (dọn sổ; getOrderStatus cũng làm lười từng đơn).
    const expiredOrders = await prisma.subscriptionOrder.updateMany({
        where: { status: 'PENDING', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
    })

    return NextResponse.json({ success: true, processed, expiredOrders: expiredOrders.count })
}
