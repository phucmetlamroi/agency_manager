/**
 * Task Status State Machine — define valid transitions để chống logic abuse.
 *
 * Audit finding #2.4 (HIGH): Task allow status update không validate transition →
 * user có thể "Hoàn tất" → quay về "Đang thực hiện" → re-bill, hoặc reset
 * deadline indefinitely. Audit trail bị corrupt.
 *
 * Statuses (from src/lib/task-statuses.ts + business logic):
 * - "Đang đợi giao" — task chưa assign (marketplace state)
 * - "Nhận task" — vừa claim, chưa start
 * - "Đang thực hiện" — assignee đang làm
 * - "Review" — submitted, đợi admin review
 * - "Revision" — admin yêu cầu sửa
 * - "Gửi lại" — đã sửa, gửi lại review
 * - "Hoàn tất" — admin approve final
 * - "Tạm ngưng" — paused
 * - "Hủy" — cancelled
 *
 * Rules:
 * - "Hoàn tất" là TERMINAL — chỉ admin được unlock (special action)
 * - Cycle Review → Revision → Gửi lại → Review allowed (multi-round revision)
 * - "Hủy" terminal (chỉ admin reset được)
 * - User-side transitions limited; admin có power broader
 */

export type TaskStatus =
    | 'Đang đợi giao'
    | 'Nhận task'
    | 'Đang thực hiện'
    | 'Revision'
    | 'Gửi lại'
    | 'Hoàn tất'
    | 'Tạm ngưng'
    | 'Quá hạn'
    | 'Hủy'

/**
 * Valid transitions cho USER (assignee) role.
 * [Sprint A] Bỏ 'Review' state — submit đi thẳng Revision.
 */
const USER_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    'Đang đợi giao': ['Nhận task'],                     // user claim task
    'Nhận task': ['Đang thực hiện', 'Đang đợi giao'],   // user start hoặc trả task (within 10 min via returnTask)
    'Đang thực hiện': ['Revision', 'Tạm ngưng'],        // user submit (→ Revision) hoặc pause
    'Revision': ['Gửi lại'],                            // user fix → resubmit
    'Gửi lại': [],                                       // chỉ admin được approve
    'Hoàn tất': [],                                      // TERMINAL cho user
    'Tạm ngưng': ['Đang thực hiện'],                    // user resume
    'Quá hạn': [],                                       // TERMINAL — admin cần extend deadline để unlock
    'Hủy': [],                                           // TERMINAL
}

/**
 * Valid transitions cho ADMIN role (broader power).
 */
const ADMIN_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    'Đang đợi giao': ['Nhận task', 'Hủy'],
    'Nhận task': ['Đang thực hiện', 'Đang đợi giao', 'Hủy'],
    'Đang thực hiện': ['Revision', 'Tạm ngưng', 'Hủy', 'Hoàn tất'],
    'Revision': ['Gửi lại', 'Hoàn tất', 'Đang thực hiện', 'Hủy'],
    'Gửi lại': ['Hoàn tất', 'Revision', 'Hủy'],
    'Hoàn tất': ['Đang thực hiện', 'Hủy'],              // admin có quyền unlock (audit log!)
    'Tạm ngưng': ['Đang thực hiện', 'Đang đợi giao', 'Hủy'],
    'Quá hạn': ['Đang thực hiện', 'Hoàn tất', 'Hủy'],   // admin extend deadline → resume
    'Hủy': ['Đang đợi giao'],                            // admin re-open hủy task
}

export type ActorRole = 'USER' | 'ADMIN'

/**
 * Check: liệu transition `from → to` có hợp lệ với role `actor` không?
 * @returns true nếu valid, false nếu invalid
 */
export function canTransition(from: string, to: string, actor: ActorRole): boolean {
    // Same status → no-op, always allowed
    if (from === to) return true

    const map = actor === 'ADMIN' ? ADMIN_TRANSITIONS : USER_TRANSITIONS
    const allowed = map[from as TaskStatus]
    if (!allowed) {
        // Unknown current status → block (defensive)
        console.warn(`[task-state-machine] Unknown status: "${from}"`)
        return false
    }
    return allowed.includes(to as TaskStatus)
}

/**
 * Validate transition và throw error tiếng Việt nếu invalid.
 * Use trong server actions để gate updateTask.
 */
export class InvalidTaskTransitionError extends Error {
    code = 'INVALID_TASK_TRANSITION' as const
    from: string
    to: string

    constructor(from: string, to: string) {
        super(`Không thể chuyển task từ "${from}" sang "${to}". Vui lòng kiểm tra lại trạng thái hiện tại.`)
        this.from = from
        this.to = to
        this.name = 'InvalidTaskTransitionError'
    }
}

export function assertValidTransition(from: string, to: string, actor: ActorRole): void {
    if (!canTransition(from, to, actor)) {
        throw new InvalidTaskTransitionError(from, to)
    }
}

/**
 * Get list of valid next statuses for a given status + role.
 * Useful cho UI dropdown — chỉ hiển thị options hợp lệ.
 */
export function getValidNextStatuses(from: string, actor: ActorRole): TaskStatus[] {
    const map = actor === 'ADMIN' ? ADMIN_TRANSITIONS : USER_TRANSITIONS
    return map[from as TaskStatus] ?? []
}
