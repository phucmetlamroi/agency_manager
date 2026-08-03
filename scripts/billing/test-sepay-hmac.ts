/** [BILLING P4b] Test thuần cho verifySepayHmac — KHÔNG cần dev server, KHÔNG cần DB.
 *
 *  Chạy:  npm run test:sepay-hmac   (hoặc npx tsx scripts/billing/test-sepay-hmac.ts)
 *
 *  Import tương đối vào sepay-hmac.ts (file thuần, không 'server-only') — cùng pattern
 *  test-entitlements.ts ↔ derive.ts.
 */
import { createHmac } from 'node:crypto'
import { verifySepayHmac, SEPAY_HMAC_TOLERANCE_SECONDS } from '../../src/lib/billing/sepay-hmac'

let pass = 0
let fail = 0
function check(name: string, cond: boolean) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else { fail++; console.error(`  ✗ ${name}`) }
}

const SECRET = 'test-secret-abc123'
const BODY = JSON.stringify({ id: 12345, transferAmount: 990000, code: 'VELOXABCDEFGH', content: 'VELOXABCDEFGH chuyen tien' })
const NOW_MS = 1_754_400_000_000 // mốc cố định — không dùng Date.now() để test tất định

function sign(body: string, tsRaw: string, secret = SECRET): string {
    return `sha256=${createHmac('sha256', secret).update(`${tsRaw}.${body}`, 'utf8').digest('hex')}`
}

const tsNow = String(Math.floor(NOW_MS / 1000))

// ── Đường vui ─────────────────────────────────────────────────────────────────
check('chữ ký đúng + timestamp hiện tại → pass',
    verifySepayHmac(BODY, sign(BODY, tsNow), tsNow, SECRET, NOW_MS))

check('hex viết HOA trong header vẫn pass (so sánh không phân biệt hoa thường)',
    verifySepayHmac(BODY, sign(BODY, tsNow).toUpperCase().replace('SHA256=', 'sha256='), tsNow, SECRET, NOW_MS))

check('retry của SePay (ký lại với timestamp mới, lệch 200s) → pass', (() => {
    const ts = String(Math.floor(NOW_MS / 1000) - 200)
    return verifySepayHmac(BODY, sign(BODY, ts), ts, SECRET, NOW_MS)
})())

check('sát mép cửa sổ (đúng TOLERANCE giây) → pass', (() => {
    const ts = String(Math.floor(NOW_MS / 1000) - SEPAY_HMAC_TOLERANCE_SECONDS)
    return verifySepayHmac(BODY, sign(BODY, ts), ts, SECRET, NOW_MS)
})())

// ── Từ chối ───────────────────────────────────────────────────────────────────
check('sai secret → fail',
    !verifySepayHmac(BODY, sign(BODY, tsNow, 'secret-khac'), tsNow, SECRET, NOW_MS))

check('body bị sửa 1 ký tự → fail',
    !verifySepayHmac(BODY.replace('990000', '990001'), sign(BODY, tsNow), tsNow, SECRET, NOW_MS))

check('timestamp header bị sửa khác timestamp đã ký → fail',
    !verifySepayHmac(BODY, sign(BODY, tsNow), String(Number(tsNow) + 60), SECRET, NOW_MS))

check('thiếu header chữ ký → fail',
    !verifySepayHmac(BODY, null, tsNow, SECRET, NOW_MS))

check('thiếu header timestamp → fail',
    !verifySepayHmac(BODY, sign(BODY, tsNow), null, SECRET, NOW_MS))

check('chữ ký không có tiền tố sha256= → fail',
    !verifySepayHmac(BODY, sign(BODY, tsNow).slice('sha256='.length), tsNow, SECRET, NOW_MS))

check('chữ ký không phải 64 hex → fail',
    !verifySepayHmac(BODY, 'sha256=zzzz', tsNow, SECRET, NOW_MS))

check('phát lại quá cửa sổ (TOLERANCE + 1 giây trước) → fail', (() => {
    const ts = String(Math.floor(NOW_MS / 1000) - SEPAY_HMAC_TOLERANCE_SECONDS - 1)
    return !verifySepayHmac(BODY, sign(BODY, ts), ts, SECRET, NOW_MS)
})())

check('timestamp tương lai quá cửa sổ → fail', (() => {
    const ts = String(Math.floor(NOW_MS / 1000) + SEPAY_HMAC_TOLERANCE_SECONDS + 60)
    return !verifySepayHmac(BODY, sign(BODY, ts), ts, SECRET, NOW_MS)
})())

check('timestamp không phải số nguyên ("abc", "12.5", "-1") → fail',
    !verifySepayHmac(BODY, sign(BODY, 'abc'), 'abc', SECRET, NOW_MS)
    && !verifySepayHmac(BODY, sign(BODY, '12.5'), '12.5', SECRET, NOW_MS)
    && !verifySepayHmac(BODY, sign(BODY, '-1'), '-1', SECRET, NOW_MS))

// Bẫy JS kinh điển: Number('') === 0 và Number('   ') === 0 — phải chặn bằng ts <= 0.
check('timestamp rỗng / toàn khoảng trắng → fail',
    !verifySepayHmac(BODY, sign(BODY, ''), '', SECRET, NOW_MS)
    && !verifySepayHmac(BODY, sign(BODY, '   '), '   ', SECRET, NOW_MS))

// HMAC với secret rỗng là thứ ai cũng tính được — verifier phải tự chặn, không dựa caller.
check('secret rỗng → fail kể cả khi chữ ký "khớp" (ký bằng secret rỗng)',
    !verifySepayHmac(BODY, sign(BODY, tsNow, ''), tsNow, '', NOW_MS))

console.log(`\n${pass}/${pass + fail} pass`)
if (fail > 0) process.exit(1)
