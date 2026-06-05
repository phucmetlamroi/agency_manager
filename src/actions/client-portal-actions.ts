'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma as globalPrisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatClientHierarchy } from '@/lib/client-hierarchy'
import { serializeDecimal } from '@/lib/serialization'
import { revalidatePath } from 'next/cache'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser, broadcastToChannel } from '@/lib/notification-broadcast'
import { CHAT_EVENTS } from '@/lib/chat-channels'
import { audit } from '@/lib/audit-log'

/**
 * Ensures the caller is authenticated and has the CLIENT role.
 * Returns the session user ID.
 */
async function getClientSession() {
    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }
    const userId = session.user.id
    // [Client membership] Allow either the legacy global CLIENT role OR any
    // per-profile CLIENT membership (the new model). Data is still isolated by
    // getRelatedClientIds (only the Client records this user is a portal-user of).
    if (session.user.role === 'CLIENT') return userId
    const clientAccess = await globalPrisma.profileAccess.findFirst({
        where: { userId, role: 'CLIENT' },
        select: { id: true },
    })
    if (clientAccess) return userId
    redirect('/login')
}

/**
 * [Client membership] Portal access gate for server components (layout/page).
 * Redirects to /login unless the caller is a client here — the legacy global
 * CLIENT role, or a per-profile CLIENT membership (scoped to the given
 * workspace's profile when provided). Returns the user id.
 */
export async function getPortalUserId(workspaceId?: string): Promise<string> {
    const session = await getSession()
    if (!session?.user?.id) redirect('/login')
    const userId = session.user.id
    if (session.user.role === 'CLIENT') return userId // legacy global

    const where: { userId: string; role: 'CLIENT'; profileId?: string } = { userId, role: 'CLIENT' }
    if (workspaceId) {
        const ws = await globalPrisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
        if (ws?.profileId) where.profileId = ws.profileId
    }
    const access = await globalPrisma.profileAccess.findFirst({ where, select: { id: true } })
    if (access) return userId
    redirect('/login')
}

/**
 * Finds all client records associated with the user and their subsidiaries.
 *
 * Audit fix #3.6: Trước đây weak match `client.name === user.username` →
 * collision-prone (vd 7 user "Jacob" map với 7 client "Jacob" cùng tên).
 *
 * Sau:
 * 1. PRIORITY 1: User.clientId FK (explicit link, set bởi admin/backfill)
 *    → safe, không collision
 * 2. PRIORITY 2 (fallback legacy): name match — chỉ dùng khi FK chưa set.
 *    Log warning để observability biết user nào còn dùng fallback.
 *
 * Sau khi backfill xong toàn bộ user → có thể remove fallback.
 */
async function getRelatedClientIds(clientUserId: string) {
    const rootIds = new Set<number>()

    // [Client membership] Per-profile CLIENT memberships → the Client they represent.
    const clientAccesses = await globalPrisma.profileAccess.findMany({
        where: { userId: clientUserId, role: 'CLIENT', clientId: { not: null } },
        select: { clientId: true },
    })
    clientAccesses.forEach(a => { if (a.clientId != null) rootIds.add(a.clientId) })

    const user = await globalPrisma.user.findUnique({ where: { id: clientUserId } })

    // Legacy: User.clientId FK (pre-membership model).
    const userClientId = (user as any)?.clientId as number | null | undefined
    if (userClientId) {
        const fkClient = await globalPrisma.client.findUnique({ where: { id: userClientId }, select: { id: true } })
        if (fkClient) rootIds.add(fkClient.id)
    }

    // Legacy fallback: profile-scoped name match — only if nothing else resolved.
    if (rootIds.size === 0 && user) {
        const username = user.username ?? ''
        const nickname = user.nickname ?? ''
        const userProfileId = user.profileId
        if (userProfileId) {
            const rootClients = await globalPrisma.client.findMany({
                where: { OR: [{ name: username }, { name: nickname }], profileId: userProfileId, status: { not: 'SOFT_DELETED' } },
                select: { id: true },
            })
            rootClients.forEach(c => rootIds.add(c.id))
        }
    }

    const allIds = new Set(rootIds)
    if (rootIds.size > 0) {
        const subs = await globalPrisma.client.findMany({
            where: { parentId: { in: Array.from(rootIds) }, status: { not: 'SOFT_DELETED' } },
            select: { id: true },
        })
        subs.forEach(s => allIds.add(s.id))
    }

    return Array.from(allIds)
}

/**
 * Maps the 8 internal task states into 5 abstract states suitable for the Client Portal.
 */
function mapClientTaskStatus(internalStatus: string): string {
    const statusLower = internalStatus.toLowerCase()

    if (statusLower.includes('đợi') || statusLower.includes('đã nhận')) {
        return 'Pending'
    }
    if (statusLower.includes('thực hiện')) {
        return 'In Progress'
    }
    if (statusLower.includes('review')) {
        return 'Action Required'
    }
    if (statusLower.includes('revision') || statusLower.includes('sửa')) {
        return 'Revising'
    }
    if (statusLower.includes('hoàn tất') || statusLower.includes('lưu trữ')) {
        return 'Completed'
    }

    return 'Pending'
}

/**
 * Client-facing status, refined by the new `clientReview` field (decoupled from
 * the internal status FSM). AWAITING = a cut is ready for the client to review.
 */
function deriveClientStatus(status: string, clientReview?: string | null): string {
    if (clientReview === 'AWAITING') return 'Action Required'
    if (clientReview === 'APPROVED') return 'Completed'
    if (clientReview === 'CHANGES') return 'Revising'
    return mapClientTaskStatus(status)
}

/**
 * Whether this deliverable is waiting on the CLIENT (drives "Needs your attention").
 * Explicit AWAITING, or heuristic: there's a cut (productLink) and it isn't done,
 * and the client hasn't already approved or asked for changes.
 */
function deriveNeedsYou(t: { status: string; productLink?: string | null; clientReview?: string | null }): boolean {
    if (t.clientReview === 'AWAITING') return true
    if (t.clientReview === 'APPROVED' || t.clientReview === 'CHANGES') return false
    const s = (t.status || '').toLowerCase()
    const done = s.includes('hoàn tất') || s.includes('lưu trữ') || s.includes('hủy')
    return !!t.productLink && !done
}

// [Sprint J P0] `calculateEstimatedCost` removed — exposed agency revenue
// (jobPriceUSD) to client role. Clients should not learn how much they paid
// per task at the line-item level.

/**
 * Fetches Tasks for the authenticated Client, strictly isolating data via ReBAC.
 *
 * [Sprint J P0] Removed `jobPriceUSD` từ select + `estimatedCost` field —
 * không expose agency revenue per task ra client. Frame.io creds + notes giữ
 * vì client cần submit feedback / xem creds để duyệt.
 */
export async function getClientTasks(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)
    const relatedClientIds = await getRelatedClientIds(clientUserId)

    const tasks = await prisma.task.findMany({
        where: {
            OR: [
                { clientUserId: clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        select: {
            id: true,
            title: true,
            status: true,
            deadline: true,
            createdAt: true,
            updatedAt: true,
            type: true,
            productLink: true,
            // jobPriceUSD: REMOVED — agency revenue, must not leak to clients
            clientId: true,
            notes_vi: true,
            notes_en: true,
            references: true,
            resources: true,
            collectFilesLink: true,
            frameUsername: true,
            framePassword: true,
            frameNote: true,
            duration: true,
            clientReview: true,
            clientFeedback: true,
            clientReviewedAt: true,
            client: {
                select: {
                    id: true,
                    name: true,
                    parent: {
                        select: { name: true }
                    }
                }
            },
            project: {
                select: { id: true, name: true }
            },
            rating: true,
            assignee: {
                select: { username: true, nickname: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    const mapped = tasks.map(task => ({
        ...task,
        clientStatus: deriveClientStatus(task.status, task.clientReview),
        needsYou: deriveNeedsYou(task),
        clientPath: formatClientHierarchy(task.client)
    }))
    return serializeDecimal(mapped) as typeof mapped
}

/**
 * Fetches Projects for the authenticated Client.
 */
export async function getClientProjects(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)
    const relatedClientIds = await getRelatedClientIds(clientUserId)

    return await prisma.project.findMany({
        where: {
            OR: [
                { clientUserId: clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            tasks: {
                select: { id: true, status: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })
}

/**
 * Fetches Invoices for the authenticated Client.
 */
export async function getClientInvoices(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)
    const relatedClientIds = await getRelatedClientIds(clientUserId)

    const invoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { clientUserId: clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            dueDate: true,
            totalDue: true,
            status: true,
            filePath: true,
            clientId: true,
            items: {
                select: { description: true, amount: true, quantity: true }
            }
        }
    })
    return serializeDecimal(invoices) as typeof invoices
}

/**
 * Submits a client's star rating for a completed task.
 */
export async function submitTaskRating(
    taskId: string,
    creativeQuality: number,
    responsiveness: number,
    communication: number,
    qualitativeFeedback?: string
) {
    const clientUserId = await getClientSession()

    // Verify the task belongs to this client
    const relatedClientIds = await getRelatedClientIds(clientUserId)
    const task = await globalPrisma.task.findFirst({
        where: {
            id: taskId,
            OR: [
                { clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        }
    })

    if (!task) {
        return { success: false, error: 'Task không tồn tại hoặc bạn không có quyền đánh giá.' }
    }

    // Check if already rated
    const existing = await globalPrisma.rating.findUnique({ where: { taskId } })
    if (existing) {
        return { success: false, error: 'Task này đã được đánh giá rồi.' }
    }

    // Find the staff (assignee)
    if (!task.assigneeId) {
        return { success: false, error: 'Task chưa được giao cho ai.' }
    }

    try {
        await globalPrisma.rating.create({
            data: {
                taskId,
                clientId: clientUserId,
                staffId: task.assigneeId,
                creativeQuality,
                responsiveness,
                communication,
                qualitativeFeedback: qualitativeFeedback || null,
                workspaceId: task.workspaceId || undefined
            }
        })

        return { success: true }
    } catch (err) {
        console.error('[submitTaskRating] Error:', err)
        return { success: false, error: 'Không thể lưu đánh giá.' }
    }
}

/**
 * Fetches the real task detail for the client portal task-detail page.
 */
export async function getTaskDetailForPortal(taskId: string) {
    const clientUserId = await getClientSession()
    const relatedClientIds = await getRelatedClientIds(clientUserId)

    const task = await globalPrisma.task.findFirst({
        where: {
            id: taskId,
            OR: [
                { clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        include: {
            rating: true,
            assignee: { select: { username: true, nickname: true } },
            client: {
                select: {
                    name: true,
                    parent: {
                        select: { name: true }
                    }
                }
            },
            project: { select: { name: true } }
        }
    })

    if (!task) return null

    // [Sprint J P0 + Portal redesign] Strip ALL agency financials before returning
    // to client UI (jobPriceUSD already; now also profit/wage/value/exchangeRate).
    const { jobPriceUSD, profitVND, wageVND, value, exchangeRate, ...safeTask } = task as any
    void jobPriceUSD; void profitVND; void wageVND; void value; void exchangeRate
    return serializeDecimal({
        ...safeTask,
        clientStatus: deriveClientStatus(task.status, (task as any).clientReview),
        needsYou: deriveNeedsYou(task as any),
        clientPath: formatClientHierarchy(task.client)
    })
}

/**
 * Fetches all ratings for a client's tasks — used by admin CRM to see client feedback.
 */
export async function getClientTaskRatings(
    clientUserId: string,
    workspaceId: string
) {
    const workspacePrisma = getWorkspacePrisma(workspaceId)
    return await workspacePrisma.rating.findMany({
        where: { clientId: clientUserId },
        include: {
            task: { select: { title: true } },
            staff: { select: { username: true, nickname: true } }
        },
        orderBy: { createdAt: 'desc' }
    })
}

/**
 * Discovers workspaces where the client has data or memberships.
 */
export async function getClientWorkspaces() {
    const userId = await getClientSession()
    const relatedClientIds = await getRelatedClientIds(userId)

    // Check memberships
    const memberships = await globalPrisma.workspaceMember.findMany({
        where: { userId },
        select: { workspaceId: true }
    })

    const workspaceIds = new Set(memberships.map(m => m.workspaceId))

    // Check Tasks for other workspaces not in memberships
    const dataWorkspaces = await globalPrisma.task.findMany({
        where: {
            OR: [
                { clientUserId: userId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        select: { workspaceId: true },
        distinct: ['workspaceId']
    })

    dataWorkspaces.forEach(dw => {
        if (dw.workspaceId) workspaceIds.add(dw.workspaceId)
    })

    // [Client membership] Workspaces of profiles where I'm a CLIENT member — so a
    // freshly-invited client sees the workspace even before any task exists.
    const clientProfiles = await globalPrisma.profileAccess.findMany({
        where: { userId, role: 'CLIENT' },
        select: { profileId: true },
    })
    if (clientProfiles.length > 0) {
        const wsOfProfiles = await globalPrisma.workspace.findMany({
            where: { profileId: { in: clientProfiles.map(p => p.profileId) }, status: { not: 'SOFT_DELETED' } },
            select: { id: true },
        })
        wsOfProfiles.forEach(w => workspaceIds.add(w.id))
    }

    return await globalPrisma.workspace.findMany({
        where: { id: { in: Array.from(workspaceIds) } }
    })
}

/* ───────────────────────────────────────────────────────────────────────────
   [Client Portal redesign] Client-driven review actions.
   These run as the CLIENT (getClientSession) — they do NOT go through the staff
   `updateTaskStatus` (which requires the assignee/admin session + FSM guard).
   Minimal, scoped mutations + reuse of the notification + audit infrastructure.
   ─────────────────────────────────────────────────────────────────────────── */

/** Resolve a logged-in CLIENT to a task they own (or null). */
async function findOwnedTask(taskId: string, workspaceId: string, clientUserId: string, select: any): Promise<any> {
    const relatedClientIds = await getRelatedClientIds(clientUserId)
    const prisma = getWorkspacePrisma(workspaceId)
    return prisma.task.findFirst({
        where: {
            id: taskId,
            OR: [{ clientUserId }, { clientId: { in: relatedClientIds } }],
        },
        select,
    })
}

/**
 * Client approves a deliverable → task moves to 'Hoàn tất' (counted in payroll
 * like any completed task) + clientReview=APPROVED. Notifies the assignee.
 */
export async function approveDeliverable(taskId: string, workspaceId: string) {
    const clientUserId = await getClientSession()
    const task = await findOwnedTask(taskId, workspaceId, clientUserId, {
        id: true, title: true, status: true, assigneeId: true, assignedById: true, clientReview: true,
    })
    if (!task) return { success: false, error: 'Không tìm thấy sản phẩm hoặc bạn không có quyền.' }
    if (task.status === 'Hoàn tất' || task.clientReview === 'APPROVED') {
        return { success: false, error: 'Sản phẩm này đã được duyệt.' }
    }

    const prisma = getWorkspacePrisma(workspaceId)
    await prisma.task.update({
        where: { id: taskId },
        data: {
            status: 'Hoàn tất',
            deadline: null,
            clientReview: 'APPROVED',
            clientReviewedAt: new Date(),
            version: { increment: 1 },
        },
    })

    // Notify the assignee AND the admin who manages the task (mirror requestDeliverableChanges).
    const recipients = new Set<string>()
    if (task.assigneeId) recipients.add(task.assigneeId)
    if (task.assignedById) recipients.add(task.assignedById)
    recipients.delete(clientUserId)
    for (const uid of recipients) {
        try {
            const notif = await createNotificationInternal({
                userId: uid,
                type: 'TASK_STATUS_CHANGED',
                title: 'Khách đã duyệt sản phẩm 🎉',
                body: `Khách hàng đã duyệt "${task.title}". Task được đánh dấu Hoàn tất.`,
                taskId,
                actorId: clientUserId,
            })
            void broadcastNotificationToUser(uid, {
                id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                taskId, actorId: clientUserId, createdAt: notif.createdAt, isRead: false,
            })
        } catch (e) { console.error('[approveDeliverable] notify failed', e) }
    }

    void audit({
        workspaceId, actorUserId: clientUserId, action: 'task.client_approved',
        targetType: 'Task', targetId: taskId,
        before: { status: task.status }, after: { status: 'Hoàn tất', clientReview: 'APPROVED' },
    })

    revalidatePath(`/${workspaceId}/admin`)
    revalidatePath(`/${workspaceId}/dashboard`)
    return { success: true }
}

/**
 * Client requests changes → task moves to 'Revision' + stores clientFeedback
 * (separate from internal notes) + clientReview=CHANGES. Notifies assignee + the
 * admin who manages the task. The team then drives the internal rework flow.
 */
export async function requestDeliverableChanges(taskId: string, workspaceId: string, feedback: string) {
    const clientUserId = await getClientSession()
    const clean = (feedback || '').trim()
    if (!clean) return { success: false, error: 'Vui lòng nhập nội dung cần chỉnh sửa.' }

    const task = await findOwnedTask(taskId, workspaceId, clientUserId, {
        id: true, title: true, status: true, assigneeId: true, assignedById: true,
    })
    if (!task) return { success: false, error: 'Không tìm thấy sản phẩm hoặc bạn không có quyền.' }
    if (task.status === 'Hoàn tất') {
        return { success: false, error: 'Sản phẩm đã hoàn tất — không thể yêu cầu chỉnh sửa.' }
    }

    const prisma = getWorkspacePrisma(workspaceId)
    await prisma.task.update({
        where: { id: taskId },
        data: {
            status: 'Revision',
            deadline: null,
            clientReview: 'CHANGES',
            clientFeedback: clean,
            clientReviewedAt: new Date(),
            version: { increment: 1 },
        },
    })

    const recipients = new Set<string>()
    if (task.assigneeId) recipients.add(task.assigneeId)
    if (task.assignedById) recipients.add(task.assignedById)
    recipients.delete(clientUserId)
    for (const uid of recipients) {
        try {
            const notif = await createNotificationInternal({
                userId: uid,
                type: 'TASK_STATUS_CHANGED',
                title: 'Khách yêu cầu chỉnh sửa',
                body: `Khách hàng yêu cầu chỉnh sửa "${task.title}": ${clean.slice(0, 160)}`,
                taskId,
                actorId: clientUserId,
            })
            void broadcastNotificationToUser(uid, {
                id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                taskId, actorId: clientUserId, createdAt: notif.createdAt, isRead: false,
            })
        } catch (e) { console.error('[requestDeliverableChanges] notify failed', e) }
    }

    void audit({
        workspaceId, actorUserId: clientUserId, action: 'task.client_changes_requested',
        targetType: 'Task', targetId: taskId,
        before: { status: task.status }, after: { status: 'Revision', clientReview: 'CHANGES', feedback: clean },
    })

    revalidatePath(`/${workspaceId}/admin`)
    revalidatePath(`/${workspaceId}/dashboard`)
    return { success: true }
}

/** Human labels for the deliverable Activity timeline (from AuditLog). */
const ACTIVITY_LABELS: Record<string, string> = {
    'task.assigned': 'Project opened',
    'task.started': 'Editing started',
    'task.delivered': 'Submitted for your review',
    'task.completed': 'Approved & delivered',
    'task.client_approved': 'You approved & delivered',
    'task.client_changes_requested': 'You requested changes',
}

/**
 * Reads the AuditLog for one task → a client-safe Activity timeline (newest first).
 */
export async function getDeliverableActivity(taskId: string) {
    const clientUserId = await getClientSession()
    const relatedClientIds = await getRelatedClientIds(clientUserId)
    const owned = await globalPrisma.task.findFirst({
        where: { id: taskId, OR: [{ clientUserId }, { clientId: { in: relatedClientIds } }] },
        select: { id: true },
    })
    if (!owned) return []

    const rows = await globalPrisma.auditLog.findMany({
        where: { targetType: 'Task', targetId: taskId, action: { in: Object.keys(ACTIVITY_LABELS) } },
        orderBy: { createdAt: 'desc' },
        take: 30,
    })

    const actorIds = Array.from(new Set(rows.map(r => r.actorUserId).filter(Boolean))) as string[]
    const users = actorIds.length
        ? await globalPrisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true, nickname: true } })
        : []
    const nameById = new Map(users.map(u => [u.id, u.nickname || u.username]))

    return rows.map(r => ({
        label: ACTIVITY_LABELS[r.action] || r.action,
        who: r.actorUserId ? (nameById.get(r.actorUserId) || 'Team') : 'Team',
        date: r.createdAt.toISOString(),
    }))
}

/* ───────────────────────────────────────────────────────────────────────────
   [Client Portal redesign] "Message your team" — reuses the Knowledge Hub
   Channel / Message + Supabase realtime, via a per-client PRIVATE channel.
   CLIENT users aren't WorkspaceMembers, so this is a separate CLIENT-authorized
   path (can't use authorizeChannel / verifyWorkspaceAccess).
   ─────────────────────────────────────────────────────────────────────────── */

const PORTAL_AUTHOR_SELECT = { id: true, username: true, displayName: true, avatarUrl: true } as const

export interface PortalMessageDTO {
    id: string
    channelId: string
    content: string
    authorId: string
    author: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null
    parentId: string | null
    replyCount: number
    reactions: { emoji: string; userIds: string[] }[]
    editedAt: string | null
    deletedAt: string | null
    createdAt: string
}

function serializePortalMessage(m: any): PortalMessageDTO {
    return {
        id: m.id,
        channelId: m.channelId,
        content: m.deletedAt ? '' : m.content,
        authorId: m.authorId,
        author: m.author ?? null,
        parentId: m.parentId ?? null,
        replyCount: m.replyCount ?? 0,
        reactions: [],
        editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
        deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : null,
        createdAt: new Date(m.createdAt).toISOString(),
    }
}

/** Resolve the CLIENT's primary (root) Client record. */
async function getClientRoot(clientUserId: string): Promise<{ id: number; name: string } | null> {
    const user = await globalPrisma.user.findUnique({ where: { id: clientUserId }, select: { clientId: true } })
    const fkId = user?.clientId
    if (fkId) {
        const c = await globalPrisma.client.findUnique({ where: { id: fkId }, select: { id: true, name: true } })
        if (c) return c
    }
    const related = await getRelatedClientIds(clientUserId)
    if (related.length === 0) return null
    const roots = await globalPrisma.client.findMany({
        where: { id: { in: related } },
        select: { id: true, name: true, parentId: true },
    })
    const root = roots.find(r => r.parentId == null) || roots[0]
    return root ? { id: root.id, name: root.name } : null
}

/**
 * Verify a CLIENT may access a channel. Two paths (unified by [ChatP2-5]):
 *   1. Legacy per-client channel: `Channel.clientId === root.id` (auto-created
 *      for every client by getOrCreateClientChannelAsClient).
 *   2. [ChatP2-5] Explicit ChannelMember row created by staff via
 *      setChannelMembers — lets staff bring a client into any TEXT channel.
 *
 * Restricted to TEXT type — WIKI/FORUM are staff-only surfaces (the portal
 * MessageModal only renders a single chat stream).
 */
async function authorizeClientChannel(workspaceId: string, channelId: string, clientUserId: string) {
    const root = await getClientRoot(clientUserId)
    // root is optional for path 2 — a freshly-invited CLIENT may have no Client record
    // wired up yet but still legitimately appear in ChannelMember.
    const channel = await globalPrisma.channel.findFirst({
        where: {
            id: channelId,
            workspaceId,
            type: 'TEXT',
            OR: [
                ...(root ? [{ clientId: root.id }] : []),
                { members: { some: { userId: clientUserId } } },
            ],
        },
        select: { id: true, profileId: true },
    })
    if (!channel) throw new Error('CLIENT_CHANNEL_FORBIDDEN')
    // root may be null in path 2; downstream callers (sendClientMessage admin notify)
    // tolerate it via a sane fallback label.
    return { clientUserId, root: root ?? { id: 0, name: 'Khách' }, channel }
}

/**
 * Get-or-create the per-client default channel + list every TEXT channel this
 * CLIENT user can access (their per-client channel + any channel a staff manager
 * added them to via setChannelMembers — [ChatP2-5]).
 *
 * Backward-compat: legacy callers using `res.channel` still work via the same
 * shape; new callers can read `res.availableChannels` to render a switcher.
 */
export async function getOrCreateClientChannelAsClient(workspaceId: string): Promise<{
    channel: { id: string; name: string }
    availableChannels: { id: string; name: string }[]
} | { error: string }> {
    const clientUserId = await getClientSession()
    const root = await getClientRoot(clientUserId)

    const ws = await globalPrisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, profileId: true } })
    if (!ws?.profileId) return { error: 'Workspace không hợp lệ.' }
    const profileId = ws.profileId

    let defaultChannel: { id: string; name: string } | null = null

    // Per-client default channel — only attempt when the client root is resolvable.
    if (root) {
        defaultChannel = await globalPrisma.channel.findFirst({
            where: { workspaceId, clientId: root.id, type: 'TEXT' },
            select: { id: true, name: true },
        })

        if (!defaultChannel) {
            defaultChannel = await globalPrisma.channel.create({
                data: {
                    workspaceId, profileId, clientId: root.id,
                    name: `Khách: ${root.name}`.slice(0, 80),
                    type: 'TEXT', visibility: 'PRIVATE', postPolicy: 'EVERYONE', position: 999,
                },
                select: { id: true, name: true },
            })
        }

        // Ensure the client + workspace admins are members of the default channel (idempotent).
        const admins = await globalPrisma.workspaceMember.findMany({
            where: { workspaceId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { userId: true },
        })
        const memberUserIds = Array.from(new Set([clientUserId, ...admins.map(a => a.userId)]))
        await globalPrisma.channelMember.createMany({
            data: memberUserIds.map(userId => ({ workspaceId, profileId, channelId: defaultChannel!.id, userId, role: 'MEMBER' as const })),
            skipDuplicates: true,
        })
    }

    // [ChatP2-5] Any additional TEXT channels staff invited this user into.
    const inviteRows = await globalPrisma.channel.findMany({
        where: {
            workspaceId,
            type: 'TEXT',
            members: { some: { userId: clientUserId } },
        },
        select: { id: true, name: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    })

    // Merge: default first (if any), then invites — dedupe by id.
    const seen = new Set<string>()
    const availableChannels: { id: string; name: string }[] = []
    if (defaultChannel) {
        availableChannels.push(defaultChannel)
        seen.add(defaultChannel.id)
    }
    for (const c of inviteRows) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        availableChannels.push(c)
    }

    if (availableChannels.length === 0) {
        return { error: 'Chưa liên kết tài khoản khách với hồ sơ khách hàng.' }
    }

    return { channel: availableChannels[0], availableChannels }
}

/** Fetch messages of the per-client channel (CLIENT-auth, oldest→newest). */
export async function getClientMessages(workspaceId: string, channelId: string) {
    const clientUserId = await getClientSession()
    try {
        await authorizeClientChannel(workspaceId, channelId, clientUserId)
    } catch {
        return { messages: [] as PortalMessageDTO[] }
    }
    const rows = await globalPrisma.message.findMany({
        where: { workspaceId, channelId, parentId: null },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: { author: { select: PORTAL_AUTHOR_SELECT } },
    })
    return { messages: rows.map(serializePortalMessage) }
}

/** Client posts into their per-client channel → realtime broadcast + notify admins. */
export async function sendClientMessage(workspaceId: string, channelId: string, content: string): Promise<{ success: true; message: PortalMessageDTO } | { error: string }> {
    const clientUserId = await getClientSession()
    const clean = (content || '').trim()
    if (!clean) return { error: 'Tin nhắn trống' }
    if (clean.length > 4000) return { error: 'Tin nhắn quá dài (tối đa 4000 ký tự)' }

    let auth: Awaited<ReturnType<typeof authorizeClientChannel>>
    try {
        auth = await authorizeClientChannel(workspaceId, channelId, clientUserId)
    } catch {
        return { error: 'Bạn không có quyền gửi tin trong kênh này' }
    }
    const profileId = auth.channel.profileId

    const created = await globalPrisma.message.create({
        data: { workspaceId, profileId, channelId, authorId: clientUserId, content: clean },
        include: { author: { select: PORTAL_AUTHOR_SELECT } },
    })
    const dto = serializePortalMessage(created)
    await broadcastToChannel(channelId, CHAT_EVENTS.MESSAGE_NEW, dto)

    // Notify workspace admins (the recipients of client messages).
    try {
        const admins = await globalPrisma.workspaceMember.findMany({
            where: { workspaceId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { userId: true },
        })
        await Promise.allSettled(admins
            .filter(a => a.userId !== clientUserId)
            .map(async (a) => {
                const notif = await createNotificationInternal({
                    userId: a.userId,
                    type: 'CHANNEL_MESSAGE',
                    title: `Tin nhắn từ khách ${auth.root.name}`,
                    body: clean.slice(0, 140),
                    actorId: clientUserId,
                    metadata: { channelId, clientName: auth.root.name },
                })
                void broadcastNotificationToUser(a.userId, {
                    id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                    channelId, actorId: clientUserId, createdAt: notif.createdAt, isRead: false,
                })
            }))
    } catch (e) { console.error('[sendClientMessage] notify admins failed', e) }

    return { success: true, message: dto }
}


