// [BILLING P4] Webhook SePay — POST /api/webhooks/sepay
//
// SePay nhìn tài khoản ngân hàng của owner và bắn payload mỗi khi có tiền vào.
// Hợp đồng (docs/billing/SCHEMA-DE-XUAT.md §5–§7 + developer.sepay.vn):
//   • Auth 2 chế độ, theo "Phương thức xác thực" chọn trên dashboard SePay:
//       HMAC-SHA256 (env SEPAY_WEBHOOK_HMAC_SECRET) — SePay ký `${timestamp}.${rawBody}`,
//         gửi X-SePay-Signature: sha256=<hex> + X-SePay-Timestamp; verify ở sepay-hmac.ts
//         (kèm cửa sổ ±5 phút chống phát lại tầng vận chuyển).
//       API Key (env SEPAY_WEBHOOK_API_KEY) — "Authorization: Apikey <key>", không chữ ký.
//     Cả hai chế độ: chống trùng GIAO DỊCH vẫn ở unique [provider, providerTxnId]
//     trên SubscriptionPayment.
//   • Phải trả 200 {"success":true} nhanh; fail thì SePay retry tới 7 lần trong ~5h,
//     nên MỌI nhánh xử lý đều phải idempotent.
//   • SỔ TRƯỚC, KHỚP SAU: tiền vào là ghi SubscriptionPayment ngay, khớp được order hay không
//     tính sau. Không ghi = tiền biến mất khỏi hệ thống tới khi khách gọi hỏi.
//
// Neo idempotency = SubscriptionPayment (create bị P2002 → đã xử lý rồi → ack).
// WebhookEvent chỉ là kho lưu payload thô — id gắn tiền tố 'sepay:' để không đụng UUID
// của Mux trong cùng bảng (§6: đổi PK bảng đang sống là rủi ro không đảo được; prefix
// cho cùng bảo đảm với rủi ro bằng không).

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { audit } from '@/lib/audit-log'
import { getSepayConfig, type SepayWebhookPayload } from '@/lib/billing/sepay'
import { verifySepayHmac } from '@/lib/billing/sepay-hmac'
import { getPlan, monthlyPriceVND, type BillingCycle, type PlanCode } from '@/lib/billing/plans'
import { sendEmail } from '@/lib/email'
import { buildPaymentReceivedEmail } from '@/lib/notification-emails/templates/billing/payment-received'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OK = () => NextResponse.json({ success: true })

function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8')
    const bb = Buffer.from(b, 'utf8')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
}

/** "2026-08-03 10:15:00" — giờ VN, không kèm múi. Ghim +07:00 cho khỏi lệch 7 tiếng trên Vercel (UTC). */
function parseSepayDate(raw: string | undefined): Date {
    if (raw) {
        const d = new Date(`${raw.replace(' ', 'T')}+07:00`)
        if (!Number.isNaN(d.getTime())) return d
    }
    return new Date()
}

/** Cộng tháng theo LỊCH (31/01 + 1 tháng = 28/02, không phải 03/03). */
function addMonths(from: Date, months: number): Date {
    const d = new Date(from.getTime())
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + months)
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
    return d
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
    const cfg = getSepayConfig()
    if (!cfg) {
        // Thiếu env → 500 để SePay giữ lại delivery và retry sau khi owner đặt biến xong.
        console.error('[sepay] thiếu SEPAY_* env — từ chối webhook để SePay retry.')
        return NextResponse.json({ error: 'not configured' }, { status: 500 })
    }

    // Payload SePay thật chỉ vài trăm byte — chặn body quá khổ TRƯỚC khi buffer vào RAM,
    // vì HMAC buộc phải đọc raw body trước auth (request vô danh cũng được đọc body).
    const contentLength = Number(req.headers.get('content-length') ?? '0')
    if (!Number.isFinite(contentLength) || contentLength > 100_000) {
        return NextResponse.json({ error: 'payload too large' }, { status: 413 })
    }

    // Raw body đọc TRƯỚC khi xác thực — HMAC ký trên đúng từng byte của body,
    // parse trước là hết đường verify.
    const rawBody = await req.text()

    if (cfg.webhookHmacSecret) {
        const ok = verifySepayHmac(
            rawBody,
            req.headers.get('x-sepay-signature'),
            req.headers.get('x-sepay-timestamp'),
            cfg.webhookHmacSecret,
            Date.now(),
        )
        if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    } else {
        const auth = req.headers.get('authorization') ?? ''
        if (!safeEqual(auth, `Apikey ${cfg.webhookApiKey ?? ''}`)) {
            return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
        }
    }

    let payload: SepayWebhookPayload
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'bad json' }, { status: 400 })
    }

    const txnId = payload?.id != null ? String(payload.id) : null
    if (!txnId) return OK() // không có id thì không có gì để sổ
    if (payload.transferType !== 'in') return OK() // tiền RA không liên quan thu phí

    // Kho payload thô — best-effort, không bao giờ chặn dòng xử lý chính.
    try {
        await prisma.webhookEvent.create({
            data: { id: `sepay:${txnId}`, provider: 'sepay', type: 'transfer.in', payload: payload as object },
        })
    } catch (e) {
        if ((e as { code?: string })?.code !== 'P2002') console.error('[sepay] ledger write failed:', e)
    }

    // ── SỔ TIỀN — đây mới là mỏ neo idempotency ────────────────────────────────
    let paymentId: string
    try {
        const row = await prisma.subscriptionPayment.create({
            data: {
                provider: 'sepay',
                providerTxnId: txnId,
                amountVND: Math.round(payload.transferAmount ?? 0),
                gateway: payload.gateway ?? '',
                accountNumber: payload.accountNumber ?? '',
                transferCode: payload.code ?? null,
                content: payload.content ?? '',
                transactionDate: parseSepayDate(payload.transactionDate),
                rawPayload: payload as object,
            },
            select: { id: true },
        })
        paymentId = row.id
    } catch (e) {
        if ((e as { code?: string })?.code === 'P2002') return OK() // retry của SePay — đã xử lý rồi
        console.error('[sepay] payment write failed:', e)
        return NextResponse.json({ error: 'db error' }, { status: 500 }) // chưa sổ được gì → cho retry
    }

    // ── KHỚP LỆNH ──────────────────────────────────────────────────────────────
    // Mã ưu tiên trường `code` SePay tự tách (nhờ tiền tố VELOX); ngân hàng nào nuốt mất
    // thì tự mò trong nội dung CK — mỗi bank cắt xén một kiểu nên regex trên bản HOA.
    const codeFromContent = (payload.content ?? '').toUpperCase().match(/VELOX[A-Z2-9]{8}/)?.[0] ?? null
    const paymentCode = (payload.code ?? '').toUpperCase().match(/^VELOX[A-Z2-9]{8}$/)?.[0] ?? codeFromContent

    const unmatched = async (reason: string) => {
        void audit({
            workspaceId: null,
            actorUserId: null,
            action: 'billing.payment_unmatched',
            targetType: 'SubscriptionPayment',
            targetId: paymentId,
            after: { reason, amountVND: payload.transferAmount, code: paymentCode, content: payload.content ?? '' },
        })
        return OK() // tiền ĐÃ sổ — màn đối soát tay (/billing-ops) sẽ hiện hàng này
    }

    if (!paymentCode) return unmatched('khong_tim_thay_ma')

    const order = await prisma.subscriptionOrder.findUnique({
        where: { paymentCode },
        select: {
            id: true, status: true, planCode: true, billingCycle: true, extraSeats: true,
            amountVND: true, expiresAt: true,
            subscription: { select: { id: true, ownerProfileId: true, planCode: true, currentPeriodStart: true, currentPeriodEnd: true } },
        },
    })
    if (!order) return unmatched('ma_khong_ton_tai')
    if (order.status === 'PAID') return unmatched('don_da_thanh_toan_truoc_do') // chuyển 2 lần cùng mã
    if (order.status === 'CANCELED') return unmatched('don_da_huy')
    // Nới 1h sau hạn: khách chuyển 23:59, webhook tới 00:05 — không phạt vì độ trễ ngân hàng.
    if (order.status === 'EXPIRED' || order.expiresAt.getTime() + 60 * 60 * 1000 < Date.now()) {
        return unmatched('don_qua_han')
    }
    if (Math.round(payload.transferAmount ?? 0) < order.amountVND) {
        return unmatched('chuyen_thieu_tien') // thiếu thì người quyết là owner, không phải code
    }

    // ── KÍCH HOẠT — một transaction, chống webhook trùng chạy song song ────────
    const now = new Date()
    const activated = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${order.subscription.id}, 0))`

        const fresh = await tx.subscriptionOrder.findUnique({ where: { id: order.id }, select: { status: true } })
        if (fresh?.status !== 'PENDING') return null // bên kia thắng — payment này về diện đối soát

        const sub = order.subscription
        const newPlan = order.planCode as PlanCode
        const cycle = order.billingCycle as BillingCycle
        const months = cycle === 'ANNUAL' ? 12 : 1

        const oldActive = sub.currentPeriodEnd !== null && sub.currentPeriodEnd > now
        let periodEnd: Date
        if (oldActive && sub.planCode === newPlan) {
            // Gia hạn cùng gói: cộng nối vào hạn cũ — trả sớm không mất ngày nào.
            periodEnd = addMonths(sub.currentPeriodEnd!, months)
        } else if (oldActive && sub.planCode !== newPlan) {
            // Nâng/đổi gói giữa kỳ: ngày còn lại quy đổi theo tỷ lệ giá tháng, cộng vào kỳ mới,
            // làm tròn LÊN — sai số làm tròn luôn nghiêng về phía khách (panel checkout ghi rõ).
            const remainingDays = Math.max(0, (sub.currentPeriodEnd!.getTime() - now.getTime()) / DAY_MS)
            const oldMonthly = monthlyPriceVND(sub.planCode as PlanCode, 'MONTHLY') ?? 0
            const newMonthly = monthlyPriceVND(newPlan, 'MONTHLY') ?? 1
            const bonusDays = Math.ceil(remainingDays * (oldMonthly / newMonthly))
            periodEnd = new Date(addMonths(now, months).getTime() + bonusDays * DAY_MS)
        } else {
            periodEnd = addMonths(now, months)
        }

        await tx.subscription.update({
            where: { id: sub.id },
            data: {
                planCode: newPlan,
                status: 'ACTIVE',
                billingCycle: cycle,
                extraSeats: order.extraSeats,
                currentPeriodStart: sub.currentPeriodStart ?? now,
                currentPeriodEnd: periodEnd,
                graceEndsAt: null,
                canceledAt: null,
            },
        })
        await tx.subscriptionOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: now } })
        await tx.subscriptionPayment.update({ where: { id: paymentId }, data: { orderId: order.id, matchedAt: now } })
        await tx.profile.update({ where: { id: sub.ownerProfileId }, data: { subscriptionId: sub.id } })
        return { periodEnd, ownerProfileId: sub.ownerProfileId, planCode: newPlan, cycle }
    })

    if (!activated) return unmatched('don_vua_doi_trang_thai')

    void audit({
        workspaceId: null,
        actorUserId: null,
        action: 'billing.order_paid',
        targetType: 'SubscriptionOrder',
        targetId: order.id,
        after: {
            profileId: activated.ownerProfileId,
            planCode: activated.planCode,
            amountVND: order.amountVND,
            periodEnd: activated.periodEnd.toISOString(),
        },
    })

    // Biên nhận — fire-and-forget, KHÔNG được chặn 200 (SePay chỉ chờ 30s).
    void (async () => {
        try {
            const [profile, admins, ws] = await Promise.all([
                prisma.profile.findUnique({ where: { id: activated.ownerProfileId }, select: { name: true } }),
                prisma.profileAccess.findMany({
                    where: { profileId: activated.ownerProfileId, role: { in: ['OWNER', 'ADMIN'] } },
                    select: { user: { select: { email: true, emailVerified: true } } },
                    take: 5,
                }),
                prisma.workspace.findFirst({
                    where: { profileId: activated.ownerProfileId, status: 'ACTIVE' },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true },
                }),
            ])
            const base = process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'
            const { subject, html } = buildPaymentReceivedEmail({
                profileName: profile?.name ?? 'Tổ chức của bạn',
                planLabel: getPlan(activated.planCode).label,
                cycleLabel: activated.cycle === 'ANNUAL' ? '12 tháng' : '1 tháng',
                amountVND: order.amountVND,
                periodEndISO: activated.periodEnd.toISOString(),
                billingUrl: ws ? `${base}/${ws.id}/admin/billing` : base,
            })
            for (const a of admins) {
                if (a.user.email && a.user.emailVerified) {
                    await sendEmail({ to: a.user.email, subject, html }).catch(() => {})
                }
            }
        } catch (e) {
            console.error('[sepay] receipt email failed:', e)
        }
    })()

    return OK()
}
