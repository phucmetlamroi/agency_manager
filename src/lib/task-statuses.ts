// Keep status strings in escaped form to avoid encoding drift across environments.
// [Sprint A] Bỏ 'Review' status — submit giờ đi thẳng Revision.
// [Sprint W] Add VALID_STATUSES + isValidStatus() để validate ở action layer,
// chặn task task bị set status legacy như 'Review' khiến task ẩn khỏi UI.

/**
 * Canonical list of ALL valid task statuses. Single source of truth.
 * Khi cần thêm status mới: update HERE + STATUS_COLORS trong UI components.
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

export const SALARY_PENDING_STATUSES = [
    'Nhận task',
    'Đang đợi giao',
    'Đang thực hiện',
    'Revision',
    'Gửi lại',
    'Sửa frame'
]

export const SALARY_COMPLETED_STATUS = 'Hoàn tất'
