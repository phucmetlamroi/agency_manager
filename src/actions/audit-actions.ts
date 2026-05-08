'use server'

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'

// ─── Types ────────────────────────────────────────────────────────

export type AuditLogEntry = {
    id: string            // BigInt serialized as string
    action: string
    targetType: string
    targetId: string | null
    beforeData: any
    afterData: any
    ipAddress: string | null
    userAgent: string | null
    createdAt: string     // ISO string
    actor: {
        id: string
        username: string
        nickname: string | null
        avatarUrl: string | null
    } | null
}

export type AuditLogFilters = {
    action?: string
    actorUserId?: string
    targetType?: string
    dateFrom?: string     // ISO date string "YYYY-MM-DD"
    dateTo?: string       // ISO date string "YYYY-MM-DD"
}

export type AuditLogResult = {
    logs: AuditLogEntry[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}

// ─── Query audit logs ─────────────────────────────────────────────

/**
 * Query audit logs for a workspace with filtering and pagination.
 * Requires ADMIN workspace role or global ADMIN.
 * Spec ref: permission matrix — audit_log:view = OWNER ✅ | ADMIN ✅ | others ❌
 */
export async function getWorkspaceAuditLogs(
    workspaceId: string,
    filters: AuditLogFilters = {},
    page: number = 1,
    pageSize: number = 25
): Promise<AuditLogResult> {
    await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    // Clamp pageSize to prevent over-fetching (security: LOW finding)
    const safePageSize = Math.min(Math.max(1, pageSize), 100)

    // Build where clause
    const where: any = { workspaceId }

    if (filters.action) {
        where.action = filters.action
    }
    if (filters.actorUserId) {
        where.actorUserId = filters.actorUserId
    }
    if (filters.targetType) {
        where.targetType = filters.targetType
    }
    if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {}
        if (filters.dateFrom) {
            where.createdAt.gte = new Date(filters.dateFrom + 'T00:00:00.000Z')
        }
        if (filters.dateTo) {
            where.createdAt.lte = new Date(filters.dateTo + 'T23:59:59.999Z')
        }
    }

    // Count total matching entries
    const total = await prisma.auditLog.count({ where })

    // Clamp page
    const totalPages = Math.max(1, Math.ceil(total / safePageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)

    // Fetch paginated results with actor info
    const logs = await prisma.auditLog.findMany({
        where,
        include: {
            actor: {
                select: {
                    id: true,
                    username: true,
                    nickname: true,
                    avatarUrl: true,
                }
            }
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
    })

    // Redact sensitive keys from JSON data before sending to client
    const SENSITIVE_KEYS = new Set([
        'password', 'passwordHash', 'password_hash', 'token', 'secret',
        'apiKey', 'api_key', 'accessToken', 'access_token', 'refreshToken',
        'refresh_token', 'sessionToken', 'session_token', 'creditCard',
    ])

    function redactSensitive(data: unknown): unknown {
        if (data === null || data === undefined) return data
        if (typeof data !== 'object') return data
        if (Array.isArray(data)) return data.map(redactSensitive)
        const result: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())) {
                result[key] = '[REDACTED]'
            } else {
                result[key] = typeof value === 'object' ? redactSensitive(value) : value
            }
        }
        return result
    }

    // Serialize BigInt → string, Date → ISO string, redact sensitive fields
    const serialized: AuditLogEntry[] = logs.map(log => ({
        id: log.id.toString(),
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        beforeData: redactSensitive(log.beforeData),
        afterData: redactSensitive(log.afterData),
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt.toISOString(),
        actor: log.actor ? {
            id: log.actor.id,
            username: log.actor.username,
            nickname: log.actor.nickname,
            avatarUrl: log.actor.avatarUrl,
        } : null,
    }))

    return {
        logs: serialized,
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages,
    }
}

// ─── Filter helpers ───────────────────────────────────────────────

/**
 * Get distinct action types recorded in this workspace's audit log.
 * Used to populate the action-type filter dropdown.
 */
export async function getAuditLogActionTypes(workspaceId: string): Promise<string[]> {
    await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    const result = await prisma.auditLog.findMany({
        where: { workspaceId },
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
    })

    return result.map(r => r.action)
}

/**
 * Get distinct actors who have performed actions in this workspace.
 * Used to populate the actor filter dropdown.
 */
export async function getAuditLogActors(workspaceId: string) {
    await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    const result = await prisma.auditLog.findMany({
        where: { workspaceId, actorUserId: { not: null } },
        select: {
            actor: {
                select: {
                    id: true,
                    username: true,
                    nickname: true,
                }
            }
        },
        distinct: ['actorUserId'],
    })

    return result
        .filter(r => r.actor !== null)
        .map(r => ({
            id: r.actor!.id,
            name: r.actor!.nickname || r.actor!.username,
        }))
}
