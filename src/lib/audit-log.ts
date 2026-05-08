import { prisma } from '@/lib/db'
import { headers } from 'next/headers'

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
    | 'member.invited'
    | 'member.invitation_revoked'
    | 'member.joined'
    | 'member.removed'
    | 'member.left'
    | 'member.role_changed'
    | 'member.suspended'
    | 'member.reactivated'
    | 'auth.login'
    | 'auth.logout'
    | 'auth.failed_attempt'
    | 'auth.impersonation_started'
    | 'auth.impersonation_ended'
    | 'data.export'
    | 'data.import'
    | 'permission.checked_denied'

export interface AuditOpts {
    workspaceId: string
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
        if (ip === undefined || ua === undefined) {
            try {
                const h = await headers()
                if (ip === null || ip === undefined) {
                    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim()
                        ?? h.get('x-real-ip')
                        ?? null
                }
                if (ua === null || ua === undefined) {
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
