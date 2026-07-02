'use server'

/**
 * [Client Task Submission v2] Admin-side (session-gated) actions for the
 * "Hộp thư yêu cầu" (Client Requests Inbox). Every entry point verifies
 * profile-admin access to the workspace, then scopes strictly by
 * workspaceId + profileId. Accepting a request spawns a real Task and links it
 * back; rejecting keeps the note for the trail.
 */

import { prisma } from '@/lib/db'
import { verifyProfileAdminAccess } from '@/lib/security'
import { sanitizeClientText, FEEDBACK_MAX_LEN } from '@/lib/sanitize'
import { audit } from '@/lib/audit-log'
import { revalidatePath } from 'next/cache'

/** Verify admin + resolve the authoritative (userId, profileId) for this workspace. */
async function adminCtx(workspaceId: string): Promise<{ userId: string; profileId: string | null }> {
    const access = await verifyProfileAdminAccess(workspaceId) // throws if not OWNER/ADMIN
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    const profileId = ws?.profileId ?? ((access.session.user as any).sessionProfileId as string | undefined) ?? null
    return { userId: access.userId, profileId }
}

export interface ClientRequestDTO {
    id: string
    title: string
    status: string
    submittedVia: string
    videoList: string | null
    desiredType: string | null
    desiredDeadline: string | null
    rawFootage: string | null
    collectFile: string | null
    bRoll: string | null
    refs: string | null
    submitFolder: string | null
    script: string | null
    notes: string | null
    rejectionNote: string | null
    taskId: string | null
    createdAt: string
    clientId: number | null
    clientName: string | null
}

/** List requests for a workspace's inbox. Defaults to the open queue (NEW + REVIEWING). */
export async function getClientRequests(workspaceId: string, opts?: { includeResolved?: boolean }): Promise<ClientRequestDTO[]> {
    const { profileId } = await adminCtx(workspaceId)
    if (!profileId) return []
    const rows = await prisma.clientTaskRequest.findMany({
        where: {
            workspaceId, profileId,
            ...(opts?.includeResolved ? {} : { status: { in: ['NEW', 'REVIEWING'] } }),
        },
        orderBy: { createdAt: 'desc' },
        include: { client: { select: { id: true, name: true, parent: { select: { name: true } } } } },
    })
    return rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        submittedVia: r.submittedVia,
        videoList: r.videoList,
        desiredType: r.desiredType,
        desiredDeadline: r.desiredDeadline ? r.desiredDeadline.toISOString() : null,
        rawFootage: r.rawFootage,
        collectFile: r.collectFile,
        bRoll: r.bRoll,
        refs: r.refs,
        submitFolder: r.submitFolder,
        script: r.script,
        notes: r.notes,
        rejectionNote: r.rejectionNote,
        taskId: r.taskId,
        createdAt: r.createdAt.toISOString(),
        clientId: r.clientId,
        clientName: r.client
            ? r.client.parent
                ? `${r.client.parent.name} / ${r.client.name}`
                : r.client.name
            : null,
    }))
}

/** Count NEW (unhandled) requests for the sidebar badge. Fail-soft to 0. */
export async function getUnreadRequestCount(workspaceId: string): Promise<number> {
    try {
        const { profileId } = await adminCtx(workspaceId)
        if (!profileId) return 0
        return await prisma.clientTaskRequest.count({ where: { workspaceId, profileId, status: 'NEW' } })
    } catch {
        return 0
    }
}

/**
 * Accept a request → spawn a Task (unassigned, lands in "Kho Task Đợi") and mark
 * the request ACCEPTED with a pointer to the new task. The client's six links are
 * encoded into the pipe format the admin TaskDetailModal already parses.
 */
export async function acceptClientRequest(requestId: string, workspaceId: string) {
    const { userId, profileId } = await adminCtx(workspaceId)
    if (!profileId) return { success: false, error: 'Không xác định được hồ sơ.' }

    const req = await prisma.clientTaskRequest.findFirst({ where: { id: requestId, workspaceId, profileId } })
    if (!req) return { success: false, error: 'Không tìm thấy yêu cầu.' }
    if (req.status === 'ACCEPTED') return { success: false, error: 'Yêu cầu này đã được duyệt.' }

    const resources = [
        req.rawFootage ? `RAW: ${req.rawFootage}` : '',
        req.bRoll ? `BROLL: ${req.bRoll}` : '',
        req.submitFolder ? `SUBMISSION: ${req.submitFolder}` : '',
    ].filter(Boolean).join(' | ')
    const references = [
        req.refs ? `REF: ${req.refs}` : '',
        req.script ? `SCRIPT: ${req.script}` : '',
    ].filter(Boolean).join(' | ')
    const noteParts = [req.notes || '', req.videoList ? `Videos:\n${req.videoList}` : ''].filter(Boolean)
    const notes_vi = noteParts.length ? noteParts.join('\n\n') : null

    let task: { id: string }
    try {
        task = await prisma.task.create({
            data: {
                title: req.title,
                type: req.desiredType || 'Short form',
                status: 'Đang đợi giao',
                assigneeId: null,
                assignedById: userId,
                clientId: req.clientId,
                workspaceId,
                profileId,
                resources: resources || null,
                references: references || null,
                collectFilesLink: req.collectFile,
                submissionFolder: req.submitFolder,
                deadline: req.desiredDeadline,
                notes_vi,
                version: 0,
                isArchived: false,
            },
            select: { id: true },
        })
    } catch (err) {
        console.error('[acceptClientRequest] task create failed', err)
        return { success: false, error: 'Không tạo được task từ yêu cầu.' }
    }

    await prisma.clientTaskRequest.update({
        where: { id: requestId },
        data: { status: 'ACCEPTED', taskId: task.id, reviewedById: userId, reviewedAt: new Date() },
    })

    void audit({
        workspaceId, actorUserId: userId, action: 'request.accepted',
        targetType: 'ClientTaskRequest', targetId: requestId,
        after: { taskId: task.id, title: req.title },
    })

    try {
        revalidatePath(`/${workspaceId}/admin/requests`)
        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/admin`)
    } catch { /* best-effort */ }

    return { success: true, taskId: task.id }
}

/** Reject a request with an optional note. */
export async function rejectClientRequest(requestId: string, workspaceId: string, note?: string) {
    const { userId, profileId } = await adminCtx(workspaceId)
    if (!profileId) return { success: false, error: 'Không xác định được hồ sơ.' }

    const req = await prisma.clientTaskRequest.findFirst({ where: { id: requestId, workspaceId, profileId }, select: { id: true, status: true } })
    if (!req) return { success: false, error: 'Không tìm thấy yêu cầu.' }
    if (req.status === 'ACCEPTED') return { success: false, error: 'Yêu cầu đã được duyệt, không thể từ chối.' }

    const clean = note ? sanitizeClientText(note, FEEDBACK_MAX_LEN) : null
    await prisma.clientTaskRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', rejectionNote: clean, reviewedById: userId, reviewedAt: new Date() },
    })

    void audit({
        workspaceId, actorUserId: userId, action: 'request.rejected',
        targetType: 'ClientTaskRequest', targetId: requestId,
        after: { note: clean },
    })

    try { revalidatePath(`/${workspaceId}/admin/requests`) } catch { /* best-effort */ }
    return { success: true }
}

/**
 * Mark a request ACCEPTED WITHOUT creating a Task — used by the "Quét bằng Velox"
 * flow, which creates the task(s) itself (often N tasks from one request, so no
 * single taskId to link). No-op if already ACCEPTED.
 */
export async function markRequestAccepted(requestId: string, workspaceId: string) {
    const { userId, profileId } = await adminCtx(workspaceId)
    if (!profileId) return { success: false, error: 'Không xác định được hồ sơ.' }

    const req = await prisma.clientTaskRequest.findFirst({ where: { id: requestId, workspaceId, profileId }, select: { id: true, status: true } })
    if (!req) return { success: false, error: 'Không tìm thấy yêu cầu.' }
    if (req.status === 'ACCEPTED') return { success: true }

    await prisma.clientTaskRequest.update({
        where: { id: requestId },
        data: { status: 'ACCEPTED', reviewedById: userId, reviewedAt: new Date() },
    })

    void audit({
        workspaceId, actorUserId: userId, action: 'request.accepted',
        targetType: 'ClientTaskRequest', targetId: requestId,
        after: { via: 'velox' },
    })

    try { revalidatePath(`/${workspaceId}/admin/requests`) } catch { /* best-effort */ }
    return { success: true }
}
