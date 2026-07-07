/**
 * [review-fixes P3 — F2 portal-derive]
 *
 * Pins the CLIENT-FACING EN status mapping (portal-derive.ts) after it moved from
 * substring-matching to the explicit TASK_STATUS_META map. Two guarantees:
 *   1. The 11 LEGACY statuses keep their exact pre-P3 EN labels (regression K3).
 *   2. Every internalOnly status (all "(nội bộ)" steps + the editor-only client fix)
 *      resolves to a PHASE label — it must NEVER leak the raw Vietnamese string (R4).
 *
 * Pure — no DB / env / network.
 * Usage:  npm run test:portal-derive
 */

import { clientLabelOf, mapClientTaskStatus, isInternalOnlyStatus, deriveNeedsYou, needsClientAction } from '../src/lib/portal-derive'
import { VALID_TASK_STATUSES, TASK_STATUS_META } from '../src/lib/task-statuses'

let failCount = 0
function check(name: string, pass: boolean, detail = '') {
  if (pass) console.log(`  ✅ ${name}`)
  else { failCount++; console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

// The FROZEN client-facing labels. Legacy 11 = the exact strings the old substring
// mapper returned; video 6 = STATUS-MACHINE §2.1/§4.
const EXPECTED: Record<string, string> = {
  'Đang đợi giao': 'In production',
  'Nhận task': 'Received',
  'Đã nhận task': 'Received',
  'Đang thực hiện': 'In progress',
  'Revision': 'In revision',
  // [bug-report #2] 'Sửa frame' / 'Gửi lại' / 'Tạm ngưng' removed.
  'Quá hạn': 'In progress',
  'Hoàn tất': 'Completed',
  'Đã hủy': 'Closed',
  'Đã nộp video (nội bộ)': 'In progress',      // internalOnly → internal_review phase
  'Đang sửa feedback (nội bộ)': 'In progress',  // internalOnly → internal_review phase
  'Đã sửa feedback (nội bộ)': 'In progress',    // internalOnly → internal_review phase
  'Đã gửi video (khách)': 'Ready for your review',
  'Đã nhận feedback (khách)': 'Revising',
  'Đã sửa feedback (khách)': 'In review',       // internalOnly → client_review phase
}

console.log('\n[1] Every VALID status has a frozen EN label (14 values)')
check('EXPECTED covers all 14 valid statuses', Object.keys(EXPECTED).length === VALID_TASK_STATUSES.length,
  `expected ${VALID_TASK_STATUSES.length}, got ${Object.keys(EXPECTED).length}`)
for (const value of VALID_TASK_STATUSES) {
  const got = clientLabelOf(value)
  check(`clientLabelOf("${value}") === "${EXPECTED[value]}"`, got === EXPECTED[value], `got "${got}"`)
}

console.log('\n[2] No client label leaks a Vietnamese status string (R4)')
// Any label containing a Vietnamese-only diacritic block = a leak. All EN labels are ASCII.
const VN_DIACRITIC = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i
for (const value of VALID_TASK_STATUSES) {
  const label = clientLabelOf(value)
  check(`"${value}" → ASCII EN label (no VN leak)`, !VN_DIACRITIC.test(label), `leaked "${label}"`)
}

console.log('\n[3] internalOnly statuses fold to a phase label (never their own value)')
for (const m of TASK_STATUS_META.filter((x) => x.internalOnly)) {
  const label = clientLabelOf(m.value)
  check(`internalOnly "${m.value}" label !== value`, label !== m.value, `got "${label}"`)
  check(`isInternalOnlyStatus("${m.value}") === true`, isInternalOnlyStatus(m.value))
}

console.log('\n[4] Edge cases + client-action derivation')
check('unknown status → safe "In progress" default', clientLabelOf('some legacy junk') === 'In progress')
check('mapClientTaskStatus alias === clientLabelOf', mapClientTaskStatus('Hoàn tất') === clientLabelOf('Hoàn tất'))
check('needsClientAction("Đã gửi video (khách)") === true', needsClientAction('Đã gửi video (khách)'))
check('needsClientAction("Đang thực hiện") === false', !needsClientAction('Đang thực hiện'))
check('deriveNeedsYou A5 (no clientReview) === true', deriveNeedsYou({ status: 'Đã gửi video (khách)' }))
check('deriveNeedsYou APPROVED === false', !deriveNeedsYou({ status: 'Đã gửi video (khách)', clientReview: 'APPROVED' }))

console.log(`\nRESULT: ${failCount === 0 ? 'PASS' : 'FAIL'} — ${failCount} failed check(s)\n`)
process.exit(failCount > 0 ? 1 : 0)
