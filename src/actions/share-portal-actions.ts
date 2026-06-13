'use server'

/**
 * [Canonical Clients 2026-06] PUBLIC server actions for the share-link portal.
 *
 * There is NO session here — the token IS the credential. Every action
 * re-resolves the token through resolveShareToken (single chokepoint:
 * hash-at-rest lookup, revocation, expiry, rate limit, uniform null failure)
 * and authorizes strictly via `task.clientId ∈ scope.clientIds` +
 * `task.workspaceId ∈ scope.workspaceIds`.
 *
 * Bodies are ports of the account-portal actions (client-portal-actions.ts —
 * removed in P5) with identical state-machine guards, sanitization and
 * notification fan-out. Audit rows carry `actorUserId: null` +
 * `viaShareLinkId` so admin forensics can distinguish link-driven actions.
 */

import { prisma } from '@/lib/db'
import { serializeDecimal } from '@/lib/serialization'
import { formatClientHierarchy } from '@/lib/client-hierarchy'
import { deriveClientStatus, deriveNeedsYou } from '@/lib/portal-derive'
import { sanitizeClientText, FEEDBACK_MAX_LEN, RATING_FEEDBACK_MAX_LEN } from '@/lib/sanitize'
import { resolveShareToken, getRequestIp } from '@/lib/share-link-auth'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { audit } from '@/lib/audit-log'
import { revalidatePath } from 'next/cache'

/* ───────────────────────────────────────────────────────────────────────────
   Reads
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Full snapshot for the share page: tasks + invoices of the client (and its
 * subsidiaries) across EVERY ACTIVE workspace of the profile — "toàn bộ lịch
 * sử từ trước tới giờ".
 *
 * Field whitelist mirrors the old getClientTasks exactly — most importantly
 * the [Sprint J P0] exclusion of jobPriceUSD (agency revenue must never leak
 * to clients).
 */
export async function getShareSnapshot(token: string) {
    const scope = await resolveShareToken(token)
    if (!scope) return null

    const [tasks, invoices] = await Promise.all([
        prisma.task.findMany({
            where: {
                clientId: { in: scope.clientIds },
                workspaceId: { in: scope.workspaceIds },
                isArchived: false,
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
                // jobPriceUSD: EXCLUDED — agency revenue, never leaks to clients
                clientId: true,
                workspaceId: true,
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
                    select: { id: true, name: true, parent: { select: { name: true } } },
                },
                project: { select: { id: true, name: true } },
                rating: true,
                assignee: { select: { username: true, nickname: true } },
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.invoice.findMany({
            where: {
                clientId: { in: scope.clientIds },
                workspaceId: { in: scope.workspaceIds },
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
                workspaceId: true,
                items: { select: { description: true, amount: true, quantity: true } },
            },
        }),
    ])

    // ── Workspace identity for the client-facing period filter ────────────
    // [Atelier 2026-06] The client asked for the admin's "Tháng X/2026"
    // workspace switcher. We only surface workspaces that ACTUALLY hold this
    // client's data ("sổ workspace mình đã làm") — not every empty month of the
    // profile — and order them newest-first like the admin dropdown does. The
    // name lookup is a single batched query over the ids already present in the
    // result set (no extra scope widening, no security surface).
    const presentWsIds = Array.from(
        new Set([
            ...tasks.map((t) => t.workspaceId),
            ...invoices.map((i) => i.workspaceId),
        ].filter((id): id is string => !!id)),
    )
    const wsRows = presentWsIds.length
        ? await prisma.workspace.findMany({
            where: { id: { in: presentWsIds } },
            select: { id: true, name: true, createdAt: true },
        })
        : []
    const wsNameById = new Map(wsRows.map((w) => [w.id, w.name]))
    const workspaces = wsRows
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((w) => ({ id: w.id, name: w.name }))

    // [Hotfix 2026-06-13] serializeDecimal keeps Date objects AS-IS (it only
    // unwraps Prisma Decimal), but the calm `Deliverable`/`Invoice` DTOs declare
    // their date fields as `string` and the surfaces treat them as such
    // (OverviewSurface sorts via `updatedAt.localeCompare(...)`). A raw Date
    // survives the RSC boundary as a Date in the browser → `.localeCompare is
    // not a function` crash on the share page. Stringify every date field here,
    // mirroring how the old getClientInvoices did `.toISOString()`.
    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

    const mappedTasks = tasks.map((task) => ({
        ...task,
        deadline: iso(task.deadline),
        createdAt: iso(task.createdAt)!,
        updatedAt: iso(task.updatedAt)!,
        clientReviewedAt: iso(task.clientReviewedAt),
        clientStatus: deriveClientStatus(task.status, task.clientReview),
        needsYou: deriveNeedsYou(task),
        clientPath: formatClientHierarchy(task.client),
        workspaceName: task.workspaceId ? wsNameById.get(task.workspaceId) ?? null : null,
    }))

    const mappedInvoices = invoices.map((inv) => ({
        ...inv,
        issueDate: iso(inv.issueDate)!,
        dueDate: iso(inv.dueDate),
        workspaceName: inv.workspaceId ? wsNameById.get(inv.workspaceId) ?? null : null,
    }))

    return {
        clientName: scope.clientName,
        profileName: scope.profileName,
        workspaces,
        tasks: serializeDecimal(mappedTasks) as typeof mappedTasks,
        invoices: serializeDecimal(mappedInvoices) as typeof mappedInvoices,
    }
}

/** Resolve a token to a task it owns (or null) — the authz primitive here. */
async function findScopedTask(
    token: string,
    taskId: string,
    select: Record<string, boolean>,
): Promise<{ scope: Awaited<ReturnType<typeof resolveShareToken>>; task: any }> {
    const scope = await resolveShareToken(token)
    if (!scope) return { scope: null, task: null }
    // Cast: the select object is dynamic, so Prisma can't narrow the payload
    // type — callers only touch the whitelisted fields they selected.
    const task = (await prisma.task.findFirst({
        where: {
            id: taskId,
            clientId: { in: scope.clientIds },
            workspaceId: { in: scope.workspaceIds },
        },
        select: select as any,
    })) as any
    return { scope, task }
}

/* ───────────────────────────────────────────────────────────────────────────
   Writes — every thao tác "back ngược lại cho phía admin": notification to
   assignee + assigning admin, audit row with shareLinkId + ip/UA.
   ─────────────────────────────────────────────────────────────────────────── */

async function notifyStaff(
    task: { assigneeId: string | null; assignedById: string | null; title: string },
    taskId: string,
    title: string,
    body: string,
) {
    const recipients = new Set<string>()
    if (task.assigneeId) recipients.add(task.assigneeId)
    if (task.assignedById) recipients.add(task.assignedById)
    for (const uid of recipients) {
        try {
            const notif = await createNotificationInternal({
                userId: uid,
                type: 'TASK_STATUS_CHANGED',
                title,
                body,
                taskId,
                actorId: undefined,
            })
            void broadcastNotificationToUser(uid, {
                id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                taskId, createdAt: notif.createdAt, isRead: false,
            })
        } catch (e) {
            console.error('[share-portal] notify failed', e)
        }
    }
}

/** Client approves a deliverable via the public link → task 'Hoàn tất'. */
export async function approveDeliverableViaToken(token: string, taskId: string) {
    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, title: true, status: true, assigneeId: true, assignedById: true,
        clientReview: true, workspaceId: true,
    })
    if (!scope || !task) return { success: false, error: 'Link không hợp lệ hoặc sản phẩm không tồn tại.' }
    if (task.status === 'Hoàn tất' || task.clientReview === 'APPROVED') {
        return { success: false, error: 'Sản phẩm này đã được duyệt.' }
    }

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

    await notifyStaff(
        task, taskId,
        'Khách đã duyệt sản phẩm 🎉',
        `Khách hàng "${scope.clientName}" đã duyệt "${task.title}" (qua link chia sẻ). Task được đánh dấu Hoàn tất.`,
    )

    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'task.client_approved',
        targetType: 'Task', targetId: taskId,
        before: { status: task.status },
        after: { status: 'Hoàn tất', clientReview: 'APPROVED', viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    if (task.workspaceId) {
        try {
            revalidatePath(`/${task.workspaceId}/admin`)
            revalidatePath(`/${task.workspaceId}/dashboard`)
        } catch { /* best-effort */ }
    }
    return { success: true }
}

/** Client requests changes via the public link → task 'Revision' + feedback. */
export async function requestChangesViaToken(token: string, taskId: string, feedback: string) {
    const clean = sanitizeClientText(feedback || '', FEEDBACK_MAX_LEN)
    if (!clean) return { success: false, error: 'Vui lòng nhập nội dung cần chỉnh sửa.' }

    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, title: true, status: true, assigneeId: true, assignedById: true, workspaceId: true,
    })
    if (!scope || !task) return { success: false, error: 'Link không hợp lệ hoặc sản phẩm không tồn tại.' }
    if (task.status === 'Hoàn tất') {
        return { success: false, error: 'Sản phẩm đã hoàn tất — không thể yêu cầu chỉnh sửa.' }
    }

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

    await notifyStaff(
        task, taskId,
        'Khách yêu cầu chỉnh sửa',
        `Khách hàng "${scope.clientName}" yêu cầu chỉnh sửa "${task.title}" (qua link chia sẻ): ${clean.slice(0, 160)}`,
    )

    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'task.client_changes_requested',
        targetType: 'Task', targetId: taskId,
        before: { status: task.status },
        after: { status: 'Revision', clientReview: 'CHANGES', feedback: clean, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    if (task.workspaceId) {
        try {
            revalidatePath(`/${task.workspaceId}/admin`)
            revalidatePath(`/${task.workspaceId}/dashboard`)
        } catch { /* best-effort */ }
    }
    return { success: true }
}

/**
 * Star rating via the public link. Same guards as the account version
 * (M5/M6): integers 1-5, task completed, Rating.taskId unique, assignee
 * exists. Provenance: clientId=null, shareLinkId set, ratedVia='SHARE_LINK'.
 */
export async function submitRatingViaToken(
    token: string,
    taskId: string,
    creativeQuality: number,
    responsiveness: number,
    communication: number,
    qualitativeFeedback?: string,
) {
    const isValidStar = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5
    if (!isValidStar(creativeQuality) || !isValidStar(responsiveness) || !isValidStar(communication)) {
        return { success: false, error: 'Điểm đánh giá phải là số nguyên từ 1 đến 5.' }
    }

    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, assigneeId: true, workspaceId: true, status: true, clientReview: true,
    })
    if (!scope || !task) return { success: false, error: 'Link không hợp lệ hoặc task không tồn tại.' }

    const statusOk = task.status === 'Hoàn tất' || task.clientReview === 'APPROVED'
    if (!statusOk) return { success: false, error: 'Chỉ có thể đánh giá khi task đã hoàn tất.' }

    const existing = await prisma.rating.findUnique({ where: { taskId } })
    if (existing) return { success: false, error: 'Task này đã được đánh giá rồi.' }

    if (!task.assigneeId) return { success: false, error: 'Task chưa được giao cho ai.' }

    const safeFeedback = qualitativeFeedback
        ? sanitizeClientText(qualitativeFeedback, RATING_FEEDBACK_MAX_LEN)
        : null

    try {
        await prisma.rating.create({
            data: {
                taskId,
                clientId: null,
                shareLinkId: scope.shareLinkId,
                ratedVia: 'SHARE_LINK',
                staffId: task.assigneeId,
                creativeQuality,
                responsiveness,
                communication,
                qualitativeFeedback: safeFeedback,
                workspaceId: task.workspaceId || undefined,
            },
        })
        return { success: true }
    } catch (err) {
        console.error('[submitRatingViaToken] Error:', err)
        return { success: false, error: 'Không thể lưu đánh giá.' }
    }
}

/** Human labels for the deliverable Activity timeline (port of the account version). */
const ACTIVITY_LABELS: Record<string, string> = {
    'task.assigned': 'Project opened',
    'task.started': 'Editing started',
    'task.delivered': 'Submitted for your review',
    'task.completed': 'Approved & delivered',
    'task.client_approved': 'You approved & delivered',
    'task.client_changes_requested': 'You requested changes',
}

export async function getActivityViaToken(token: string, taskId: string) {
    const { scope, task } = await findScopedTask(token, taskId, { id: true })
    if (!scope || !task) return []

    const rows = await prisma.auditLog.findMany({
        where: { targetType: 'Task', targetId: taskId, action: { in: Object.keys(ACTIVITY_LABELS) } },
        orderBy: { createdAt: 'desc' },
        take: 30,
    })

    const actorIds = Array.from(new Set(rows.map(r => r.actorUserId).filter(Boolean))) as string[]
    const users = actorIds.length
        ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true, nickname: true } })
        : []
    const nameById = new Map(users.map(u => [u.id, u.nickname || u.username]))

    return rows.map(r => ({
        label: ACTIVITY_LABELS[r.action] || r.action,
        // Link-driven rows have actorUserId=null → attribute to "You" since
        // only the client (token holder) performs those.
        who: r.actorUserId ? (nameById.get(r.actorUserId) || 'Team') : 'You',
        date: r.createdAt.toISOString(),
    }))
}
