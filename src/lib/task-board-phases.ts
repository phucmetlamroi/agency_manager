// [Mobile P2 §2b] Canonical 6-phase task board — the ONE definition shared by the
// desktop board and the mobile Task tab. These 6 phases + their status buckets + drop
// targets are byte-mirrored from `components/TaskWorkflowTabs.tsx` TABS (the historic
// source of truth); a later cleanup PR can flip TaskWorkflowTabs to import from here so
// there is a single list. DO NOT let the two drift — status buckets are load-bearing
// (payroll/portal-derive read the same status strings).
//
// [F2/E2 phase-grouping] The 6 video statuses (A2–A7) are grouped by phase:
//   internal_review (A2/A3/A4 + legacy Revision) → "Duyệt nội bộ"
//   client_review   (A5/A6/A7)                   → "Khách duyệt"
// so a video task is never "lost" from the board.

export type BoardPhaseId = 'pool' | 'all' | 'progress' | 'internal' | 'client' | 'overdue' | 'done'

export interface BoardPhase {
    id: BoardPhaseId
    /** Vietnamese tab label (VN internal UI). */
    label: string
    /** Statuses that live in this phase (never null — every phase is a real bucket). */
    statuses: string[]
    /** CSS colour token (hsl(var(--…)) — resolved by globals.css, same hue as desktop). */
    color: string
    /**
     * Status a task takes when dropped INTO this phase, or null when the phase is not a
     * drop target. "Đã giao task" (assign/claim only) + "Khách duyệt" (real send-to-client
     * flow, not a plain status set) are intentionally null — mirrors TaskWorkflowTabs.
     */
    targetStatus: string | null
}

export const BOARD_PHASES: BoardPhase[] = [
    // [review-fix] MOBILE-ONLY extra phase: the mobile Task tab shows ALL tasks (owner "Cách A"),
    // so the unassigned pool ('Đang đợi giao') needs its OWN bucket — without it, FAB-created or
    // returned-to-pool tasks fell into no phase and vanished (board falsely read "đã xử lý hết").
    // Desktop TaskWorkflowTabs surfaces the pool as a separate "Kho Task Đợi" list, not a tab.
    { id: 'pool', label: 'Chờ giao', statuses: ['Đang đợi giao'], color: 'hsl(var(--status-waiting))', targetStatus: 'Đang đợi giao' },
    { id: 'all', label: 'Đã giao task', statuses: ['Nhận task', 'Đã nhận task'], color: 'hsl(var(--primary))', targetStatus: null },
    { id: 'progress', label: 'Đang làm', statuses: ['Đang thực hiện'], color: 'hsl(var(--status-doing))', targetStatus: 'Đang thực hiện' },
    { id: 'internal', label: 'Duyệt nội bộ', statuses: ['Đã nộp video (nội bộ)', 'Đang sửa feedback (nội bộ)', 'Đã sửa feedback (nội bộ)', 'Revision'], color: 'hsl(var(--status-review))', targetStatus: 'Đã nộp video (nội bộ)' },
    { id: 'client', label: 'Khách duyệt', statuses: ['Đã gửi video (khách)', 'Đã nhận feedback (khách)', 'Đã sửa feedback (khách)'], color: 'hsl(var(--status-sent))', targetStatus: null },
    { id: 'overdue', label: 'Quá hạn', statuses: ['Quá hạn'], color: 'hsl(var(--destructive))', targetStatus: 'Quá hạn' },
    { id: 'done', label: 'Hoàn tất', statuses: ['Hoàn tất'], color: 'hsl(var(--status-done))', targetStatus: 'Hoàn tất' },
]

/** Count tasks that fall inside a phase's status bucket. */
export function countTasksInPhase<T extends { status: string }>(tasks: T[], phase: BoardPhase): number {
    return tasks.filter((t) => phase.statuses.includes(t.status)).length
}

/** First phase (in board order) that has at least one task; falls back to the first phase. */
export function pickInitialPhase<T extends { status: string }>(tasks: T[]): BoardPhaseId {
    return (BOARD_PHASES.find((p) => countTasksInPhase(tasks, p) > 0) ?? BOARD_PHASES[0]).id
}
