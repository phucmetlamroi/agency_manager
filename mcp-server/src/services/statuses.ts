/**
 * Copy of src/lib/task-statuses.ts — zero external dependencies.
 * Single source of truth for valid task statuses in MCP server.
 */

export const VALID_TASK_STATUSES = [
    'Đang đợi giao',
    'Nhận task',
    'Đã nhận task',
    'Đang thực hiện',
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
]

export const SALARY_COMPLETED_STATUS = 'Hoàn tất'
