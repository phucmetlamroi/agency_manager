/**
 * [review-fixes P0 — F2 status-meta snapshot]
 *
 * Pins the PAYROLL-CRITICAL task-status constants so meta-izing task-statuses.ts
 * (adding TASK_STATUS_META) can NEVER silently change which statuses count as
 * salary-pending / completed. Rủi ro số 1 của cả dự án: payroll đếm THIẾU tiền
 * editor nếu salaryPending gán sai.
 *
 * Pure constant comparison — NO DB, NO env, NO network. Safe to run anywhere.
 *
 * Designed to run BOTH:
 *   - BEFORE the meta refactor → the money assertions (on the existing exports)
 *     pass; the TASK_STATUS_META block is SKIPPED (namespace import → undefined).
 *   - AFTER the meta refactor  → the meta-consistency assertions activate.
 * Red at any point = the refactor changed a money constant (or meta drifted from
 * the value list / the MCP copy).
 *
 * Usage:  npm run test:status-meta   (or: npx tsx scripts/test-status-meta-snapshot.ts)
 */

import * as TaskStatuses from '../src/lib/task-statuses'
import * as McpStatuses from '../mcp-server/src/services/statuses'

/* ── FROZEN contract. P3 added the 6 video statuses (A2–A7). Bug-report #2 (owner 2026-07-07)
 *    REMOVED 'Sửa frame' / 'Gửi lại' / 'Tạm ngưng': VALID 17→14, salary-pending 12→10. Sửa frame +
 *    Gửi lại were salaryPending:true — existing rows migrate to 'Revision' (also pending) so NO editor
 *    is under-counted (R1 preserved); 'Tạm ngưng' leaves the non-pending traps. 'Revision' + 'Đã hủy'
 *    stay. salaryCompleted stays exactly 'Hoàn tất'. Any change here is a DELIBERATE payroll decision. ── */
const FROZEN_VIDEO_6 = [
  'Đã nộp video (nội bộ)', 'Đang sửa feedback (nội bộ)', 'Đã sửa feedback (nội bộ)',
  'Đã gửi video (khách)', 'Đã nhận feedback (khách)', 'Đã sửa feedback (khách)',
]
const FROZEN_VALID_14 = [
  'Đang đợi giao', 'Nhận task', 'Đã nhận task', 'Đang thực hiện', 'Revision',
  'Quá hạn', 'Hoàn tất', 'Đã hủy',
  ...FROZEN_VIDEO_6,
]
// The ORIGINAL salary-pending kept after #2 (R1 anchor) — must remain a SUBSET of pending forever.
const FROZEN_PENDING_ORIGINAL_4 = [
  'Nhận task', 'Đang đợi giao', 'Đang thực hiện', 'Revision',
]
// The full pending set = the kept original 4 + all 6 video statuses.
const FROZEN_PENDING_10 = [...FROZEN_PENDING_ORIGINAL_4, ...FROZEN_VIDEO_6]
const FROZEN_COMPLETED = 'Hoàn tất'
const FROZEN_TERMINAL = ['Hoàn tất', 'Đã hủy']
// Non-terminal-ish statuses that are deliberately NOT salary-pending. A naive
// "non-terminal ⇒ pending" derivation would wrongly include these → underpay guard.
const FROZEN_NOT_PENDING_TRAPS = ['Đã nhận task', 'Quá hạn']
// Statuses the cron (check-deadline) must NOT flip to 'Quá hạn'. P3: the 3 legacy
// terminal/overdue values PLUS the 6 video statuses (excluded so the cron can't wipe the
// video lifecycle context — schema is frozen, so no overdueAt column; badge is derived).
const FROZEN_OVERDUE_INELIGIBLE = ['Hoàn tất', 'Đã hủy', 'Quá hạn', ...FROZEN_VIDEO_6]
// The 6 video statuses are the ONLY auto-transition targets (F7–F10).
const FROZEN_TRANSITION_TARGETS = [...FROZEN_VIDEO_6]

type MetaRow = {
  value: string
  salaryPending: boolean
  salaryCompleted: boolean
  terminal: boolean
  internalOnly: boolean
  cronOverdueEligible: boolean
  phase: string
  order: number
  clientLabel: string
}

const VALID = [...TaskStatuses.VALID_TASK_STATUSES] as string[]
const PENDING = TaskStatuses.SALARY_PENDING_STATUSES as string[]
const COMPLETED = TaskStatuses.SALARY_COMPLETED_STATUS as string
const META = (TaskStatuses as { TASK_STATUS_META?: readonly MetaRow[] }).TASK_STATUS_META

const OVERDUE_ELIGIBLE = (TaskStatuses as { OVERDUE_ELIGIBLE_STATUSES?: string[] }).OVERDUE_ELIGIBLE_STATUSES
const TRANSITIONS = (TaskStatuses as { STATUS_TRANSITIONS?: Record<string, string[]> }).STATUS_TRANSITIONS

const MCP_VALID = [...McpStatuses.VALID_TASK_STATUSES] as string[]
const MCP_PENDING = McpStatuses.SALARY_PENDING_STATUSES as string[]
const MCP_COMPLETED = McpStatuses.SALARY_COMPLETED_STATUS as string

let failCount = 0
function check(name: string, pass: boolean, detail = '') {
  if (pass) console.log(`  ✅ ${name}`)
  else { failCount++; console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}
function skip(name: string, why: string) { console.log(`  ⏭️  ${name} (skip: ${why})`) }

function setEq(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a), sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const x of sa) if (!sb.has(x)) return false
  return true
}

console.log('\n[1] Money constants pinned to frozen contract (#2: 14 values, 10 pending)')
check('VALID_TASK_STATUSES length === 14', VALID.length === 14, `got ${VALID.length}`)
check('VALID_TASK_STATUSES === frozen 14 (set)', setEq(VALID, FROZEN_VALID_14))
check('SALARY_PENDING_STATUSES length === 10', PENDING.length === 10, `got ${PENDING.length}`)
check('SALARY_PENDING_STATUSES === frozen 10 (set)', setEq(PENDING, FROZEN_PENDING_10))
// R1 anchor: the kept ORIGINAL pending must survive as a subset (no editor underpaid).
for (const p of FROZEN_PENDING_ORIGINAL_4) {
  check(`original pending "${p}" still salary-pending`, PENDING.includes(p))
}
for (const v of FROZEN_VIDEO_6) {
  check(`video "${v}" is salary-pending`, PENDING.includes(v))
}
for (const t of FROZEN_NOT_PENDING_TRAPS) {
  check(`trap "${t}" is NOT salary-pending`, !PENDING.includes(t))
}
check('SALARY_COMPLETED_STATUS === "Hoàn tất"', COMPLETED === FROZEN_COMPLETED, `got "${COMPLETED}"`)

console.log('\n[2] MCP server manual copy parity (K4)')
check('MCP VALID === src VALID (set)', setEq(MCP_VALID, VALID))
check('MCP PENDING === src PENDING (set)', setEq(MCP_PENDING, PENDING))
check('MCP COMPLETED === src COMPLETED', MCP_COMPLETED === COMPLETED, `mcp="${MCP_COMPLETED}" src="${COMPLETED}"`)

console.log('\n[3] TASK_STATUS_META consistency (activates once meta exists)')
if (!META) {
  skip('meta assertions', 'TASK_STATUS_META not exported yet (pre-refactor)')
} else {
  const values = META.map(m => m.value)
  check('meta covers exactly VALID_TASK_STATUSES', setEq(values, VALID))
  check('meta has no duplicate values', new Set(values).size === META.length)
  check('meta.salaryPending derives frozen 10', setEq(META.filter(m => m.salaryPending).map(m => m.value), FROZEN_PENDING_10))
  check('exported PENDING === meta-derived pending', setEq(PENDING, META.filter(m => m.salaryPending).map(m => m.value)))
  check('meta.terminal === {Hoàn tất, Đã hủy}', setEq(META.filter(m => m.terminal).map(m => m.value), FROZEN_TERMINAL))
  const salaryCompleted = META.filter(m => m.salaryCompleted).map(m => m.value)
  check('exactly one salaryCompleted === Hoàn tất', salaryCompleted.length === 1 && salaryCompleted[0] === FROZEN_COMPLETED, `got [${salaryCompleted.join(', ')}]`)
  check('exported COMPLETED === meta salaryCompleted', COMPLETED === salaryCompleted[0])
  // Pin the P3 cron whitelist: overdue-INELIGIBLE = legacy deny-list + 6 video statuses.
  check('cronOverdueEligible=false === {Hoàn tất, Đã hủy, Quá hạn} + 6 video',
    setEq(META.filter(m => !m.cronOverdueEligible).map(m => m.value), FROZEN_OVERDUE_INELIGIBLE))
  check('OVERDUE_ELIGIBLE_STATUSES === meta-derived eligible',
    !!OVERDUE_ELIGIBLE && setEq(OVERDUE_ELIGIBLE, META.filter(m => m.cronOverdueEligible).map(m => m.value)))
  const phases = ['production', 'internal_review', 'client_review', 'closed']
  check('every status has a valid phase', META.every(m => phases.includes(m.phase)))
  check('every status has a non-empty clientLabel', META.every(m => typeof m.clientLabel === 'string' && m.clientLabel.length > 0))
  // internalOnly is exactly the 4 "(nội bộ)" / editor-only client-review video steps.
  check('internalOnly === {A2,A3,A4,A7}', setEq(
    META.filter(m => m.internalOnly).map(m => m.value),
    ['Đã nộp video (nội bộ)', 'Đang sửa feedback (nội bộ)', 'Đã sửa feedback (nội bộ)', 'Đã sửa feedback (khách)'],
  ))
}

console.log('\n[4] STATUS_TRANSITIONS (auto-transition guard, target → predecessors)')
if (!TRANSITIONS) {
  skip('transition assertions', 'STATUS_TRANSITIONS not exported yet')
} else {
  check('targets === the 6 video statuses', setEq(Object.keys(TRANSITIONS), FROZEN_TRANSITION_TARGETS))
  const allEndpoints = [...Object.keys(TRANSITIONS), ...Object.values(TRANSITIONS).flat()]
  check('every transition endpoint is a VALID status', allEndpoints.every(s => VALID.includes(s)),
    allEndpoints.filter(s => !VALID.includes(s)).join(', '))
  check('no target lists itself as a predecessor', Object.entries(TRANSITIONS).every(([t, preds]) => !preds.includes(t)))
}

console.log(`\nRESULT: ${failCount === 0 ? 'PASS' : 'FAIL'} — ${failCount} failed check(s)\n`)
process.exit(failCount > 0 ? 1 : 0)
