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

/* ── FROZEN contract — hand-copied from the pre-refactor constants. If any value
 *    here must ever change, that is a DELIBERATE payroll decision that MUST be
 *    reviewed, never a silent side effect of adding statuses. ─────────────────── */
const FROZEN_VALID_11 = [
  'Đang đợi giao', 'Nhận task', 'Đã nhận task', 'Đang thực hiện', 'Revision',
  'Sửa frame', 'Gửi lại', 'Tạm ngưng', 'Quá hạn', 'Hoàn tất', 'Đã hủy',
]
const FROZEN_PENDING_6 = [
  'Nhận task', 'Đang đợi giao', 'Đang thực hiện', 'Revision', 'Gửi lại', 'Sửa frame',
]
const FROZEN_COMPLETED = 'Hoàn tất'
const FROZEN_TERMINAL = ['Hoàn tất', 'Đã hủy']
// Non-terminal-ish statuses that are deliberately NOT salary-pending. A naive
// "non-terminal ⇒ pending" derivation would wrongly include these → underpay guard.
const FROZEN_NOT_PENDING_TRAPS = ['Đã nhận task', 'Tạm ngưng', 'Quá hạn']
// Statuses the cron (check-deadline) must NOT flip to 'Quá hạn' — today's deny-list.
const FROZEN_OVERDUE_INELIGIBLE = ['Hoàn tất', 'Đã hủy', 'Quá hạn']

type MetaRow = {
  value: string
  salaryPending: boolean
  salaryCompleted: boolean
  terminal: boolean
  internalOnly: boolean
  cronOverdueEligible: boolean
  phase: string
  order: number
}

const VALID = [...TaskStatuses.VALID_TASK_STATUSES] as string[]
const PENDING = TaskStatuses.SALARY_PENDING_STATUSES as string[]
const COMPLETED = TaskStatuses.SALARY_COMPLETED_STATUS as string
const META = (TaskStatuses as { TASK_STATUS_META?: readonly MetaRow[] }).TASK_STATUS_META

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

console.log('\n[1] Money constants pinned to frozen contract (runs pre- AND post-refactor)')
check('VALID_TASK_STATUSES length === 11', VALID.length === 11, `got ${VALID.length}`)
check('VALID_TASK_STATUSES === frozen 11 (set)', setEq(VALID, FROZEN_VALID_11))
check('SALARY_PENDING_STATUSES length === 6', PENDING.length === 6, `got ${PENDING.length}`)
check('SALARY_PENDING_STATUSES === frozen 6 (set)', setEq(PENDING, FROZEN_PENDING_6))
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
  check('meta.salaryPending derives frozen 6', setEq(META.filter(m => m.salaryPending).map(m => m.value), FROZEN_PENDING_6))
  check('exported PENDING === meta-derived pending', setEq(PENDING, META.filter(m => m.salaryPending).map(m => m.value)))
  check('meta.terminal === {Hoàn tất, Đã hủy}', setEq(META.filter(m => m.terminal).map(m => m.value), FROZEN_TERMINAL))
  const salaryCompleted = META.filter(m => m.salaryCompleted).map(m => m.value)
  check('exactly one salaryCompleted === Hoàn tất', salaryCompleted.length === 1 && salaryCompleted[0] === FROZEN_COMPLETED, `got [${salaryCompleted.join(', ')}]`)
  check('exported COMPLETED === meta salaryCompleted', COMPLETED === salaryCompleted[0])
  // Pin the P3 cron whitelist: overdue-INELIGIBLE must equal today's deny-list exactly.
  check('cronOverdueEligible=false === today deny-list {Hoàn tất, Đã hủy, Quá hạn}',
    setEq(META.filter(m => !m.cronOverdueEligible).map(m => m.value), FROZEN_OVERDUE_INELIGIBLE))
  const phases = ['production', 'internal_review', 'client_review', 'closed']
  check('every status has a valid phase', META.every(m => phases.includes(m.phase)))
}

console.log(`\nRESULT: ${failCount === 0 ? 'PASS' : 'FAIL'} — ${failCount} failed check(s)\n`)
process.exit(failCount > 0 ? 1 : 0)
