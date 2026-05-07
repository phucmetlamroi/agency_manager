/**
 * Template registry — maps NotificationType to a rendered email.
 *
 * `renderEmail()` is the single entry point used by `notification-email.ts`.
 * Returns `null` if the notification type has no template (caller should skip).
 */

import { messageDM } from './templates/messageDM'
import { messageGroup } from './templates/messageGroup'
import { mention } from './templates/mention'
import { groupMemberAdded } from './templates/groupMemberAdded'
import { groupMemberRemoved } from './templates/groupMemberRemoved'
import { groupMemberLeft } from './templates/groupMemberLeft'
import { groupDeleted } from './templates/groupDeleted'
import { taskAssigned } from './templates/taskAssigned'
import { taskUnassigned } from './templates/taskUnassigned'
import { taskStatusChanged } from './templates/taskStatusChanged'
import { taskDeadline24h } from './templates/taskDeadline24h'
import { taskDeadline1h } from './templates/taskDeadline1h'
import { taskOverdue } from './templates/taskOverdue'
import { taskComment } from './templates/taskComment'
import { digestHourly } from './templates/digestHourly'
import { digestDaily } from './templates/digestDaily'
import type { RenderedEmail } from './shared/types'

export const templates = {
    messageDM,
    messageGroup,
    mention,
    groupMemberAdded,
    groupMemberRemoved,
    groupMemberLeft,
    groupDeleted,
    taskAssigned,
    taskUnassigned,
    taskStatusChanged,
    taskDeadline24h,
    taskDeadline1h,
    taskOverdue,
    taskComment,
    digestHourly,
    digestDaily,
}

export type TemplateName = keyof typeof templates

/**
 * Pick the template for a given notification type + metadata.
 * Returns the template name to invoke, or null to skip.
 */
export function pickTemplate(
    type: string,
    metadata: Record<string, any> | null,
): TemplateName | null {
    switch (type) {
        case 'NEW_MESSAGE':
            return metadata?.convType === 'GROUP' ? 'messageGroup' : 'messageDM'
        case 'MENTION':
            return 'mention'
        case 'GROUP_MEMBER_ADDED':
            return 'groupMemberAdded'
        case 'GROUP_MEMBER_REMOVED':
            return 'groupMemberRemoved'
        case 'GROUP_MEMBER_LEFT':
            return 'groupMemberLeft'
        case 'GROUP_DELETED':
            return 'groupDeleted'
        case 'TASK_ASSIGNED':
            return 'taskAssigned'
        case 'TASK_UNASSIGNED':
            return 'taskUnassigned'
        case 'TASK_STATUS_CHANGED':
            return 'taskStatusChanged'
        case 'TASK_DEADLINE_APPROACHING':
            return metadata?.tier === '1h' ? 'taskDeadline1h' : 'taskDeadline24h'
        case 'TASK_OVERDUE':
            return 'taskOverdue'
        case 'TASK_COMMENT':
            return 'taskComment'
        default:
            return null
    }
}

export type { RenderedEmail }
