/**
 * [B5/P4] Regression tests for the portal review-video surface. Pure — NO DB/env/network.
 *
 * Guards the two invariants B5 depends on:
 *  1. R5 gate (isClientFacingPhase): an INTERNAL cut is NEVER surfaced to the client; a
 *     client-phase cut is. This is the security lynchpin of the read-side surface.
 *  2. STATUS_CFG exhaustiveness: EVERY client label deriveClientStatus can emit has a
 *     STATUS_CFG key — so a new client-facing status can never silently fall back to the
 *     wrong 'Received' badge (the exact symptom-2 of B5, and the class of bug behind it).
 *
 * Usage:  npx tsx scripts/test-b5-portal-video.ts
 */
import { TASK_STATUS_META } from '../src/lib/task-statuses'
import { clientLabelOf, deriveClientStatus, isClientFacingPhase } from '../src/lib/portal-derive'
import { STATUS_CFG } from '../src/components/portal/calm/ui'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
    if (ok) { passed++; console.log(`  ✅ ${name}`) }
    else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

console.log('\n[test-b5] R5 gate — internal phases must NOT surface a cut:')
// Every internal / production / system status → clientPhase FALSE when clientReview is null.
const INTERNAL_OR_SYSTEM = [
    'Đã nộp video (nội bộ)', 'Đang sửa feedback (nội bộ)', 'Đã sửa feedback (nội bộ)', // A2/A3/A4
    'Đang thực hiện', 'Nhận task', 'Đã nhận task', 'Đang đợi giao', 'Quá hạn', 'Revision',
]
for (const s of INTERNAL_OR_SYSTEM) {
    check(`internal:"${s}"→gate=false`, isClientFacingPhase(s, null) === false)
}

console.log('\n[test-b5] R5 gate — client phases MUST surface a cut:')
const CLIENT_PHASE = ['Đã gửi video (khách)', 'Đã nhận feedback (khách)', 'Đã sửa feedback (khách)'] // A5/A6/A7
for (const s of CLIENT_PHASE) {
    check(`client:"${s}"→gate=true`, isClientFacingPhase(s, null) === true)
}
// A free-typed client-phase string (contains "khách") still passes — substring on purpose.
check('freeTyped:"Đã gửi (khách)"→gate=true', isClientFacingPhase('Đã gửi (khách)', null) === true)
// clientReview != null forces client-phase even if the status looks internal.
check('clientReview=CHANGES→gate=true', isClientFacingPhase('Đang thực hiện', 'CHANGES') === true)

console.log('\n[test-b5] STATUS_CFG exhaustiveness — every emitted client label has a badge:')
const labels = new Set<string>()
for (const m of TASK_STATUS_META) labels.add(clientLabelOf(m.value))
for (const cr of ['AWAITING', 'APPROVED', 'CHANGES']) labels.add(deriveClientStatus('Đang thực hiện', cr))
for (const l of Array.from(labels).sort()) {
    check(`STATUS_CFG has "${l}"`, l in STATUS_CFG, `add '${l}' to STATUS_CFG (ui.tsx)`)
}

console.log('\n[test-b5] Regression — the exact B5 symptom-2 (canonical A5 badge):')
// deriveClientStatus('Đã gửi video (khách)', null) → 'Ready for your review' → MUST be a badge key,
// else it falls back to STATUS_CFG['Received'] (the wrong "Received" the owner saw).
check(
    'A5 badge ≠ Received fallback',
    deriveClientStatus('Đã gửi video (khách)', null) in STATUS_CFG,
    "'Ready for your review' missing from STATUS_CFG",
)

console.log(`\nRESULT: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
