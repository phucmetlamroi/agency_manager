/**
 * Copy of src/lib/task-statuses.ts — zero external dependencies.
 * Single source of truth for valid task statuses in MCP server.
 */

export const VALID_TASK_STATUSES = [
    'Đang đợi giao',
    'Nhận task',
    'Đã nhận task',
    'Đang thực hiện',
    // [P3/F2] 6 video-lifecycle statuses (A2–A7) — mirror src/lib/task-statuses.ts.
    'Đã nộp video (nội bộ)',
    'Đang sửa feedback (nội bộ)',
    'Đã sửa feedback (nội bộ)',
    'Đã gửi video (khách)',
    'Đã nhận feedback (khách)',
    'Đã sửa feedback (khách)',
    'Revision',
    'Sửa frame',
    'Gửi lại',
    'Tạm ngưng',
    'Quá hạn',
    'Hoàn tất',
    'Đã hủy',
] as const

export type TaskStatus = typeof VALID_TASK_STATUSES[number]

export function isValidStatus(s: unknown): s is TaskStatus {
    return typeof s === 'string' && (VALID_TASK_STATUSES as readonly string[]).includes(s)
}

export const SALARY_PENDING_STATUSES = [
    'Nhận task',
    'Đang đợi giao',
    'Đang thực hiện',
    'Revision',
    'Gửi lại',
    'Sửa frame',
    // [P3/F2] the 6 video statuses all count as salary-pending (editor work in flight).
    'Đã nộp video (nội bộ)',
    'Đang sửa feedback (nội bộ)',
    'Đã sửa feedback (nội bộ)',
    'Đã gửi video (khách)',
    'Đã nhận feedback (khách)',
    'Đã sửa feedback (khách)',
]

export const SALARY_COMPLETED_STATUS = 'Hoàn tất'
