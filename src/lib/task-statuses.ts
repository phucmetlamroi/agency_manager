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
    'Revision',                         // user delivery / admin reject → review
    'Sửa frame',                  // Sửa frame — frame fix
    'Gửi lại',               // Gửi lại — resubmit
    'Tạm ngưng',             // Tạm ngưng — paused
    'Quá hạn',               // Quá hạn — overdue (cron-set)
    'Hoàn tất',              // Hoàn tất — completed
    'Đã hủy',           // Đã hủy — cancelled
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
}

/**
 * [F2] Attribute table for every task status. P0: the 11 legacy values ONLY (the 6
 * video statuses land in P3). salaryPending/terminal are assigned PER VALUE to
 * reproduce the pre-refactor constants EXACTLY — NOT derived from terminal-ness:
 * 'Đã nhận task', 'Tạm ngưng', 'Quá hạn' are non-terminal yet salaryPending=false.
 * The snapshot-test (scripts/test-status-meta-snapshot.ts) is the hard gate. Rows are
 * listed in VALID_TASK_STATUSES order for easy diffing; `order` is the sort key.
 */
export const TASK_STATUS_META = [
    { value: 'Đang đợi giao',  salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 10 },
    { value: 'Nhận task',      salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 12 },
    { value: 'Đã nhận task',   salaryPending: false, salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 14 },
    { value: 'Đang thực hiện', salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 20 },
    { value: 'Revision',       salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'internal_review', order: 44 },
    { value: 'Sửa frame',      salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'internal_review', order: 46 },
    { value: 'Gửi lại',        salaryPending: true,  salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'client_review',   order: 48 },
    { value: 'Tạm ngưng',      salaryPending: false, salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: true,  phase: 'production',      order: 16 },
    { value: 'Quá hạn',        salaryPending: false, salaryCompleted: false, terminal: false, internalOnly: false, cronOverdueEligible: false, phase: 'production',      order: 18 },
    { value: 'Hoàn tất',       salaryPending: false, salaryCompleted: true,  terminal: true,  internalOnly: false, cronOverdueEligible: false, phase: 'closed',          order: 90 },
    { value: 'Đã hủy',         salaryPending: false, salaryCompleted: false, terminal: true,  internalOnly: false, cronOverdueEligible: false, phase: 'closed',          order: 99 },
] as const satisfies readonly TaskStatusMeta[]

/**
 * [F2] Statuses that count as "salary pending" — DERIVED from meta (was a hardcoded
 * array). Kept as string[] (order-independent; consumers use .includes() / Prisma
 * { in: [...] }). The snapshot-test pins this to the exact pre-refactor 6.
 */
export const SALARY_PENDING_STATUSES: string[] = TASK_STATUS_META.filter(m => m.salaryPending).map(m => m.value)

/** [F2] The single completed status used by payroll — DERIVED from meta. */
export const SALARY_COMPLETED_STATUS: TaskStatus = TASK_STATUS_META.find(m => m.salaryCompleted)!.value
