import { prisma } from '@/lib/db'
import { headers } from 'next/headers'
import { getRequestIpOrNull } from '@/lib/request-ip'

/**
 * Audit log helper for security-sensitive workspace events.
 *
 * Design:
 * - WRITE-ONLY: code never updates or deletes audit rows. The DB grant will
 *   REVOKE UPDATE/DELETE in a Phase 2 migration; here we only INSERT.
 * - NON-THROWING: business actions must NOT fail because the audit write
 *   failed. We `console.error` on failure so observability captures it,
 *   but the caller continues.
 * - SCHEMA-TOLERANT: if the AuditLog table does not yet exist (e.g. running
 *   on a deployment where the migration has not been applied), this helper
 *   silently no-ops instead of crashing the request.
 *
 * Usage:
 * ```ts
 * await audit({
 *   workspaceId,
 *   actorUserId: callerId,
 *   action: 'workspace.transferred_ownership',
 *   targetType: 'Workspace',
 *   targetId: workspaceId,
 *   before: { ownerId: oldOwnerId },
 *   after: { ownerId: newOwnerId },
 * })
 * ```
 */

export type AuditAction =
    | 'workspace.created'
    | 'workspace.updated'
    | 'workspace.soft_deleted'
    | 'workspace.restored'
    | 'workspace.hard_deleted'
    | 'workspace.transferred_ownership'
    | 'workspace.clients_cloned'
    | 'member.invited'
    | 'member.invitation_revoked'
    | 'member.joined'
    | 'member.removed'
    | 'member.left'
    | 'member.role_changed'
    | 'member.suspended'
    | 'member.reactivated'
    | 'user.deactivated'
    | 'user.reactivated'
    | 'auth.login'
    | 'auth.logout'
    | 'auth.failed_attempt'
    | 'auth.impersonation_started'
    | 'auth.impersonation_ended'
    | 'auth.admin_force_reset_triggered'
    | 'auth.password_changed'
    | 'payroll.bonus_calculated'
    | 'payroll.bonus_reverted'
    // [AUDIT SWEEP-2026-07-30 · N13] Một kênh đẩy thông báo đổi chủ (xem push-actions.ts).
    | 'push.subscription_rebound'
    | 'payroll.locked'
    | 'payroll.unlocked'
    | 'bonus_config.updated'
    | 'data.export'
    | 'data.import'
    | 'permission.checked_denied'
    // [Sprint P] Task lifecycle 4 phases — track ai làm gì + khi nào.
    // Email + in-app notification routing dùng cùng logic, audit là fallback
    // forensics khi email/notif fail.
    | 'task.assigned'   // Admin tạo + assign task tới user (GĐ1)
    | 'task.started'    // User bấm "Bắt đầu" (Nhận task → Đang thực hiện) (GĐ3)
    | 'task.delivered'  // User submit productLink (Đang thực hiện → Revision) (GĐ4)
    | 'task.completed'  // Admin/User mark Hoàn tất
    | 'task.restored'   // Admin un-archives a cancelled/archived task from /admin/cancelled
    // [Client Portal] client-driven review actions
    | 'task.client_approved'           // Client approved a deliverable → Hoàn tất
    | 'task.client_changes_requested'  // Client requested changes → Revision + feedback
    // [Video Review P6.3] events surfaced into the task drawer feed + Nhật ký hoạt động
    | 'video.version_ready'            // an uploaded review build finished processing
    | 'video.guest_commented'         // a guest left a public comment via a share link
    | 'video.share_created'           // a review share link was created
    | 'video.share_revoked'           // a review share link was revoked
    | 'video.share_unrevoked'         // a revoked review share link was re-opened
    | 'task.client_submitted'          // Client created a NEW task via the share-link portal (v1 — legacy)
    | 'task.comment_added'             // [Trial P1] A task comment was posted (staff or client)
    // [Chat GĐ3 · C2] Message-as-action-item lifecycle
    | 'task.comment_assigned'          // A comment was assigned to a staff member (action item)
    | 'task.comment_unassigned'        // A comment's assignment was cleared
    | 'task.comment_resolved'          // An action-item comment was marked resolved
    | 'task.comment_reopened'          // A resolved action-item comment was re-opened
    // [Client Task Submission v2] Intake request lifecycle + portal sub-brand create
    | 'request.client_submitted'       // Client submitted a ClientTaskRequest via the portal wizard
    | 'request.accepted'               // Admin accepted a request → spawned a Task
    | 'request.rejected'               // Admin rejected a request
    | 'client.created_via_share_link'  // Client created a sub-brand via the portal
    // [Sprint Q] Bulk edit lifecycle
    | 'task.bulk_updated'         // Bulk update fields (productLink/notes/deadline/...) of N tasks
    | 'task.bulk_status_updated'  // Bulk status change of N tasks (with digest email)
    | 'task.invariant_auto_synced' // [Z+1.fix8] Auto-sync assigneeId ↔ status khi invariant bị vi phạm
    // [Velox v4] Multi-Hook Map lifecycle on TaskRawFootage
    | 'task.raw_footage_mode_changed' // Editor flips between PER_LINK / BATCH / MULTI_HOOK_MAP
    | 'task.raw_footage_map_saved'    // VeloxScanResult persisted after user review
    // [Quick Create] Pricing rules + integrations
    | 'pricing_rule.created'
    | 'pricing_rule.updated'
    | 'pricing_rule.deleted'
    | 'pricing_rule.set_default'
    | 'integration.connected'
    | 'integration.disconnected'
    // [Username Handle]
    | 'user.username_migrated'
    | 'user.username_changed'
    // [Client soft-delete] Notion-style archive of Client records
    | 'client.soft_deleted'
    | 'client.restored'
    | 'client.hard_deleted'
    // [Canonical Clients 2026-06] migration + public share links
    | 'client.auto_merged'      // migrate-clients-to-profile-scope merged a duplicate (machine-readable rollback log)
    | 'share_link.created'      // profile OWNER/ADMIN generated a public client link
    | 'share_link.revoked'      // link revoked — effective immediately
    | 'share_link.accessed'     // public page opened with a valid token (page-level, not per action)
    | 'share_link.invoice_downloaded' // client pulled an invoice PDF through their share link
    // [BILLING P3] Thu phí Velox↔người dùng qua SePay (docs/billing/SCHEMA-DE-XUAT.md)
    | 'billing.order_created'    // profile admin bấm nâng gói → SubscriptionOrder PENDING
    | 'billing.order_paid'       // webhook SePay khớp lệnh → order PAID + subscription kích hoạt
    | 'billing.payment_unmatched' // tiền vào không khớp order nào → chờ đối soát tay
    | 'billing.code_created'     // global admin phát hành RedemptionCode
    | 'billing.code_revoked'     // global admin thu hồi code
    | 'billing.code_redeemed'    // profile nhập code → subscription tạo/gia hạn
    | 'billing.override_granted' // global admin cấp ngoại lệ seats/storage (D4)
    // [Video Review] Frame.io-style review portal on Cloudflare Stream
    | 'video.version_uploaded'   // editor uploaded a new cut (V1/V2/V3) → VideoVersion row
    | 'video.review_approved'    // client approved a version via the token portal
    | 'video.changes_requested'  // client requested changes on a version
    | 'video.comment_added'      // a review comment was created (client or staff)
    | 'video.comment_resolved'   // a comment was marked complete/resolved
    | 'video.comment_reopened'   // a resolved comment was reopened by staff

/**
 * `workspaceId` value semantics (audit fix #2.9):
 * - Real workspace UUID: workspace-scoped event (vd 'workspace.updated')
 * - `null`: TRƯỚC ĐÂY dùng cho auth events (login, signup, ...). Vẫn support
 *   để backward compat, nhưng KHUYẾN NGHỊ dùng 'SYSTEM' marker explicit.
 * - `'SYSTEM'`: system-initiated event không thuộc workspace nào (cron jobs,
 *   hard-delete, ...). Dùng marker này để filter-able trong
 *   audit log viewer (`WHERE workspaceId = 'SYSTEM'` thay vì `IS NULL`).
 */
export interface AuditOpts {
    workspaceId: string | null
    actorUserId: string | null
    action: AuditAction
    targetType: string
    targetId?: string | null
    before?: unknown
    after?: unknown
    /** When set, used instead of best-effort header-based detection. */
    ipAddress?: string | null
    userAgent?: string | null
}

/**
 * Insert an audit log entry. Never throws — failures are logged.
 */
export async function audit(opts: AuditOpts): Promise<void> {
    try {
        // Best-effort capture of request metadata.
        let ip = opts.ipAddress ?? null
        let ua = opts.userAgent ?? null
        // [AUDIT HT-002 fix] This guard used to read `=== undefined`, but the two lines above
        // already collapse undefined → null, so it was never true and the whole capture block
        // below was dead: audit rows only ever got an IP when a caller passed one explicitly.
        // Compare against null so the fallback actually runs.
        if (ip === null || ua === null) {
            try {
                if (ip === null) {
                    // [AUDIT HT-002 fix] Was x-forwarded-for[0], which the caller controls — a
                    // forged header wrote an attacker-chosen IP into the audit trail and could
                    // pin activity on an innocent address.
                    ip = await getRequestIpOrNull()
                }
                if (ua === null) {
                    const h = await headers()
                    ua = h.get('user-agent') ?? null
                }
            } catch {
                // headers() throws outside request context — ignore.
            }
        }

        await prisma.auditLog.create({
            data: {
                workspaceId: opts.workspaceId,
                actorUserId: opts.actorUserId,
                action: opts.action,
                targetType: opts.targetType,
                targetId: opts.targetId ?? null,
                beforeData: (opts.before ?? null) as any,
                afterData: (opts.after ?? null) as any,
                ipAddress: ip,
                userAgent: ua,
            },
        })
    } catch (err: any) {
        // If table does not exist yet (pre-migration), or any other error,
        // log but do not fail the calling business action.
        const code = err?.code
        const msg = err?.message ?? String(err)
        // P2021 = table does not exist; suppress to avoid log noise pre-migration.
        if (code !== 'P2021') {
            console.error('[audit] failed to write audit log:', { action: opts.action, code, msg })
        }
    }
}
