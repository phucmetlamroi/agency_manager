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
import { sanitizeClientText, FEEDBACK_MAX_LEN, RATING_FEEDBACK_MAX_LEN, TITLE_MAX_LEN, LINK_MAX_LEN } from '@/lib/sanitize'
import { rateLimit } from '@/lib/rate-limit'
import { resolveShareToken, getRequestIp } from '@/lib/share-link-auth'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { isValidReaction } from '@/lib/comment-reactions'
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
                // [2026-06-29] jobPriceUSD INCLUDED for client billing transparency. The
                // client PAYS this USD price, so they may see it in their OWN portal. This
                // path is reachable only via the client's token-gated ClientShareLink (no
                // staff/editor ever calls getShareSnapshot); staff surfaces still strip it
                // via sanitizeTaskForUser. Policy change confirmed by owner (admin+client see
                // USD, no one else). Do NOT add jobPriceUSD to any staff serialization.
                jobPriceUSD: true,
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
                // [Trial P0] Manager ("Người quản lý") — the ONLY staff identity the client may see.
                assignedBy: { select: { username: true, nickname: true } },
                // [Video Review] Does this deliverable have an in-app review video?
                // Drives the portal's "Review video" entry point (count>0 = show).
                _count: { select: { videoVersions: true } },
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

    const mappedTasks = tasks.map(({ _count, assignedBy, ...task }) => ({
        ...task,
        hasVideo: (_count?.videoVersions ?? 0) > 0,
        // [Trial P0 — isolation] The client must NEVER receive the editor's identity;
        // ship the Manager instead ("client làm việc với manager, không biết editor").
        assignee: null,
        manager: assignedBy ? (assignedBy.nickname || assignedBy.username) : null,
        // [Invoice i18n] Never ship the raw Vietnamese staff instruction (notes_vi) to a
        // foreign client. The portal renders only notes_en; null notes_vi here so it can never
        // leak via a future `notes_en || notes_vi` fallback (the pattern staff TaskDrawer uses).
        notes_vi: null,
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

    // [Trial P3 — white-label] The agency's brand for the client portal lockup:
    // logo + name + optional accent (settings.portalAccent). Only these three
    // brand fields leave the server — never any other profile/settings data.
    const brandProfile = scope.profileId
        ? await prisma.profile.findUnique({ where: { id: scope.profileId }, select: { name: true, logoUrl: true, settings: true } })
        : null
    const rawAccent = brandProfile?.settings && typeof brandProfile.settings === 'object' && !Array.isArray(brandProfile.settings)
        ? (brandProfile.settings as any).portalAccent
        : null
    const brandAccent = typeof rawAccent === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawAccent) ? rawAccent : null

    return {
        clientName: scope.clientName,
        profileName: scope.profileName,
        brandName: brandProfile?.name || scope.profileName,
        brandLogoUrl: brandProfile?.logoUrl || null,
        brandAccent,
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
            // [AUDIT R6 — fix] Match the getShareSnapshot read filter (isArchived:false).
            // Since cancel→archive ('Đã hủy' sets isArchived=true) the snapshot hides
            // archived tasks; without this, a client holding an old deliverable URL
            // could still approve/request-changes on a cancelled task, flipping its
            // status while isArchived stays true (status desync, invisible to admin).
            isArchived: false,
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

/**
 * Notify the profile's OWNER/ADMIN staff that a client submitted a brand-new task.
 * A fresh client-submitted task has no assignee/assigner yet, so `notifyStaff`
 * (which targets task.assigneeId/assignedById) doesn't apply — route to the
 * profile admins instead.
 */
async function notifyProfileAdmins(profileId: string, title: string, body: string, taskId: string) {
    try {
        const admins = await prisma.profileAccess.findMany({
            where: { profileId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { userId: true },
        })
        for (const { userId } of admins) {
            try {
                const notif = await createNotificationInternal({
                    userId, type: 'TASK_STATUS_CHANGED', title, body, taskId, actorId: undefined,
                })
                void broadcastNotificationToUser(userId, {
                    id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                    taskId, createdAt: notif.createdAt, isRead: false,
                })
            } catch (e) {
                console.error('[share-portal] notifyProfileAdmins one failed', e)
            }
        }
    } catch (e) {
        console.error('[share-portal] notifyProfileAdmins query failed', e)
    }
}

/** Client approves a deliverable via the public link → task 'Hoàn tất'. */
export async function approveDeliverableViaToken(token: string, taskId: string) {
    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, title: true, status: true, assigneeId: true, assignedById: true,
        clientReview: true, workspaceId: true,
    })
    if (!scope || !task) return { success: false, error: 'This link is invalid or the deliverable no longer exists.' }
    if (task.status === 'Hoàn tất' || task.clientReview === 'APPROVED') {
        return { success: false, error: 'This deliverable has already been approved.' }
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
    if (!clean) return { success: false, error: 'Please describe the changes you would like.' }

    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, title: true, status: true, assigneeId: true, assignedById: true, workspaceId: true,
    })
    if (!scope || !task) return { success: false, error: 'This link is invalid or the deliverable no longer exists.' }
    if (task.status === 'Hoàn tất') {
        return { success: false, error: 'This deliverable is already completed — changes can no longer be requested.' }
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
        return { success: false, error: 'Ratings must be whole numbers from 1 to 5.' }
    }

    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, assigneeId: true, workspaceId: true, status: true, clientReview: true,
    })
    if (!scope || !task) return { success: false, error: 'This link is invalid or the item no longer exists.' }

    const statusOk = task.status === 'Hoàn tất' || task.clientReview === 'APPROVED'
    if (!statusOk) return { success: false, error: 'You can only rate a completed deliverable.' }

    const existing = await prisma.rating.findUnique({ where: { taskId } })
    if (existing) return { success: false, error: 'This deliverable has already been rated.' }

    if (!task.assigneeId) return { success: false, error: 'This deliverable has not been assigned yet.' }

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
        return { success: false, error: 'Could not save your rating. Please try again.' }
    }
}

/* ───────────────────────────────────────────────────────────────────────────
   Client Task Submission — the client creates a NEW task from the portal.
   ─────────────────────────────────────────────────────────────────────────── */

/** URL sanity: trimmed http(s) link, control/tag stripped, length-capped. */
function cleanLink(raw: string | undefined): string {
    return sanitizeClientText(raw || '', LINK_MAX_LEN)
}
function looksLikeUrl(s: string): boolean {
    return /^https?:\/\/\S+$/i.test(s)
}

/**
 * Dropdown options for the "create task" form — the client picks BOTH the month
 * (workspace) and the brand (sub-client), restricted to this link's own scope.
 * Workspaces are filtered to ACTIVE (never submit into a trashed/archived month).
 */
export async function getSubmitOptionsViaToken(token: string) {
    const scope = await resolveShareToken(token)
    if (!scope) return null
    const [workspaces, brands] = await Promise.all([
        prisma.workspace.findMany({
            where: { id: { in: scope.workspaceIds }, status: 'ACTIVE' },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.client.findMany({
            where: { id: { in: scope.clientIds }, status: 'ACTIVE' },
            select: { id: true, name: true },
        }),
    ])
    // Root/canonical client first, then subs alphabetically.
    const brandList = brands
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => (a.id === scope.clientId ? -1 : b.id === scope.clientId ? 1 : a.name.localeCompare(b.name)))
    return {
        workspaces: workspaces.map((w) => ({ id: w.id, label: w.name })),
        brands: brandList,
        clientName: scope.clientName,
    }
}

/**
 * Client creates a task from the portal. Token-authed (no session); every input
 * is re-validated against the link's scope server-side. The task lands UNASSIGNED
 * ('Đang đợi giao') with the Raw/B-roll links encoded in the pipe format the admin
 * TaskDetailModal parses; the requirement goes to notes_vi. Admin then triages.
 */
export async function createTaskViaToken(
    token: string,
    input: { workspaceId: string; clientId: number; title: string; rawLink: string; brollLink?: string; notes?: string },
) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }

    // Per-link burst guard (best-effort; the 256-bit token is the real wall).
    const rl = await rateLimit(`client-create-task:${scope.shareLinkId}`, 20, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' }

    // Fail-closed scope checks — client cannot inject another profile's/client's id.
    if (!input || typeof input.workspaceId !== 'string' || typeof input.clientId !== 'number') {
        return { success: false, error: 'Thiếu thông tin.' }
    }
    if (!scope.workspaceIds.includes(input.workspaceId)) return { success: false, error: 'Tháng không hợp lệ.' }
    if (!scope.clientIds.includes(input.clientId)) return { success: false, error: 'Brand không hợp lệ.' }

    // The chosen month must still be ACTIVE.
    const ws = await prisma.workspace.findFirst({
        where: { id: input.workspaceId, status: 'ACTIVE' },
        select: { id: true },
    })
    if (!ws) return { success: false, error: 'Tháng này không còn hoạt động.' }

    // Validate + sanitize.
    const title = sanitizeClientText(input.title || '', TITLE_MAX_LEN)
    if (!title) return { success: false, error: 'Vui lòng nhập tên dự án/video.' }
    const rawLink = cleanLink(input.rawLink)
    if (!looksLikeUrl(rawLink)) return { success: false, error: 'Link raw không hợp lệ (phải bắt đầu bằng http/https).' }
    const brollLink = input.brollLink ? cleanLink(input.brollLink) : ''
    if (brollLink && !looksLikeUrl(brollLink)) return { success: false, error: 'Link b-roll không hợp lệ.' }
    const notes = input.notes ? sanitizeClientText(input.notes, FEEDBACK_MAX_LEN) : ''

    // Encode to the format the admin TaskDetailModal parses (split('|') → RAW:/BROLL:).
    const resources = `RAW: ${rawLink}` + (brollLink ? ` | BROLL: ${brollLink}` : '')

    let task: { id: string; title: string }
    try {
        task = await prisma.task.create({
            data: {
                title,
                resources,
                notes_vi: notes || null,
                clientId: input.clientId,
                workspaceId: input.workspaceId,
                profileId: scope.profileId,           // from scope, never client input
                status: 'Đang đợi giao',              // unassigned pool, admin triages
                assigneeId: null,
                assignedById: null,
                type: 'Khách gửi',                    // distinct label → admin spots client submissions
                version: 0,
                isArchived: false,
            },
            select: { id: true, title: true },
        })
    } catch (err) {
        console.error('[createTaskViaToken] create failed', err)
        return { success: false, error: 'Không tạo được task. Vui lòng thử lại.' }
    }

    await notifyProfileAdmins(
        scope.profileId,
        'Khách gửi yêu cầu mới',
        `Khách hàng "${scope.clientName}" vừa gửi task: "${title}"`,
        task.id,
    )

    void audit({
        workspaceId: input.workspaceId, actorUserId: null, action: 'task.client_submitted',
        targetType: 'Task', targetId: task.id,
        after: { title, clientId: input.clientId, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    try {
        revalidatePath(`/${input.workspaceId}/admin`)
        revalidatePath(`/${input.workspaceId}/admin/queue`)
        revalidatePath(`/${input.workspaceId}/dashboard`)
    } catch { /* best-effort */ }

    return { success: true, taskId: task.id }
}

/* ───────────────────────────────────────────────────────────────────────────
   Client Task Submission v2 — request INTAKE (ClientTaskRequest) + sub-brand
   creation. Supersedes the v1 direct-to-Task path above: the portal wizard now
   calls submitClientRequestViaToken, which creates a NEW ClientTaskRequest and
   emails every profile OWNER/ADMIN. An admin later accepts it into a real Task
   from the "Hộp thư yêu cầu" inbox. createTaskViaToken is retained but unused.
   ─────────────────────────────────────────────────────────────────────────── */

const DESIRED_TYPES = new Set(['Short form', 'Long form', 'Trial'])
/** Max ACTIVE sub-brands a client may create under one parent via the portal. */
const SUBCLIENT_CAP = 20

/**
 * Realtime + bespoke-VN-email fan-out to every profile OWNER/ADMIN about a fresh
 * client request. Uses the TASK_CLIENT_SUBMITTED type so the notification email
 * pipeline picks the taskClientSubmitted template (all data via metadata — no
 * Task exists yet).
 */
async function notifyProfileAdminsOfRequest(
    scope: NonNullable<Awaited<ReturnType<typeof resolveShareToken>>>,
    req: { id: string; title: string; workspaceId: string; rawFootage: string | null; notes: string | null },
    monthLabel: string | null,
) {
    try {
        const admins = await prisma.profileAccess.findMany({
            where: { profileId: scope.profileId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { userId: true },
        })
        const body = `Khách hàng "${scope.clientName}" vừa gửi yêu cầu: "${req.title}"`
        for (const { userId } of admins) {
            try {
                const notif = await createNotificationInternal({
                    userId,
                    type: 'TASK_CLIENT_SUBMITTED',
                    title: 'Yêu cầu mới từ khách hàng',
                    body,
                    metadata: {
                        brand: scope.clientName,
                        projectTitle: req.title,
                        monthLabel,
                        rawLink: req.rawFootage,
                        clientNotes: req.notes,
                        requestId: req.id,
                        inboxWorkspaceId: req.workspaceId,
                    },
                })
                void broadcastNotificationToUser(userId, {
                    id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                    taskId: null, createdAt: notif.createdAt, isRead: false,
                })
            } catch (e) {
                console.error('[share-portal] notifyProfileAdminsOfRequest one failed', e)
            }
        }
    } catch (e) {
        console.error('[share-portal] notifyProfileAdminsOfRequest query failed', e)
    }
}

export interface SubmitClientRequestInput {
    workspaceId: string
    clientId: number
    title: string
    videoList?: string
    desiredType?: string
    desiredDeadline?: string
    rawFootage: string
    collectFile?: string
    bRoll?: string
    references?: string
    submitFolder?: string
    script?: string
    notes?: string
}

/**
 * Client submits a work request from the portal wizard. Token-authed (no
 * session); every id is re-validated against the link's scope. Creates a
 * ClientTaskRequest (status NEW) — NOT a Task — and notifies profile admins.
 * Carries no finance/assignee/frame fields (leak discipline).
 */
export async function submitClientRequestViaToken(token: string, input: SubmitClientRequestInput) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }

    const rl = await rateLimit(`client-submit-request:${scope.shareLinkId}`, 20, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Too many requests. Please try again later.' }

    // Fail-closed scope checks — client cannot inject another profile's ids.
    if (!input || typeof input.workspaceId !== 'string' || typeof input.clientId !== 'number') {
        return { success: false, error: 'Missing information.' }
    }
    if (!scope.workspaceIds.includes(input.workspaceId)) return { success: false, error: 'Invalid period.' }
    if (!scope.clientIds.includes(input.clientId)) return { success: false, error: 'Invalid brand.' }

    const ws = await prisma.workspace.findFirst({
        where: { id: input.workspaceId, status: 'ACTIVE' },
        select: { id: true, name: true },
    })
    if (!ws) return { success: false, error: 'This period is no longer active.' }

    // Validate + sanitize.
    const title = sanitizeClientText(input.title || '', TITLE_MAX_LEN)
    if (!title) return { success: false, error: 'Please enter a project / video name.' }

    const rawFootage = cleanLink(input.rawFootage)
    if (!looksLikeUrl(rawFootage)) return { success: false, error: 'The raw footage link is invalid (must start with http/https).' }

    // Optional links — validate only when provided.
    const optLink = (v: string | undefined, label: string):
        | { ok: true; val: string | null }
        | { ok: false; error: string } => {
        if (!v || !v.trim()) return { ok: true, val: null }
        const c = cleanLink(v)
        if (!looksLikeUrl(c)) return { ok: false, error: `The ${label} link is invalid.` }
        return { ok: true, val: c }
    }
    const collect = optLink(input.collectFile, 'collect files')
    if (!collect.ok) return { success: false, error: collect.error }
    const broll = optLink(input.bRoll, 'b-roll')
    if (!broll.ok) return { success: false, error: broll.error }
    const refs = optLink(input.references, 'reference')
    if (!refs.ok) return { success: false, error: refs.error }
    const submit = optLink(input.submitFolder, 'submission folder')
    if (!submit.ok) return { success: false, error: submit.error }
    const scriptL = optLink(input.script, 'script')
    if (!scriptL.ok) return { success: false, error: scriptL.error }

    const videoList = input.videoList ? sanitizeClientText(input.videoList, FEEDBACK_MAX_LEN) : null
    const notes = input.notes ? sanitizeClientText(input.notes, FEEDBACK_MAX_LEN) : null
    const desiredType = input.desiredType && DESIRED_TYPES.has(input.desiredType) ? input.desiredType : null
    let desiredDeadline: Date | null = null
    if (input.desiredDeadline) {
        const d = new Date(input.desiredDeadline)
        if (!isNaN(d.getTime())) desiredDeadline = d
    }

    let req: { id: string }
    try {
        req = await prisma.clientTaskRequest.create({
            data: {
                profileId: scope.profileId,          // from scope, never client input
                workspaceId: input.workspaceId,
                clientId: input.clientId,
                viaShareLinkId: scope.shareLinkId,
                submittedVia: 'SHARE_LINK',
                title,
                videoList,
                desiredType,
                desiredDeadline,
                rawFootage,
                collectFile: collect.val,
                bRoll: broll.val,
                refs: refs.val,
                submitFolder: submit.val,
                script: scriptL.val,
                notes,
                status: 'NEW',
            },
            select: { id: true },
        })
    } catch (err) {
        console.error('[submitClientRequestViaToken] create failed', err)
        return { success: false, error: 'Could not send your request. Please try again.' }
    }

    await notifyProfileAdminsOfRequest(
        scope,
        { id: req.id, title, workspaceId: input.workspaceId, rawFootage, notes },
        ws.name,
    )

    void audit({
        workspaceId: input.workspaceId, actorUserId: null, action: 'request.client_submitted',
        targetType: 'ClientTaskRequest', targetId: req.id,
        after: { title, clientId: input.clientId, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    try {
        revalidatePath(`/${input.workspaceId}/admin/requests`)
    } catch { /* best-effort */ }

    return { success: true, requestId: req.id }
}

/**
 * Client creates a sub-brand (child client) under an in-scope parent brand.
 * Token-authed; parent must be in scope; profileId forced from scope. The new
 * brand auto-enters the link's scope via name-path resolution on the next
 * resolveShareToken (no extra wiring). Rate-limited tighter than requests.
 */
export async function createSubClientViaToken(token: string, input: { name: string; parentId: number }) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }

    const rl = await rateLimit(`client-create-subclient:${scope.shareLinkId}`, 10, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Too many requests. Please try again later.' }

    if (!input || typeof input.parentId !== 'number') return { success: false, error: 'Missing information.' }
    if (!scope.clientIds.includes(input.parentId)) return { success: false, error: 'Invalid parent brand.' }

    const name = sanitizeClientText(input.name || '', TITLE_MAX_LEN)
    if (!name) return { success: false, error: 'Please enter a brand name.' }

    // Parent must belong to the link's profile (defense-in-depth beyond scope).
    const parent = await prisma.client.findFirst({
        where: { id: input.parentId, profileId: scope.profileId, status: 'ACTIVE' },
        select: { id: true },
    })
    if (!parent) return { success: false, error: 'Invalid parent brand.' }

    const existing = await prisma.client.count({
        where: { parentId: input.parentId, status: 'ACTIVE' },
    })
    if (existing >= SUBCLIENT_CAP) return { success: false, error: 'You have reached the maximum number of sub-brands.' }

    let client: { id: number; name: string }
    try {
        client = await prisma.client.create({
            data: {
                name,
                parentId: input.parentId,
                profileId: scope.profileId,   // forced from scope, never client input
                status: 'ACTIVE',
            },
            select: { id: true, name: true },
        })
    } catch (err) {
        console.error('[createSubClientViaToken] create failed', err)
        return { success: false, error: 'Could not create the brand. Please try again.' }
    }

    void audit({
        workspaceId: null, actorUserId: null, action: 'client.created_via_share_link',
        targetType: 'Client', targetId: String(client.id),
        after: { name, parentId: input.parentId, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    return { success: true, clientId: client.id, name: client.name }
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

    // [Trial P0 — isolation fix] NEVER surface a staff member's real name to the
    // client. Any staff-actor row is shown as a generic label; only the client's
    // own link-driven rows (actorUserId=null) are "You". (Previously leaked the
    // editor/admin nickname here, breaking the "client never knows the editor" rule.)
    return rows.map(r => ({
        label: ACTIVITY_LABELS[r.action] || r.action,
        who: r.actorUserId ? 'Nhóm biên tập' : 'You',
        date: r.createdAt.toISOString(),
    }))
}

/* ───────────────────────────────────────────────────────────────────────────
   [Trial P1] Task comments — the client side of the ClickUp-style feed. The
   client sees ONLY visibility=CLIENT comments (hard-filtered here) merged with
   client-safe activity; anything they post is forced to CLIENT visibility. Staff
   identity is never surfaced (author shows as "The team").
   ─────────────────────────────────────────────────────────────────────────── */

export interface ClientFeedItem {
    kind: 'comment' | 'event'
    id: string
    authorName: string
    body?: string
    label?: string
    createdAt: string
    isMine?: boolean
    /** [P3] null = top-level; else the parent comment id (reply threads). */
    parentId?: string | null
    /** [P3] Aggregated emoji reactions (mine = this share link reacted). */
    reactions?: { emoji: string; count: number; mine: boolean }[]
}

export async function getCommentFeedViaToken(token: string, taskId: string): Promise<ClientFeedItem[]> {
    const { scope, task } = await findScopedTask(token, taskId, { id: true })
    if (!scope || !task) return []

    const [comments, auditRows] = await Promise.all([
        prisma.taskComment.findMany({
            where: { taskId, visibility: 'CLIENT', isDeleted: false },
            orderBy: { createdAt: 'asc' },
            select: { id: true, authorType: true, body: true, createdAt: true, parentId: true },
        }),
        prisma.auditLog.findMany({
            where: { targetType: 'Task', targetId: taskId, action: { in: Object.keys(ACTIVITY_LABELS) } },
            orderBy: { createdAt: 'asc' }, take: 30,
        }),
    ])

    // [P3] Reactions on the CLIENT-visible comments only; mine = this share link.
    const commentIds = comments.map(c => c.id)
    const reactionRows = commentIds.length
        ? await prisma.taskCommentReaction.findMany({ where: { commentId: { in: commentIds } }, select: { commentId: true, emoji: true, viaShareLinkId: true } })
        : []
    const reactionsByComment = new Map<string, { emoji: string; count: number; mine: boolean }[]>()
    for (const r of reactionRows) {
        const arr = reactionsByComment.get(r.commentId) || []
        const existing = arr.find(a => a.emoji === r.emoji)
        if (existing) { existing.count++; if (r.viaShareLinkId === scope.shareLinkId) existing.mine = true }
        else arr.push({ emoji: r.emoji, count: 1, mine: r.viaShareLinkId === scope.shareLinkId })
        reactionsByComment.set(r.commentId, arr)
    }

    const commentItems: ClientFeedItem[] = comments.map(c => ({
        kind: 'comment',
        id: c.id,
        // Never reveal a staff name to the client; their own posts read as "You".
        authorName: c.authorType === 'CLIENT' ? 'You' : 'The team',
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        isMine: c.authorType === 'CLIENT',
        parentId: c.parentId ?? null,
        reactions: reactionsByComment.get(c.id) || [],
    }))
    const eventItems: ClientFeedItem[] = auditRows.map(r => ({
        kind: 'event',
        id: `evt-${r.id}`,
        authorName: r.actorUserId ? 'The team' : 'You',
        label: ACTIVITY_LABELS[r.action] || r.action,
        createdAt: r.createdAt.toISOString(),
    }))

    return [...commentItems, ...eventItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function postCommentViaToken(token: string, taskId: string, body: string, parentId?: string | null) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }

    const rl = await rateLimit(`client-comment:${scope.shareLinkId}`, 30, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Too many messages. Please try again later.' }

    const { task } = await findScopedTask(token, taskId, { id: true, clientId: true, workspaceId: true, assignedById: true, title: true })
    if (!task) return { success: false, error: 'This link is invalid or the item no longer exists.' }

    const clean = sanitizeClientText(body || '', FEEDBACK_MAX_LEN)
    if (!clean) return { success: false, error: 'Please write a message.' }

    // [P3] Reply: the parent must be a live CLIENT-visible comment on THIS task
    // (a client can never reply to — or even see — an internal note).
    let safeParentId: string | null = null
    if (parentId) {
        const parent = await prisma.taskComment.findFirst({
            where: { id: parentId, taskId, isDeleted: false, visibility: 'CLIENT' },
            select: { id: true },
        })
        if (!parent) return { success: false, error: 'The comment you replied to no longer exists.' }
        safeParentId = parent.id
    }

    let created: { id: string; createdAt: Date }
    try {
        created = await prisma.taskComment.create({
            data: {
                taskId,
                authorType: 'CLIENT',
                visibility: 'CLIENT',        // forced — a client can never post an internal note
                body: clean,
                viaShareLinkId: scope.shareLinkId,
                clientId: task.clientId ?? null,
                mentions: [],
                parentId: safeParentId,
            },
            select: { id: true, createdAt: true },
        })
    } catch (err) {
        console.error('[postCommentViaToken] create failed', err)
        return { success: false, error: 'Could not post your comment. Please try again.' }
    }

    // Notify the task's Manager (assignedById) that the client commented.
    if (task.assignedById) {
        try {
            const n = await createNotificationInternal({
                userId: task.assignedById, type: 'TASK_COMMENT', title: 'Khách hàng bình luận',
                body: `Khách hàng "${scope.clientName}" bình luận trong "${task.title}": ${clean.slice(0, 140)}`,
                taskId, metadata: { taskTitle: task.title, preview: clean.slice(0, 200) },
            })
            void broadcastNotificationToUser(task.assignedById, {
                id: n.id, type: n.type, title: n.title, body: n.body, taskId, createdAt: n.createdAt, isRead: false,
            })
        } catch (e) { console.error('[postCommentViaToken] notify manager failed', e) }
    }

    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'task.comment_added',
        targetType: 'Task', targetId: taskId,
        after: { via: 'share_link', viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    return { success: true, id: created.id, createdAt: created.createdAt.toISOString() }
}

/**
 * [P3] Toggle the client's emoji reaction on a CLIENT-visible comment. Keyed by
 * the share link (anonymous). Re-resolves scope + confirms the comment belongs
 * to a task in scope AND is CLIENT-visible (never lets a token touch an internal
 * note). Lightly rate-limited.
 */
export async function toggleReactionViaToken(token: string, commentId: string, emoji: string) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }
    if (!isValidReaction(emoji)) return { success: false, error: 'Unsupported reaction.' }

    const rl = await rateLimit(`client-react:${scope.shareLinkId}`, 120, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Too many actions. Please try again later.' }

    const comment = await prisma.taskComment.findFirst({
        where: { id: commentId, isDeleted: false, visibility: 'CLIENT' },
        select: { id: true, taskId: true },
    })
    if (!comment) return { success: false, error: 'This comment no longer exists.' }

    // Confirm the comment's task is inside this token's scope.
    const { task } = await findScopedTask(token, comment.taskId, { id: true })
    if (!task) return { success: false, error: 'This link is invalid.' }

    const existing = await prisma.taskCommentReaction.findFirst({
        where: { commentId, emoji, viaShareLinkId: scope.shareLinkId },
        select: { id: true },
    })
    if (existing) {
        await prisma.taskCommentReaction.delete({ where: { id: existing.id } })
        return { success: true, reacted: false }
    }
    await prisma.taskCommentReaction.create({ data: { commentId, emoji, viaShareLinkId: scope.shareLinkId } })
    return { success: true, reacted: true }
}
