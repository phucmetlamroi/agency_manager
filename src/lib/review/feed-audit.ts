// [Review module P6.3] Bridge review events into the app's AuditLog so they show
// in BOTH the task-drawer "Bình luận & hoạt động" feed (getTaskActivityFeed reads
// AuditLog rows whose action is in EVENT_LABELS, targetType='Task') AND the admin
// "Nhật ký hoạt động" page (getWorkspaceAuditLogs + AuditLogViewer.ACTION_LABELS).
//
// The module already writes a rich ReviewActivity row at each of these sites; this
// is the ADDITIONAL AuditLog write that lands the event on the shared app surfaces
// (same dual-write pattern P5.4 uses for guest decisions). Fire-and-forget — a feed
// write must never break the action that produced it.

import type { AuditAction } from '@/lib/audit-log'
import { audit } from '@/lib/audit-log'
import { reviewLog } from './logger'

export interface ReviewFeedEvent {
    action: AuditAction
    workspaceId: string
    /** when set → row targets the Task so it appears in that task's drawer feed. */
    taskId?: string | null
    assetId?: string | null
    /** the acting member; null = guest/system (feed renders "Khách hàng"). */
    actorUserId?: string | null
    /** snapshot payload (guest name, version number, excerpt…) for the admin log. */
    meta?: Record<string, unknown>
}

export async function auditReviewFeed(e: ReviewFeedEvent): Promise<void> {
    try {
        await audit({
            workspaceId: e.workspaceId,
            actorUserId: e.actorUserId ?? null,
            action: e.action,
            targetType: e.taskId ? 'Task' : 'ReviewAsset',
            targetId: e.taskId ?? e.assetId ?? null,
            after: e.meta ?? null,
        })
    } catch (err) {
        reviewLog('error', 'feed_audit.failed', { action: e.action, error: String(err) })
    }
}
