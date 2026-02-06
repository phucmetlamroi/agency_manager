/**
 * Finite State Machine (FSM) Configuration for Task Lifecycle
 * Enforces strict transition logic to prevent invalid states (Zombie Tasks).
 */

export enum TaskState {
    PENDING = 'Đang đợi giao',      // Initial State (Global/Agency Pool)
    ASSIGNED = 'Đã nhận task',      // User assigned but not started
    IN_PROGRESS = 'Đang thực hiện', // User working (Timer Running)
    REVIEW = 'Review',              // Submitted, Waiting for Admin/Client
    REVISION = 'Revision',          // Feedback received, User needs to fix
    FIXING_FRAME = 'Sửa frame',     // Specific active state for fixing frames
    PAUSED = 'Tạm ngưng',           // Explicitly paused
    COMPLETED = 'Hoàn tất',         // Final State
    CANCELLED = 'Đã hủy'            // Dead State
}

export type TaskEvent =
    | 'assign'          // Admin assigns to User/Agency
    | 'start'           // User starts working
    | 'submit'          // User submits for review
    | 'reject'          // Admin sends feedback
    | 'request_fix'     // Admin requests specific frame fix
    | 'resume_fix'      // User starts fixing
    | 'finish'          // Admin marks as done
    | 'pause'           // Admin/User pauses
    | 'resume'          // Resume from pause
    | 'unassign'        // Admin removes user
    | 'penalize'        // System auto-penalizes (Overdue)
    | 'admin_fix'       // Admin forces Revision
    | 'revision_loop'   // Update Revision details
    | 'back_to_work'    // Resume work from Revision

interface TransitionRule {
    from: TaskState[]
    to: TaskState
    requiredRole?: ('ADMIN' | 'USER' | 'SYSTEM')[] // Minimal RBAC Guard
}

export const TRANSITIONS: Record<TaskEvent, TransitionRule> = {
    assign: {
        from: [TaskState.PENDING, TaskState.ASSIGNED], // Re-assign allowed
        to: TaskState.ASSIGNED,
        requiredRole: ['ADMIN', 'SYSTEM']
    },
    start: {
        from: [TaskState.ASSIGNED, TaskState.PAUSED],
        to: TaskState.IN_PROGRESS,
        requiredRole: ['USER', 'ADMIN']
    },
    submit: {
        from: [TaskState.IN_PROGRESS, TaskState.FIXING_FRAME, TaskState.REVISION],
        to: TaskState.REVIEW,
        requiredRole: ['USER', 'ADMIN']
    },
    reject: {
        from: [TaskState.REVIEW, TaskState.COMPLETED], // Allow reopen if needed
        to: TaskState.REVISION,
        requiredRole: ['ADMIN']
    },
    request_fix: {
        from: [TaskState.REVIEW, TaskState.IN_PROGRESS],
        to: TaskState.FIXING_FRAME,
        requiredRole: ['ADMIN']
    },
    resume_fix: {
        from: [TaskState.REVISION, TaskState.FIXING_FRAME], // Already fixing
        to: TaskState.FIXING_FRAME, // Or IN_PROGRESS? Let's map to FIXING logic
        requiredRole: ['USER']
    },
    finish: {
        from: [TaskState.REVIEW, TaskState.IN_PROGRESS, TaskState.FIXING_FRAME, TaskState.REVISION], // Allow Revision -> Done
        to: TaskState.COMPLETED,
        requiredRole: ['ADMIN', 'SYSTEM'] // System auto-finish if configured? Usually Admin.
    },
    pause: {
        from: [TaskState.IN_PROGRESS, TaskState.FIXING_FRAME, TaskState.ASSIGNED],
        to: TaskState.PAUSED,
        requiredRole: ['ADMIN', 'USER']
    },
    resume: {
        from: [TaskState.PAUSED],
        to: TaskState.IN_PROGRESS,
        requiredRole: ['ADMIN', 'USER']
    },
    unassign: {
        from: [TaskState.ASSIGNED, TaskState.IN_PROGRESS, TaskState.PAUSED, TaskState.REVIEW, TaskState.REVISION],
        to: TaskState.PENDING,
        requiredRole: ['ADMIN', 'SYSTEM']
    },
    penalize: {
        from: [TaskState.ASSIGNED, TaskState.IN_PROGRESS, TaskState.REVIEW, TaskState.REVISION], // Any active state
        to: TaskState.PENDING, // Returns to pool
        requiredRole: ['SYSTEM']
    },
    // ALLOW ADMIN/USER FLEXIBILITY
    admin_fix: {
        from: [TaskState.IN_PROGRESS, TaskState.REVISION, TaskState.FIXING_FRAME],
        to: TaskState.REVISION, // Allow jumping to Revision from anywhere
        requiredRole: ['ADMIN']
    },
    revision_loop: {
        from: [TaskState.REVISION],
        to: TaskState.REVISION, // Allow updating Revision details
        requiredRole: ['ADMIN']
    },
    back_to_work: {
        from: [TaskState.REVISION],
        to: TaskState.IN_PROGRESS, // Allow going back to work
        requiredRole: ['ADMIN', 'USER']
    }
}

/**
 * Validates if a transition is legal.
 * @returns { isValid: boolean, error?: string }
 */
export function validateTransition(current: string, target: string, event?: TaskEvent): { isValid: boolean, error?: string } {
    // 1. If strict event provided, check table
    if (event) {
        const rule = TRANSITIONS[event]
        if (!rule) return { isValid: false, error: `Invalid event: ${event}` }

        // Check Source State
        if (!rule.from.includes(current as TaskState)) {
            return { isValid: false, error: `Cannot '${event}' from state '${current}'` }
        }

        // Check Target (if implicit in event, target must match. If loose, just check validity)
        if (target !== rule.to) {
            return { isValid: false, error: `Event '${event}' leads to '${rule.to}', not '${target}'` }
        }

        return { isValid: true }
    }

    // 2. Loose Mode (Check if ANY event allows Source -> Target)
    // Useful for legacy UI where we just send "newStatus" without named event
    const validEvents = Object.entries(TRANSITIONS).filter(([_, rule]) => {
        return rule.from.includes(current as TaskState) && rule.to === target
    })

    if (validEvents.length === 0) {
        return { isValid: false, error: `Illegal transition: '${current}' -> '${target}'` }
    }

    return { isValid: true }
}
