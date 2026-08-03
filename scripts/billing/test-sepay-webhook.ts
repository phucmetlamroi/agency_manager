/** [BILLING P4] Harness webhook SePay — chạy trên NHÁNH DB TEST + dev server cục bộ.
 *
 *  Cách chạy (docs/billing/VAN-HANH.md sẽ ghi lại):
 *    1. Dev server:  $env:SEPAY_ACCOUNT_NUMBER='0123456789'; $env:SEPAY_BANK='MBBank';
 *                    $env:SEPAY_WEBHOOK_API_KEY='test-key-123'; npm run dev  (Next tự đọc .env.local → DB test)
 *    2. Harness:     $env:DATABASE_URL=<chuỗi ep-round-lab>; $env:SEPAY_WEBHOOK_API_KEY='test-key-123';
 *                    npx tsx scripts/billing/test-sepay-webhook.ts
 *
 *  TỰ BẢO VỆ: từ chối chạy nếu DATABASE_URL trỏ production (ep-autumn-flower) — harness GHI dữ liệu.
 */
import { PrismaClient } from '@prisma/client'

const BASE = process.env.WEBHOOK_BASE || 'http://localhost:3111'
const KEY = process.env.SEPAY_WEBHOOK_API_KEY || 'test-key-123'
const prisma = new PrismaClient()

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const TAG = `SEPAYTEST${Date.now()}`
// paymentCode thật KHÔNG BAO GIỜ chứa 0/1 (bảng chữ A-Z2-9) — regex webhook từ chối là đúng.
// Suffix mã test phải đi qua phép ánh xạ này, không được dùng timestamp thô (bài học chạy lần 1:
// 6 case kích hoạt fail chỉ vì fixture chứa số 1).
const codeSafe = (s: string) => s.replace(/0/g, 'Q').replace(/1/g, 'W')

async function post(body: unknown, key = KEY): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${BASE}/api/webhooks/sepay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Apikey ${key}` },
        body: JSON.stringify(body),
    })
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

const payloadBase = (over: Record<string, unknown>) => ({
    gateway: 'MBBank',
    transactionDate: '2026-08-03 20:00:00',
    accountNumber: '0123456789',
    transferType: 'in',
    accumulated: 0,
    subAccount: null,
    referenceCode: 'FT-TEST',
    description: 'test',
    ...over,
})

async function main() {
    const host = (() => { try { return new URL(process.env.DATABASE_URL || '').host } catch { return '' } })()
    if (!host || host.toLowerCase().includes('ep-autumn-flower')) {
        console.error(`DỪNG — DATABASE_URL phải trỏ nhánh TEST (đang: "${host || 'trống'}"). Harness này GHI dữ liệu.`)
        process.exit(1)
    }
    console.log(`DB: ${host}\nServer: ${BASE}\n`)

    // ── Fixture: profile + subscription + order PENDING trên nhánh test ────────
    const profile = await prisma.profile.create({ data: { name: `[${TAG}] Billing Test Co` } })
    const sub = await prisma.subscription.create({
        data: { ownerProfileId: profile.id, planCode: 'STUDIO', status: 'ACTIVE', billingCycle: 'MONTHLY' },
    })
    const order = await prisma.subscriptionOrder.create({
        data: {
            subscriptionId: sub.id,
            paymentCode: `VELOX${codeSafe(TAG.slice(-6))}TT`.slice(0, 13),
            planCode: 'STUDIO',
            billingCycle: 'MONTHLY',
            extraSeats: 0,
            amountVND: 990_000,
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    })
    console.log(`Fixture: order ${order.paymentCode} (990.000đ)\n`)

    try {
        console.log('■ Auth')
        const bad = await post(payloadBase({ id: `${TAG}-0`, transferAmount: 1000, content: 'x' }), 'sai-key')
        check('sai API key → 401', bad.status === 401, `=${bad.status}`)

        console.log('\n■ Tiền vào không khớp mã')
        const r1 = await post(payloadBase({ id: `${TAG}-1`, transferAmount: 500_000, content: 'chuyen tien khong ma', code: null }))
        check('200 success', r1.status === 200 && r1.json.success === true, JSON.stringify(r1))
        const p1 = await prisma.subscriptionPayment.findUnique({ where: { provider_providerTxnId: { provider: 'sepay', providerTxnId: `${TAG}-1` } } })
        check('đã SỔ SubscriptionPayment, orderId=null (chờ đối soát)', !!p1 && p1.orderId === null)

        console.log('\n■ Phát lại (SePay retry)')
        const r2 = await post(payloadBase({ id: `${TAG}-1`, transferAmount: 500_000, content: 'chuyen tien khong ma', code: null }))
        check('trùng providerTxnId → vẫn 200, không sổ đôi', r2.status === 200)
        const dupCount = await prisma.subscriptionPayment.count({ where: { providerTxnId: `${TAG}-1` } })
        check('chỉ 1 hàng payment', dupCount === 1, `=${dupCount}`)

        console.log('\n■ Chuyển thiếu tiền')
        const r3 = await post(payloadBase({ id: `${TAG}-2`, transferAmount: 100_000, content: `CK ${order.paymentCode}`, code: order.paymentCode }))
        check('200 (tiền vẫn sổ)', r3.status === 200)
        const o3 = await prisma.subscriptionOrder.findUnique({ where: { id: order.id } })
        check('order VẪN PENDING (thiếu tiền không kích hoạt)', o3?.status === 'PENDING', `=${o3?.status}`)

        console.log('\n■ Chuyển đúng — kích hoạt')
        const r4 = await post(payloadBase({ id: `${TAG}-3`, transferAmount: 990_000, content: `CK ${order.paymentCode} cam on`, code: order.paymentCode }))
        check('200 success', r4.status === 200 && r4.json.success === true)
        const o4 = await prisma.subscriptionOrder.findUnique({ where: { id: order.id } })
        check('order → PAID + paidAt', o4?.status === 'PAID' && !!o4.paidAt)
        const s4 = await prisma.subscription.findUnique({ where: { id: sub.id } })
        check('subscription ACTIVE + periodEnd ~1 tháng tới', s4?.status === 'ACTIVE' && !!s4.currentPeriodEnd && s4.currentPeriodEnd > new Date(Date.now() + 25 * 86400000))
        const p4 = await prisma.subscriptionPayment.findUnique({ where: { provider_providerTxnId: { provider: 'sepay', providerTxnId: `${TAG}-3` } } })
        check('payment khớp order + matchedAt', p4?.orderId === order.id && !!p4.matchedAt)
        const prof4 = await prisma.profile.findUnique({ where: { id: profile.id }, select: { subscriptionId: true } })
        check('Profile.subscriptionId đã trỏ về gói', prof4?.subscriptionId === sub.id)

        console.log('\n■ Chuyển lần 2 vào order ĐÃ PAID')
        const r5 = await post(payloadBase({ id: `${TAG}-4`, transferAmount: 990_000, content: `CK ${order.paymentCode}`, code: order.paymentCode }))
        check('200, không kích hoạt đôi — về diện đối soát', r5.status === 200)
        const p5 = await prisma.subscriptionPayment.findUnique({ where: { provider_providerTxnId: { provider: 'sepay', providerTxnId: `${TAG}-4` } } })
        check('payment thứ 2 orderId=null', !!p5 && p5.orderId === null)

        console.log('\n■ Mã mò từ NỘI DUNG khi bank nuốt trường code')
        const order2 = await prisma.subscriptionOrder.create({
            data: {
                subscriptionId: sub.id, paymentCode: `VELOX${codeSafe(TAG.slice(-6))}QQ`.slice(0, 13), planCode: 'AGENCY',
                billingCycle: 'MONTHLY', extraSeats: 0, amountVND: 3_290_000, status: 'PENDING',
                expiresAt: new Date(Date.now() + 3600_000),
            },
        })
        const r6 = await post(payloadBase({ id: `${TAG}-5`, transferAmount: 3_290_000, content: `MBVCB tu quy khach ${order2.paymentCode} GD 123`, code: null }))
        check('regex bóc mã từ content → PAID', r6.status === 200 && (await prisma.subscriptionOrder.findUnique({ where: { id: order2.id } }))?.status === 'PAID')
        const s6 = await prisma.subscription.findUnique({ where: { id: sub.id } })
        check('nâng STUDIO→AGENCY giữa kỳ: planCode đổi + periodEnd ≥ 1 tháng + ngày quy đổi', s6?.planCode === 'AGENCY' && !!s6.currentPeriodEnd && s6.currentPeriodEnd > new Date(Date.now() + 30 * 86400000))

        console.log('\n■ Tiền RA bị bỏ qua')
        const r7 = await post(payloadBase({ id: `${TAG}-6`, transferAmount: 5_000_000, transferType: 'out', content: 'rut tien', code: null }))
        const p7 = await prisma.subscriptionPayment.findUnique({ where: { provider_providerTxnId: { provider: 'sepay', providerTxnId: `${TAG}-6` } } })
        check('transferType=out → 200 nhưng KHÔNG sổ', r7.status === 200 && !p7)
    } finally {
        // ── Dọn fixture (thứ tự FK) ────────────────────────────────────────────
        await prisma.subscriptionPayment.deleteMany({ where: { providerTxnId: { startsWith: TAG } } })
        await prisma.webhookEvent.deleteMany({ where: { id: { startsWith: `sepay:${TAG}` } } })
        await prisma.subscriptionOrder.deleteMany({ where: { subscriptionId: sub.id } })
        await prisma.profile.update({ where: { id: profile.id }, data: { subscriptionId: null } })
        await prisma.subscription.delete({ where: { id: sub.id } }).catch(() => {})
        await prisma.profile.delete({ where: { id: profile.id } }).catch(() => {})
        console.log('\n(đã dọn fixture)')
    }

    console.log(`\n${pass} pass, ${fail} fail`)
    if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
