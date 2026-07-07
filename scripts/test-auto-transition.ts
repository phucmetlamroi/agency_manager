/**
 * [review-fixes P3-B — F7/F8/F9/F10 auto-transition guards]
 *
 * Pins the PREDECESSOR guard matrix (canAutoTransition / STATUS_TRANSITIONS) that every
 * auto/staff flip runs through, plus the invariants the sync services depend on:
 *   1. Each F7–F10 flip is reachable from EXACTLY its allowed predecessors, and NOT from
 *      any approved/terminal/out-of-order state (a late Mux webhook can't drag A5 back to A2).
 *   2. The guest-change retarget is asymmetric: A6 is reachable ONLY from A5 — every other
 *      current status falls back to legacy 'Revision'. A6 is NOT its own predecessor, which
 *      is exactly why syncTaskOnChangesRequested needs an explicit already-A6 no-op guard
 *      (else canAutoTransition(A6,A6)=false would pick 'Revision' and DEMOTE A6).
 *   3. Money-safety (R1): every auto-transition TARGET is salaryPending — an auto-flip can
 *      never move an editor's in-flight work out of the payroll "pending" set.
 *   4. REVIEW_STATUS_MAP video keys resolve to VALID statuses (config-driven, no drift).
 *
 * Pure — no DB / env / network.  Usage:  npx tsx scripts/test-auto-transition.ts
 */

import {
    canAutoTransition,
    STATUS_TRANSITIONS,
    TASK_STATUS_META,
    isValidStatus,
} from '../src/lib/task-statuses'
import { REVIEW_STATUS_MAP } from '../src/lib/review/status-map'

let failCount = 0
function check(name: string, pass: boolean, detail = '') {
    if (pass) console.log(`  ✅ ${name}`)
    else { failCount++; console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

const A1 = 'Đang thực hiện'
const A2 = 'Đã nộp video (nội bộ)'
const A3 = 'Đang sửa feedback (nội bộ)'
const A4 = 'Đã sửa feedback (nội bộ)'
const A5 = 'Đã gửi video (khách)'
const A6 = 'Đã nhận feedback (khách)'
const A7 = 'Đã sửa feedback (khách)'
const REVISION = 'Revision'
const DONE = 'Hoàn tất'

console.log('\n[1] REVIEW_STATUS_MAP video keys resolve to the right VALID statuses')
check('submitted === A2', REVIEW_STATUS_MAP.submitted === A2)
check('internalFeedbackOpen === A3', REVIEW_STATUS_MAP.internalFeedbackOpen === A3)
check('internalFixDone === A4', REVIEW_STATUS_MAP.internalFixDone === A4)
check('sentToClient === A5', REVIEW_STATUS_MAP.sentToClient === A5)
check('clientChangesRequested === A6', REVIEW_STATUS_MAP.clientChangesRequested === A6)
check('clientFixDone === A7', REVIEW_STATUS_MAP.clientFixDone === A7)
check('changesRequested === Revision (legacy, UNCHANGED)', REVIEW_STATUS_MAP.changesRequested === REVISION)
for (const [k, v] of Object.entries(REVIEW_STATUS_MAP)) {
    check(`REVIEW_STATUS_MAP.${k} is a VALID status`, isValidStatus(v), `got "${v}"`)
}

console.log('\n[2] F7 — Mux READY → A2: allowed predecessors ONLY (incl. A4 internal re-upload loop)')
for (const from of [A1, 'Sửa frame', 'Gửi lại', REVISION, A4]) {
    check(`${from} → A2 allowed`, canAutoTransition(from, A2))
}
for (const from of [A2, A3, A5, A6, A7, DONE, 'Đã hủy']) {
    check(`${from} → A2 BLOCKED`, !canAutoTransition(from, A2))
}

console.log('\n[3] F8 — admin closes feedback → A3: only from A2')
check('A2 → A3 allowed', canAutoTransition(A2, A3))
for (const from of [A1, A3, A4, A5, A6, DONE]) check(`${from} → A3 BLOCKED`, !canAutoTransition(from, A3))

console.log('\n[4] F9 — editor confirms fix → A4 (internal) / A7 (client)')
check('A3 → A4 allowed', canAutoTransition(A3, A4))
check('A6 → A7 allowed', canAutoTransition(A6, A7))
for (const from of [A1, A2, A4, A5, DONE]) check(`${from} → A4 BLOCKED`, !canAutoTransition(from, A4))
for (const from of [A1, A3, A4, A5, A7, DONE]) check(`${from} → A7 BLOCKED`, !canAutoTransition(from, A7))

console.log('\n[5] F10 — admin approve → A5: from A2 / A4 / A7 only')
for (const from of [A2, A4, A7]) check(`${from} → A5 allowed`, canAutoTransition(from, A5))
for (const from of [A1, A3, A5, A6, DONE, 'Đã hủy']) check(`${from} → A5 BLOCKED`, !canAutoTransition(from, A5))

console.log('\n[6] Guest "request changes" → A6: reachable ONLY from A5 (asymmetric, K6)')
check('A5 → A6 allowed', canAutoTransition(A5, A6))
for (const from of [A1, A2, A3, A4, A6, A7, DONE, 'Gửi lại', REVISION]) {
    check(`${from} → A6 BLOCKED (falls back to legacy Revision)`, !canAutoTransition(from, A6))
}
// The load-bearing reason for the explicit already-A6 no-op guard in syncTaskOnChangesRequested:
check('A6 is NOT its own predecessor (why the already-A6 guard exists)', !canAutoTransition(A6, A6))

// Replicate the exact target-selection of syncTaskOnChangesRequested (pure) to lock its intent.
function pickGuestChangeTarget(current: string): 'noop' | typeof A6 | typeof REVISION {
    // Already inside the post-send client lifecycle (A6 or A7) → no-op, never demote to Revision.
    if (current === REVIEW_STATUS_MAP.clientChangesRequested || current === REVIEW_STATUS_MAP.clientFixDone) {
        return 'noop'
    }
    return canAutoTransition(current, REVIEW_STATUS_MAP.clientChangesRequested)
        ? REVIEW_STATUS_MAP.clientChangesRequested
        : REVIEW_STATUS_MAP.changesRequested
}
console.log('\n[7] Guest-change target selection (mirror of syncTaskOnChangesRequested)')
check('at A5 → A6', pickGuestChangeTarget(A5) === A6)
check('at A6 → noop (no demotion to Revision)', pickGuestChangeTarget(A6) === 'noop')
check('at A7 → noop (no demotion to Revision — the review-flagged one-node-later bug)', pickGuestChangeTarget(A7) === 'noop')
check('at A1 (never sent) → legacy Revision', pickGuestChangeTarget(A1) === REVISION)
check('at "Gửi lại" → legacy Revision', pickGuestChangeTarget('Gửi lại') === REVISION)
check('at A4 (internal, never sent) → legacy Revision', pickGuestChangeTarget(A4) === REVISION)

console.log('\n[8] Money-safety (R1): every auto-transition TARGET is salaryPending')
const pendingSet = new Set(TASK_STATUS_META.filter((m) => m.salaryPending).map((m) => m.value))
const AUTO_TARGETS = [A2, A3, A4, A5, A6, A7, REVISION]
for (const t of AUTO_TARGETS) {
    check(`target "${t}" is salaryPending (editor stays owed)`, pendingSet.has(t))
}

console.log(`\nRESULT: ${failCount === 0 ? 'PASS' : 'FAIL'} — ${failCount} failed check(s)\n`)
process.exit(failCount > 0 ? 1 : 0)
