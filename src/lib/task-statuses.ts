// Keep status strings in escaped form to avoid encoding drift across environments.
// [Sprint A] Bỏ 'Review' status — submit giờ đi thẳng Revision.
// [Sprint W] Add VALID_STATUSES + isValidStatus() để validate ở action layer,
// chặn task task bị set status legacy như 'Review' khiến task ẩn khỏi UI.
// [review-fixes P0 / F2] Meta-hóa 11 value CŨ vào TASK_STATUS_META (bảng thuộc
// tính tập trung: salaryPending / terminal / internalOnly / cronOverdueEligible /
// phase). SALARY_PENDING_STATUSES + SALARY_COMPLETED_STATUS giờ DERIVE từ meta —
// scripts/test-status-meta-snapshot.ts khóa các hằng lương (rủi ro số 1: payroll
// đếm thiếu tiền editor). CHƯA thêm 6 status video (đó là P3). Tên là
// TASK_STATUS_META, KHÔNG phải STATUS_META (tên đó đã thuộc hook-graph-style.ts).

/**
 * Canonical list of ALL valid task statuses. Single source of truth for the VALUE
 * SET + display order. Attribute table = TASK_STATUS_META (bound to this list by
 * the snapshot-test). Khi cần thêm status mới: update HERE + TASK_STATUS_META +
 * bản copy MCP (mcp-server/src/services/statuses.ts) + STATUS_COLORS trong UI.
 */
export const VALID_TASK_STATUSES = [
    'Đang đợi giao',  // Đang đợi giao — waiting to be assigned
    'Nhận task',                  // Nhận task — assigned, not started
    'Đã nhận task',    // Đã nhận task — variant
    'Đang thực hiện',   // Đang thực hiện — in progress
    // [P3/F2] 6 video-lifecycle statuses (A2–A7). Task.status is a free String
    // (schema.prisma) → adding values needs NO migration. Auto-set by the review
    // module (F7–F10); admin may also set them by hand (no FSM enforcement, R10).
    'Đã nộp video (nội bộ)',      // A2 — Mux READY (F7)
    'Đang sửa feedback (nội bộ)', // A3 — admin closed the feedback session (F8)
    'Đã sửa feedback (nội bộ)',   // A4 — editor confirmed the fix (F9)
    'Đã gửi video (khách)',       // A5 — admin approved & sent to the client (F10)
    'Đã nhận feedback (khách)',   // A6 — guest requested changes
    'Đã sửa feedback (khách)',    // A7 — editor confirmed the client fix
    'Revision',                         // user delivery / admin reject → review (KEPT — load-bearing)
    // [bug-report #2] 'Sửa frame' / 'Gửi lại' / 'Tạm ngưng' REMOVED per owner (2026-07-07). Existing
    // rows are remapped by scripts/migrate-drop-legacy-statuses.ts BEFORE deploy: Sửa frame→Revision,
    // Gửi lại→Revision, Tạm ngưng→Đang thực hiện. 'Revision' + 'Đã hủy' stay valid.
    'Quá hạn',               // Quá hạn — overdue (cron-set)
    'Hoàn tất',              // Hoàn tất — completed
    'Đã hủy',           // Đã hủy — cancelled (cancel/archive mechanism — kept, hidden from board via isArchived)
] as const

export type TaskStatus = typeof VALID_TASK_STATUSES[number]

export function isValidStatus(s: unknown): s is TaskStatus {
    return typeof s === 'string' && (VALID_TASK_STATUSES as readonly string[]).includes(s)
}

/**
 * Lifecycle phase of a status. Video statuses (P3) will slot into internal_review /
 * client_review; the 11 legacy statuses map as below. Consumed by P3 (portal-derive
 * EN mapping + board grouping) — recorded now so P0 stays a pure additive refactor.
 */
export type TaskStatusPhase = 'production' | 'internal_review' | 'client_review' | 'closed'

export interface TaskStatusMeta {
    /** The DB value — a member of VALID_TASK_STATUSES. */
    value: TaskStatus
    /** Counts toward "editor is owed money for work in flight" (payroll). LOAD-BEARING. */
    salaryPending: boolean
    /** The single "delivered & accepted" status used by payroll (only 'Hoàn tất'). */
    salaryCompleted: boolean
    /** No further transitions expected ('Hoàn tất' / 'Đã hủy'). */
    terminal: boolean
    /** Client portal (EN) must NOT see the raw VI string for this status (P3 portal-derive). */
    internalOnly: boolean
    /** Cron check-deadline may flip this to 'Quá hạn' when past deadline (P3 whitelist). */
    cronOverdueEligible: boolean
    /** Lifecycle phase (P3 board grouping). */
    phase: TaskStatusPhase
    /** Stable sort key along the lifecycle axis. */
    order: number
    /** Client-facing EN label when NOT internalOnly. internalOnly rows fall back to
     *  PHASE_CLIENT_LABEL[phase] in portal-derive, so their clientLabel is illustrative. */
    clientLabel: string
}

/**
 * [F2] Attribute table for every task status. P0: the 11 legacy values ONLY (the 6
 * video statuses land in P3). salaryPending/terminal are assigned PER VALUE to
 * reproduce the pre-refactor constants EXACTLY — NOT derived from terminal-ness:
 * 'Đã nhận task', 'Quá hạn' are non-terminal yet salaryPending=false.
 * The snapshot-test (scripts/test-status-meta-snapshot.ts) is the hard gate. Rows are
 * listed in VALID_TASK_STATUSES order for easy diffing; `order` is the sort key.
 */
export const TASK_STATUS_META = [
    // ── Group B: 9 legacy system statuses (value + behaviour UNCHANGED) ──
    { value: 'Đang đợi giao',  salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 10, clientLabel: 'In production' },
    { value: 'Nhận task',      salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 12, clientLabel: 'Received' },
    { value: 'Đã nhận task',   salaryPending: false, salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 14, clientLabel: 'Received' },
    { value: 'Đang thực hiện', salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 20, clientLabel: 'In progress' },
    { value: 'Revision',       salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'internal_review', order: 44, clientLabel: 'In revision' },
    // [bug-report #2] 'Sửa frame', 'Gửi lại', 'Tạm ngưng' rows REMOVED (owner 2026-07-07). SALARY_PENDING
    // now derives to 10 (drops Sửa frame + Gửi lại — both salaryPending:true; existing rows migrate to
    // 'Revision' which is also salaryPending, so no editor is under-counted). 'Tạm ngưng' was a non-pending trap.
    { value: 'Quá hạn',        salaryPending: false, salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: false, phase: 'production',      order: 18, clientLabel: 'In progress' },
    { value: 'Hoàn tất',       salaryPending: false, salaryCompleted: true,  terminal: true,  internalOnly: false, cronOverdueEligible: false, phase: 'closed',          order: 90, clientLabel: 'Completed' },
    { value: 'Đã hủy',         salaryPending: false, salaryCompleted: false, terminal: true,  internalOnly: false, cronOverdueEligible: false, phase: 'closed',          order: 99, clientLabel: 'Closed' },
    // ── Group A: 6 NEW video-lifecycle statuses (A2–A7). All salaryPending:true (R1:
    //    payroll must count editor work in flight). cronOverdueEligible:FALSE — the cron
    //    still OVERWRITES status='Quá hạn' (giai đoạn 1), so excluding the video statuses
    //    from its whitelist is what stops it wiping the video lifecycle context (R3). The
    //    board still shows the derived "QUÁ HẠN" badge (deadline<now), i.e. the giai-đoạn-2
    //    goal without an overdueAt schema column (schema is frozen for this project). ──
    { value: 'Đã nộp video (nội bộ)',      salaryPending: true, salaryCompleted: false, terminal: false, internalOnly: true,  cronOverdueEligible: false, phase: 'internal_review', order: 30, clientLabel: 'In progress' },
    { value: 'Đang sửa feedback (nội bộ)', salaryPending: true, salaryCompleted: false, terminal: false, internalOnly: true,  cronOverdueEligible: false, phase: 'internal_review', order: 40, clientLabel: 'In progress' },
    { value: 'Đã sửa feedback (nội bộ)',   salaryPending: true, salaryCompleted: false, terminal: false, internalOnly: true,  cronOverdueEligible: false, phase: 'internal_review', order: 50, clientLabel: 'In progress' },
    { value: 'Đã gửi video (khách)',       salaryPending: true, salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: false, phase: 'client_review',   order: 60, clientLabel: 'Ready for your review' },
    { value: 'Đã nhận feedback (khách)',   salaryPending: true, salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: false, phase: 'client_review',   order: 70, clientLabel: 'Revising' },
    { value: 'Đã sửa feedback (khách)',    salaryPending: true, salaryCompleted: false, terminal: false, internalOnly: true,  cronOverdueEligible: false, phase: 'client_review',   order: 80, clientLabel: 'In review' },
] as const satisfies readonly TaskStatusMeta[]

/**
 * [F2] Statuses that count as "salary pending" — DERIVED from meta (was a hardcoded
 * array). Kept as string[] (order-independent; consumers use .includes() / Prisma
 * { in: [...] }). The snapshot-test pins this to the exact pre-refactor 6.
 */
export const SALARY_PENDING_STATUSES: string[] = TASK_STATUS_META.filter(m => m.salaryPending).map(m => m.value)

/** [F2] The single completed status used by payroll — DERIVED from meta. */
export const SALARY_COMPLETED_STATUS: TaskStatus = TASK_STATUS_META.find(m => m.salaryCompleted)!.value

/**
 * [P3/F2 bước 3] Statuses the cron (check-deadline) MAY flip to 'Quá hạn' — the
 * WHITELIST replacing the old blacklist `notIn ['Hoàn tất','Đã hủy','Quá hạn']`.
 * DERIVED from meta so new statuses are covered by decision, not omission. The 6 video
 * statuses are `cronOverdueEligible:false` → excluded here → the cron never overwrites
 * their lifecycle value.
 */
export const OVERDUE_ELIGIBLE_STATUSES: string[] = TASK_STATUS_META.filter(m => m.cronOverdueEligible).map(m => m.value)

/**
 * Statuses in the internal-review or client-review phase — i.e. exactly the tasks shown under the
 * "Duyệt nội bộ" (A2/A3/A4 + Revision) and "Khách duyệt" (A5/A6/A7) board tabs. A task here is waiting
 * on a reviewer (admin or client), so it has NO active deadline and must never be shown/counted as
 * overdue. Owner rule (2026-07-08): the trigger is the TAB/phase, not any single status. DERIVED from
 * the phase meta so it stays correct if statuses are added/removed. Consumed by STATUS_REQUIRES_NULL_DEADLINE
 * (clears the deadline on entry) + the board overdue-badge suppression.
 */
export const REVIEW_PHASE_STATUSES: string[] = TASK_STATUS_META
    .filter(m => m.phase === 'internal_review' || m.phase === 'client_review')
    .map(m => m.value)

/** True when a task's status sits in the internal/client review phase (the two review tabs). */
export function isReviewPhaseStatus(status: string | null | undefined): boolean {
    return !!status && REVIEW_PHASE_STATUSES.includes(status)
}

/** Terminal statuses ('Hoàn tất' completed / 'Đã hủy' cancelled) — DERIVED from meta. */
export const TERMINAL_STATUSES: string[] = TASK_STATUS_META.filter((m) => m.terminal).map((m) => m.value)

/**
 * True when a task's status is terminal. [E1/J1] Auto-transitions triggered by review
 * events (Inngest / Mux webhook / a guest decision) must NEVER flip a terminal task — a
 * completed ('Hoàn tất', already paid via payroll) or cancelled task can only be re-opened
 * by an explicit manual staff status change, not by a late guest "request changes".
 */
export function isTerminalStatus(status: string | null | undefined): boolean {
    return !!status && TERMINAL_STATUSES.includes(status)
}

/**
 * [Q1] The CLIENT-FACING label to email/show for a status, or null when the status is internal-only
 * (the client must never be told a raw internal status). Used to gate + label the guest `status_update`
 * email so an `internalOnly` transition never notifies the client.
 */
export function clientVisibleLabel(status: string | null | undefined): string | null {
    const meta = TASK_STATUS_META.find((m) => m.value === status)
    if (!meta || meta.internalOnly) return null
    return meta.clientLabel
}

/** Lifecycle phase → the EN label a client sees for any internalOnly status in it. */
export const PHASE_CLIENT_LABEL: Record<TaskStatusPhase, string> = {
    production: 'In progress',
    internal_review: 'In progress',
    client_review: 'In review',
    closed: 'Completed',
}

/**
 * [P3/F2 §3.2] AUTO-transition guard map — KEY = target status, VALUE = allowed
 * predecessors. Only the 6 video statuses are auto-transition targets (F7–F10). A guard
 * flips only when `current ∈ STATUS_TRANSITIONS[target]`, so a late Mux webhook can't drag
 * an already-approved task back a step. ⚠️ This is ONLY for auto-transition (Inngest /
 * webhook / guest). It is NOT enforcement on manual status changes (R10 — validateTransition
 * stays disabled by explicit project decision).
 */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
    // F7 — Mux READY. Includes A4 'Đã sửa feedback (nội bộ)' so a CORRECTED cut re-uploaded during
    // the internal round loops BACK into review (STATUS-MACHINE §3.1 diagram "A4 → …READY→ về A2" +
    // §3.3 predecessor "A1 lần đầu HOẶC A4 vòng lặp"). Without it a re-upload at A4 would strand the
    // task at A4 with the only forward auto-path being F10→client, pushing an un-reviewed cut out.
    // F7 — Mux READY. Includes A5 'Đã gửi video (khách)' so a NEW cut re-uploaded AFTER the task
    // was already sent to the client loops BACK into internal review (R1): revokeClientExposureOnNewVersion
    // has already revoked the share + nulled clientReview, and A5→A2 here un-sticks the task so the admin
    // can F10 re-send. Without it the task stranded at A5 with dead links and every review-module button 409'd.
    'Đã nộp video (nội bộ)':      ['Đang thực hiện', 'Revision', 'Đã sửa feedback (nội bộ)', 'Đã gửi video (khách)'], // F7
    // F8 — admin closes/opens an internal feedback session. A2 = round 1 (right after upload);
    // A4 = RE-OPEN a NEW round after the editor already confirmed a prior fix (multi-round loop —
    // feedback-flow spec §Giai đoạn 4). The prior round's comments are already resolved, so the
    // new round's comments stand out as the only open ones. Manual admin action only (not auto).
    'Đang sửa feedback (nội bộ)': ['Đã nộp video (nội bộ)', 'Đã sửa feedback (nội bộ)'],           // F8
    'Đã sửa feedback (nội bộ)':   ['Đang sửa feedback (nội bộ)'],                                   // F9
    'Đã gửi video (khách)':       ['Đã sửa feedback (nội bộ)', 'Đã nộp video (nội bộ)', 'Đã sửa feedback (khách)'], // F10
    'Đã nhận feedback (khách)':   ['Đã gửi video (khách)'],                                         // guest request changes
    'Đã sửa feedback (khách)':    ['Đã nhận feedback (khách)'],                                     // editor confirmed client fix
}

/** True when `current` is an allowed predecessor of `target` (auto-transition guard). */
export function canAutoTransition(current: string, target: string): boolean {
    const preds = STATUS_TRANSITIONS[target]
    return !!preds && preds.includes(current)
}
