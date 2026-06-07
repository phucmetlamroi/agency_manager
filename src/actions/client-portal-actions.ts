'use server'

import DOMPurify from 'isomorphic-dompurify'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma as globalPrisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatClientHierarchy } from '@/lib/client-hierarchy'
import { serializeDecimal } from '@/lib/serialization'
import { revalidatePath } from 'next/cache'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { audit } from '@/lib/audit-log'

/**
 * [Security · Portal Audit M3] CLIENT session gate — now scopes to a workspace's
 * profile when workspaceId is provided. Without scope (legacy callers / cross-
 * workspace lookups like getClientWorkspaces), falls back to "user has CLIENT
 * access to ANY profile" — safe because downstream queries are workspace-scoped
 * via getWorkspacePrisma, and getRelatedClientIds resolves only Client records
 * the user is portal-user-of.
 *
 * Pass workspaceId for action calls that mutate or read scoped data (defense in
 * depth against RPC-style invocation that bypasses the page-layer
 * getPortalUserId guard).
 */
async function getClientSession(workspaceId?: string) {
    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }
    const userId = session.user.id
    // Legacy global CLIENT role — fully isolated by getRelatedClientIds downstream.
    if (session.user.role === 'CLIENT') return userId

    // Per-profile CLIENT check.
    const where: { userId: string; role: 'CLIENT'; profileId?: string } = { userId, role: 'CLIENT' }
    if (workspaceId) {
        const ws = await globalPrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true },
        })
        if (ws?.profileId) where.profileId = ws.profileId
    }
    const access = await globalPrisma.profileAccess.findFirst({ where, select: { id: true } })
    if (access) return userId
    redirect('/login')
}

/**
 * [Security · Portal Audit M3] Resolve CLIENT session for a single-task action
 * (submitTaskRating, getDeliverableActivity). Looks up the task's workspaceId
 * and then verifies CLIENT-of-that-workspace's-profile. Prevents a CLIENT of
 * profile A from calling a task action on profile B's task via RPC.
 */
async function getClientSessionForTask(taskId: string) {
    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }
    const task = await globalPrisma.task.findUnique({
        where: { id: taskId },
        select: { workspaceId: true },
    })
    if (!task?.workspaceId) {
        // Task không tồn tại hoặc không gắn workspace — coi như unauthorized.
        redirect('/login')
    }
    return getClientSession(task.workspaceId)
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
 * 1. PRIORITY 1: ProfileAccess(role=CLIENT, clientId) — per-profile membership.
 * 2. PRIORITY 2: User.clientId FK (explicit link, legacy backfill).
 * 3. PRIORITY 3 (fallback legacy): name match — chỉ dùng khi không có FK + cả
 *    username VÀ nickname đều non-empty (M9: tránh match Client tên rỗng).
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

    // [M9] Legacy fallback: profile-scoped name match — only if nothing else resolved
    // AND at least one of username/nickname is non-empty (so we don't OR on '' and
    // accidentally pick up Client records with empty names).
    if (rootIds.size === 0 && user) {
        const username = (user.username ?? '').trim()
        const nickname = (user.nickname ?? '').trim()
        const userProfileId = user.profileId
        const names = [username, nickname].filter(n => n.length > 0)
        if (userProfileId && names.length > 0) {
            const rootClients = await globalPrisma.client.findMany({
                where: { OR: names.map(n => ({ name: n })), profileId: userProfileId, status: { not: 'SOFT_DELETED' } },
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

/* ───────────────────────────────────────────────────────────────────────────
   [Security · M4] Server-side input sanitization for free-text client fields.
   Currently UI renders these as React text (auto-escapes), but we cap length +
   strip HTML defensively for: (a) DoS / DB bloat, (b) future surfaces (email
   digest, audit log viewer) that might render as HTML.
   ─────────────────────────────────────────────────────────────────────────── */
const FEEDBACK_MAX_LEN = 4000   // requestDeliverableChanges.feedback
const RATING_FEEDBACK_MAX_LEN = 2000  // submitTaskRating.qualitativeFeedback

function sanitizeClientText(raw: string, maxLen: number): string {
    // DOMPurify w/ ALLOWED_TAGS:[] → strip all tags, keep plain text.
    const stripped = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    return stripped.trim().slice(0, maxLen)
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
    const clientUserId = await getClientSession(workspaceId)
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
    const clientUserId = await getClientSession(workspaceId)
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
    const clientUserId = await getClientSession(workspaceId)
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
 *
 * [Security · M5+M6] Validates:
 *  - All three star scores are integers in [1,5].
 *  - The task is actually completed (status='Hoàn tất' OR clientReview='APPROVED')
 *    so clients can't rate a Pending / Cancelled / in-progress task.
 *  - Free-text feedback is HTML-stripped + length-capped.
 *  - Session is scoped to the task's workspace's profile (M3).
 */
export async function submitTaskRating(
    taskId: string,
    creativeQuality: number,
    responsiveness: number,
    communication: number,
    qualitativeFeedback?: string
) {
    const clientUserId = await getClientSessionForTask(taskId)

    // [M5] Validate star ranges — must be integers in [1,5].
    const isValidStar = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5
    if (!isValidStar(creativeQuality) || !isValidStar(responsiveness) || !isValidStar(communication)) {
        return { success: false, error: 'Điểm đánh giá phải là số nguyên từ 1 đến 5.' }
    }

    // Verify the task belongs to this client.
    const relatedClientIds = await getRelatedClientIds(clientUserId)
    const task = await globalPrisma.task.findFirst({
        where: {
            id: taskId,
            OR: [
                { clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        select: { id: true, assigneeId: true, workspaceId: true, status: true, clientReview: true },
    })

    if (!task) {
        return { success: false, error: 'Task không tồn tại hoặc bạn không có quyền đánh giá.' }
    }

    // [M6] Only allow rating once the task is actually completed.
    const statusOk = task.status === 'Hoàn tất' || task.clientReview === 'APPROVED'
    if (!statusOk) {
        return { success: false, error: 'Chỉ có thể đánh giá khi task đã hoàn tất.' }
    }

    // Check if already rated.
    const existing = await globalPrisma.rating.findUnique({ where: { taskId } })
    if (existing) {
        return { success: false, error: 'Task này đã được đánh giá rồi.' }
    }

    // Find the staff (assignee).
    if (!task.assigneeId) {
        return { success: false, error: 'Task chưa được giao cho ai.' }
    }

    // [M4] Sanitize + cap qualitativeFeedback (defensive: strip any HTML,
    // length-cap to prevent DB bloat).
    const safeFeedback = qualitativeFeedback
        ? sanitizeClientText(qualitativeFeedback, RATING_FEEDBACK_MAX_LEN)
        : null

    try {
        await globalPrisma.rating.create({
            data: {
                taskId,
                clientId: clientUserId,
                staffId: task.assigneeId,
                creativeQuality,
                responsiveness,
                communication,
                qualitativeFeedback: safeFeedback,
                workspaceId: task.workspaceId || undefined
            }
        })

        return { success: true }
    } catch (err) {
        console.error('[submitTaskRating] Error:', err)
        return { success: false, error: 'Không thể lưu đánh giá.' }
    }
}

// [Portal Audit M1+M2] Removed two dead `'use server'` exports that bypassed
// authentication:
//   - getClientTaskRatings(clientUserId, workspaceId) had NO session check →
//     any authenticated caller could supply an arbitrary clientUserId and read
//     ratings + staff metadata for someone else's tasks.
//   - getTaskDetailForPortal(taskId) used a destructuring blocklist that leaked
//     internal Task fields (fileLink, isPenalized, submissionFolder,
//     assignedAgencyId, claimSource, claimedAt, assignedById, invoiceId,
//     invoiceStatus, version, profileId, isArchived) to clients.
// Neither was called from the UI. Re-add later with explicit auth + whitelist
// SELECT if a real use-case appears.

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
    const clientUserId = await getClientSession(workspaceId)
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
 *
 * [Security · M4] feedback is HTML-stripped + length-capped before storage.
 */
export async function requestDeliverableChanges(taskId: string, workspaceId: string, feedback: string) {
    const clientUserId = await getClientSession(workspaceId)
    // [M4] Strip HTML + cap length.
    const clean = sanitizeClientText(feedback || '', FEEDBACK_MAX_LEN)
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
    const clientUserId = await getClientSessionForTask(taskId)
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
