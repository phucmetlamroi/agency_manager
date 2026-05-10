import type { TaskWithUser } from '@/types/admin'

/**
 * Admin-only financial fields that must NEVER leak to non-admin users.
 *
 * - `jobPriceUSD`: số tiền client trả cho task — agency revenue
 * - `exchangeRate`: tỷ giá USD→VND dùng để tính revenue
 * - `profitVND`: lợi nhuận tính được sau khi trừ wage
 *
 * Lộ bất kỳ field nào → non-admin staff biết doanh thu agency, vi phạm nghiệp vụ.
 */
const SENSITIVE_FIELDS = ['jobPriceUSD', 'exchangeRate', 'profitVND'] as const

/**
 * Strip admin-only financial fields from a task object before passing to a
 * non-admin client. Use SERVER-SIDE before serializing tasks for components
 * that render in non-admin contexts (e.g. /dashboard pages).
 *
 * Behaviour:
 *   - `isAdmin === true`  → return task as-is (full data)
 *   - `isAdmin === false` → set sensitive fields to `null` (preserves shape so
 *     TaskWithUser type contract stays valid; consumers should treat null as
 *     "field not available" rather than zero)
 *
 * Generic over `T extends Partial<TaskWithUser>` so this works for any subset
 * of TaskWithUser fields (e.g. partial selects, aggregated rows).
 */
export function sanitizeTaskForUser<T extends Partial<TaskWithUser>>(
    task: T,
    isAdmin: boolean,
): T {
    if (isAdmin) return task
    const sanitized: any = { ...task }
    for (const field of SENSITIVE_FIELDS) {
        if (field in sanitized) sanitized[field] = null
    }
    return sanitized as T
}

/**
 * Bulk variant — strip sensitive fields from a list of tasks.
 *
 * Returns the input array unchanged when admin (no allocation overhead).
 */
export function sanitizeTaskListForUser<T extends Partial<TaskWithUser>>(
    tasks: T[],
    isAdmin: boolean,
): T[] {
    if (isAdmin) return tasks
    return tasks.map((t) => sanitizeTaskForUser(t, isAdmin))
}
