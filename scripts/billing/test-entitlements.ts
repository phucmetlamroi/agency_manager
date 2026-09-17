/** [BILLING P2] Test tầng dẫn xuất quyền dùng — THUẦN LOGIC, KHÔNG chạm DB.
 *  Chạy: npx tsx scripts/billing/test-entitlements.ts   (pattern: scripts/test-linkify.ts)
 *  Import đường dẫn TƯƠNG ĐỐI vào src/lib/billing/derive.ts — file đó cố ý không có
 *  'server-only' + '@/lib/db' để script này chạy được. */
import { deriveEntitlements, isEnforced, minPlanFor, type SubRow } from '../../src/lib/billing/derive'
import { gb, TRIAL } from '../../src/lib/billing/plans'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const NOW = new Date('2026-09-15T00:00:00Z') // sau mốc enforcement giả định bên dưới
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

const base: SubRow = {
    id: 'sub1', planCode: 'STUDIO', status: 'ACTIVE', extraSeats: 0,
    currentPeriodEnd: null, graceEndsAt: null,
    overrideSeats: null, overrideStorageBytes: null, overrideUntil: null,
}

// ── Công tắc tổng ───────────────────────────────────────────────────────────
console.log('\n■ Công tắc BILLING_ENFORCEMENT_START')
delete process.env.BILLING_ENFORCEMENT_START
check('chưa đặt env → không cưỡng chế', !isEnforced(NOW))
process.env.BILLING_ENFORCEMENT_START = 'khong-phai-ngay'
check('env gõ sai → fail-open, không cưỡng chế', !isEnforced(NOW))
process.env.BILLING_ENFORCEMENT_START = '2026-12-01'
check('chưa tới ngày → không cưỡng chế', !isEnforced(NOW))
process.env.BILLING_ENFORCEMENT_START = '2026-09-01'
check('đã qua ngày → cưỡng chế', isEnforced(NOW))

const e0 = deriveEntitlements('p', null, NOW)
check('enforced=true chảy vào kết quả', e0.enforced)

// ── LOCKED ──────────────────────────────────────────────────────────────────
console.log('\n■ LOCKED')
check('không có sub → LOCKED + readOnly', e0.status === 'LOCKED' && e0.readOnly)
check('LOCKED → 0 tính năng', e0.features.size === 0)
check('LOCKED → sàn FREE (3 ghế / 10GB)', e0.seatLimit === 3 && e0.storageLimitBytes === gb(10))
check('LOCKED phân biệt chưa-từng-có-gói', !e0.hasSubscription)
const eNeverActivated = deriveEntitlements('p', base, NOW) // có row nhưng không period, không override
check('có row nhưng chưa kích hoạt → LOCKED + hasSubscription', eNeverActivated.status === 'LOCKED' && eNeverActivated.hasSubscription)

// ── ACTIVE theo kỳ trả tiền ─────────────────────────────────────────────────
console.log('\n■ ACTIVE theo kỳ')
const eAct = deriveEntitlements('p', { ...base, currentPeriodEnd: day(10) }, NOW)
check('trong kỳ → ACTIVE, không readOnly', eAct.status === 'ACTIVE' && !eAct.readOnly)
check('daysLeft = 10', eAct.daysLeft === 10, `daysLeft=${eAct.daysLeft}`)
check('Studio có VELOX, không có MCP', eAct.features.has('VELOX') && !eAct.features.has('MCP'))
check('Studio seatLimit = 5 (seatsIncluded, chưa mua thêm)', eAct.seatLimit === 5, `=${eAct.seatLimit}`)
const eSeats = deriveEntitlements('p', { ...base, currentPeriodEnd: day(10), extraSeats: 3 }, NOW)
check('mua 3 ghế thêm → 8', eSeats.seatLimit === 8, `=${eSeats.seatLimit}`)
const eSeatCap = deriveEntitlements('p', { ...base, currentPeriodEnd: day(10), extraSeats: 99 }, NOW)
check('ghế thêm kịch trần seatCap Studio = 10', eSeatCap.seatLimit === 10, `=${eSeatCap.seatLimit}`)

// ── GRACE ───────────────────────────────────────────────────────────────────
console.log('\n■ GRACE (chỉ-đọc 30 ngày)')
const eGrace = deriveEntitlements('p', { ...base, currentPeriodEnd: day(-5) }, NOW)
check('hết kỳ 5 ngày → GRACE + readOnly', eGrace.status === 'GRACE' && eGrace.readOnly)
check('GRACE giữ nguyên tính năng gói cũ', eGrace.features.has('VELOX'))
check(`graceEndsAt dẫn xuất = hết kỳ + ${TRIAL.readOnlyGraceDays} ngày`,
    eGrace.graceEndsAt?.getTime() === day(-5).getTime() + TRIAL.readOnlyGraceDays * 86400000)
const eGraceCol = deriveEntitlements('p', { ...base, currentPeriodEnd: day(-5), graceEndsAt: day(2) }, NOW)
check('cột graceEndsAt (cron ghi) thắng bản dẫn xuất', eGraceCol.graceEndsAt?.getTime() === day(2).getTime())
const eDead = deriveEntitlements('p', { ...base, currentPeriodEnd: day(-40) }, NOW)
check('hết kỳ 40 ngày (> 30) → LOCKED', eDead.status === 'LOCKED' && eDead.hasSubscription)

// ── Ngoại lệ D4 ─────────────────────────────────────────────────────────────
console.log('\n■ Ngoại lệ (D4)')
const ePerm = deriveEntitlements('p', { ...base, planCode: 'SCALE', overrideSeats: 40, overrideStorageBytes: gb(5000), overrideUntil: null }, NOW)
check('override vĩnh viễn, không periodEnd → ACTIVE', ePerm.status === 'ACTIVE')
check('trần riêng thay trần gói: 40 ghế / 5TB', ePerm.seatLimit === 40 && ePerm.storageLimitBytes === gb(5000))
check('vĩnh viễn → daysLeft null', ePerm.daysLeft === null && ePerm.effectiveEnd === null)
const eTimed = deriveEntitlements('p', { ...base, planCode: 'AGENCY', overrideSeats: 28, overrideUntil: day(365) }, NOW)
check('override 12 tháng → ACTIVE, daysLeft 365', eTimed.status === 'ACTIVE' && eTimed.daysLeft === 365, `=${eTimed.daysLeft}`)
check('override chỉ ghế → dung lượng vẫn theo gói Agency (1TB)', eTimed.storageLimitBytes === gb(1000))
const eOverDead = deriveEntitlements('p', { ...base, planCode: 'AGENCY', overrideSeats: 28, overrideUntil: day(-10) }, NOW)
check('override hết hạn 10 ngày → GRACE (không rơi thẳng LOCKED)', eOverDead.status === 'GRACE')
const eBoth = deriveEntitlements('p', { ...base, currentPeriodEnd: day(5), overrideSeats: 28, overrideUntil: day(90) }, NOW)
check('có cả kỳ + override → effectiveEnd lấy mốc muộn hơn (90d)', eBoth.daysLeft === 90, `=${eBoth.daysLeft}`)

// ── planCode lạ ─────────────────────────────────────────────────────────────
console.log('\n■ Phòng thủ dữ liệu bẩn')
const eBad = deriveEntitlements('p', { ...base, planCode: 'HACKED', currentPeriodEnd: day(10) }, NOW)
check('planCode lạ → rơi về sàn FREE, không crash', eBad.planCode === 'FREE' && eBad.features.size === 0)

// ── minPlanFor ──────────────────────────────────────────────────────────────
console.log('\n■ minPlanFor')
check('VELOX → STUDIO', minPlanFor('VELOX') === 'STUDIO')
check('MCP → AGENCY', minPlanFor('MCP') === 'AGENCY')

// ── Chưa cưỡng chế ──────────────────────────────────────────────────────────
console.log('\n■ Chưa cưỡng chế (trước BILLING_ENFORCEMENT_START)')
process.env.BILLING_ENFORCEMENT_START = '2026-12-01'
const eOff = deriveEntitlements('p', null, NOW)
check('vẫn tính đúng trạng thái thật (LOCKED) để UI hiện banner', eOff.status === 'LOCKED')
check('nhưng enforced=false → gate sẽ cho qua', !eOff.enforced)
delete process.env.BILLING_ENFORCEMENT_START

console.log(`\n${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
