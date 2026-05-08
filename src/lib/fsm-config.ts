/**
 * Finite State Machine (FSM) Configuration for Task Lifecycle
 * Enforces strict transition logic to prevent invalid states (Zombie Tasks).
 */

export enum TaskState {
    PENDING = '\u0110ang \u0111\u1ee3i giao',      // Initial State (Global Pool)
    ASSIGNED = 'Nh\u1eadn task',          // User assigned but not started
    IN_PROGRESS = '\u0110ang th\u1ef1c hi\u1ec7n', // User working (Timer Running)
    // [Sprint A removed] REVIEW state \u2014 submit gi\u1edd \u0111i th\u1eb3ng REVISION
    REVISION = 'Revision',          // User n\u1ed9p link \u2192 admin s\u1ebd check & approve
    FIXING_FRAME = 'S\u1eeda frame',     // Specific active state for fixing frames
    PAUSED = 'T\u1ea1m ng\u01b0ng',           // Explicitly paused
    COMPLETED = 'Ho\u00e0n t\u1ea5t',         // Final State
    CANCELLED = '\u0110\u00e3 h\u1ee7y',           // Dead State
    OVERDUE = 'Qu\u00e1 h\u1ea1n'             // Auto-set b\u1edfi cron khi deadline qua
}

export type TaskEvent =
    | 'assign'          // Admin assigns to User
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
        from: [TaskState.PENDING, TaskState.ASSIGNED, TaskState.PAUSED], // Re-assign allowed (including from Pause)
        to: TaskState.ASSIGNED,
        requiredRole: ['ADMIN', 'SYSTEM']
    },
    start: {
        from: [TaskState.ASSIGNED, TaskState.PAUSED, TaskState.PENDING], // Allow Claim & Start from Pool
        to: TaskState.IN_PROGRESS,
        requiredRole: ['USER', 'ADMIN']
    },
    submit: {
        // [Sprint A] User submit → đi thẳng REVISION (deadline cleared).
        // Trước đây: → REVIEW (deadline còn) → admin xác nhận → REVISION.
        // Bug cũ: admin quên xác nhận → user bị flag Quá hạn oan.
        from: [TaskState.IN_PROGRESS, TaskState.FIXING_FRAME],
        to: TaskState.REVISION,
        requiredRole: ['USER', 'ADMIN']
    },
    reject: {
        from: [TaskState.COMPLETED], // Reopen completed task → REVISION
        to: TaskState.REVISION,
        requiredRole: ['ADMIN']
    },
    request_fix: {
        from: [TaskState.IN_PROGRESS, TaskState.REVISION],
        to: TaskState.FIXING_FRAME,
        requiredRole: ['ADMIN']
    },
    resume_fix: {
        from: [TaskState.REVISION, TaskState.FIXING_FRAME],
        to: TaskState.FIXING_FRAME,
        requiredRole: ['USER']
    },
    finish: {
        from: [TaskState.IN_PROGRESS, TaskState.FIXING_FRAME, TaskState.REVISION],
        to: TaskState.COMPLETED,
        requiredRole: ['ADMIN', 'SYSTEM']
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
        from: [TaskState.ASSIGNED, TaskState.IN_PROGRESS, TaskState.PAUSED, TaskState.REVISION],
        to: TaskState.PENDING,
        requiredRole: ['ADMIN', 'SYSTEM']
    },
    penalize: {
        from: [TaskState.ASSIGNED, TaskState.IN_PROGRESS, TaskState.REVISION],
        to: TaskState.PENDING,
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
    // FSM Disabled as per user request: "hãy bỏ logic này đi"
    return { isValid: true }
}
