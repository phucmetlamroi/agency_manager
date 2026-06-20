'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'

// [AUDIT R2 — fix] Removed `isWorkspaceMemberOrInScope`: its fallback queried the
// GLOBAL User model (workspacePrisma.user.findUnique), so it returned true for ANY
// authenticated user — leaking marketplace tasks (wageVND + client names) across
// tenants. All call sites now use the real `verifyWorkspaceAccess` gate, which
// throws SECURITY_VIOLATION for non-members (same as claimTask already did).

// ─── Get marketplace open/close status ────────────────────────
export async function getMarketplaceStatus(workspaceId: string) {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { marketplaceOpen: true }
    })
    return workspace?.marketplaceOpen ?? true
}

// ─── Toggle marketplace open/close (Admin only) ──────────────
export async function toggleMarketplace(workspaceId: string) {
    // [Sprint C] Use verifyWorkspaceAccess để chấp nhận: global ADMIN, profile
    // admin (auto-MEMBER + globalAdmin escalation), workspace ADMIN/OWNER.
    // Trước đây hardcode `WorkspaceMember.role IN ['ADMIN','AGENCY_ADMIN']`
    // → profile admin không có WorkspaceMember explicit row sẽ bị block.
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Chỉ admin mới có quyền đóng/mở phiên chợ' }
        }
        throw e
    }

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { marketplaceOpen: true }
    })
    if (!workspace) return { error: 'Workspace không tồn tại' }

    const newStatus = !workspace.marketplaceOpen
    await prisma.workspace.update({
        where: { id: workspaceId },
        data: { marketplaceOpen: newStatus }
    })

    revalidatePath(`/${workspaceId}/admin/queue`)
    revalidatePath(`/${workspaceId}/dashboard`)

    return { success: true, marketplaceOpen: newStatus }
}

// ─── Get unassigned tasks for marketplace ─────────────────────
export async function getMarketplaceTasks(workspaceId: string) {
    // [AUDIT R2 — fix] Real workspace-membership gate (was the broken shim).
    try {
        await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Forbidden: Not a member of this workspace', tasks: [], marketplaceOpen: true }
        }
        throw e
    }

    // Check if marketplace is open
    const isOpen = await getMarketplaceStatus(workspaceId)
    if (!isOpen) {
        return { tasks: [], marketplaceOpen: false }
    }

    const workspacePrisma = getWorkspacePrisma(workspaceId)

    const tasks = await workspacePrisma.task.findMany({
        where: {
            assigneeId: null,
            isArchived: false,
        },
        include: {
            client: {
                include: { parent: { select: { name: true } } }
            },
            taskTags: {
                include: { tagCategory: { select: { id: true, name: true } } }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    })

    // Serialize Decimal fields
    const serialized = tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        status: t.status,
        deadline: t.deadline?.toISOString() || null,
        value: Number(t.value || 0),
        wageVND: Number(t.wageVND || 0),
        // [Security P0] jobPriceUSD (agency revenue) MUST NOT leak to non-admin staff.
        // The marketplace is editor-facing — they only need their wage (value/wageVND).
        // Do NOT add jobPriceUSD/exchangeRate/profitVND to this payload.
        duration: t.duration,
        client: t.client ? {
            name: t.client.name,
            parent: t.client.parent?.name || null
        } : null,
        tags: t.taskTags?.map((tt: any) => tt.tagCategory) || [],
        createdAt: t.createdAt.toISOString()
    }))

    return { tasks: serialized, marketplaceOpen: true }
}

// ─── Claim a task from marketplace ────────────────────────────
export async function claimTask(taskId: string, workspaceId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }

    // [Sprint K P1] Marketplace open check moved INSIDE transaction (line ~150)
    // to close TOCTOU window. Trước đây check ngoài → admin có thể đóng giữa
    // lúc check và lúc claim, user vẫn claim được.

    // SECURITY FIX: trước đây gọi `verifyWorkspaceAccess(userId, workspaceId)` —
    // sai args (signature là (workspaceId, requiredRole)). Code path này thực tế
    // không pass do throw error → bug từ lâu nhưng không user nào claim được.
    // Fix: gọi đúng + extract userId từ kết quả.
    let userId: string
    try {
        const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        userId = access.userId
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Bạn không phải member của workspace này.' }
        }
        throw e
    }

    const workspacePrisma = getWorkspacePrisma(workspaceId)

    // Use transaction with optimistic locking to prevent race conditions
    try {
        const result = await (workspacePrisma as any).$transaction(async (tx: any) => {
            // [Sprint K P1] Atomic marketplace open check inside transaction.
            const ws = await tx.workspace.findUnique({
                where: { id: workspaceId },
                select: { marketplaceOpen: true },
            })
            if (!ws?.marketplaceOpen) {
                throw new Error('Phiên chợ hiện đang đóng. Vui lòng chờ admin mở.')
            }

            // Fetch task with current version
            const task = await tx.task.findUnique({
                where: { id: taskId },
                select: { id: true, assigneeId: true, status: true, version: true, isArchived: true }
            })

            if (!task) throw new Error('Task không tồn tại')
            if (task.isArchived) throw new Error('Task đã bị lưu trữ')
            if (task.assigneeId) throw new Error('Task đã được nhận bởi người khác')
            if (task.status !== '\u0110ang \u0111\u1ee3i giao') {
                throw new Error('Task không ở trạng thái chờ giao')
            }

            // Atomic update with version check
            const updated = await tx.task.updateMany({
                where: {
                    id: taskId,
                    version: task.version,
                    assigneeId: null
                },
                data: {
                    assigneeId: userId,
                    status: 'Nh\u1eadn task', // "Nhận task"
                    claimSource: 'MARKET',
                    claimedAt: new Date(),
                    isPenalized: false,
                    version: { increment: 1 }
                }
            })

            if (updated.count === 0) {
                throw new Error('Task đã được nhận bởi người khác (race condition)')
            }

            return { success: true }
        })

        // Revalidate paths
        const paths = [`/${workspaceId}/admin`, `/${workspaceId}/dashboard`, `/${workspaceId}/admin/queue`]
        paths.forEach(p => revalidatePath(p))

        return result
    } catch (e: any) {
        return { error: e.message || 'Không thể nhận task' }
    }
}

// ─── Return a claimed task (within 10 minutes) ───────────────
export async function returnTask(taskId: string, workspaceId: string) {
    // [AUDIT R2 — fix] Real workspace-membership gate (was the broken shim).
    let userId: string
    try {
        const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        userId = access.userId
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Forbidden: Not a member of this workspace' }
        }
        throw e
    }

    const workspacePrisma = getWorkspacePrisma(workspaceId)

    const task = await workspacePrisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, assigneeId: true, claimSource: true, claimedAt: true }
    })

    if (!task) return { error: 'Task không tồn tại' }
    if (task.assigneeId !== userId) return { error: 'Bạn không phải người nhận task này' }
    if (task.claimSource !== 'MARKET') return { error: 'Chỉ có thể hoàn task nhận từ Phiên chợ' }

    // Server-side 10-minute check (source of truth)
    if (!task.claimedAt) return { error: 'Không có thông tin thời gian nhận task' }
    const minutesSinceClaim = (Date.now() - new Date(task.claimedAt).getTime()) / (1000 * 60)
    if (minutesSinceClaim > 10) {
        return { error: 'Đã quá 10 phút, không thể hoàn task' }
    }

    await workspacePrisma.task.update({
        where: { id: taskId },
        data: {
            assigneeId: null,
            status: '\u0110ang \u0111\u1ee3i giao', // "Đang đợi giao"
            claimSource: 'ADMIN', // Reset to default
            claimedAt: null,
            isPenalized: false
            // Note: deadline is preserved intentionally
        }
    })

    const paths = [`/${workspaceId}/admin`, `/${workspaceId}/dashboard`, `/${workspaceId}/admin/queue`]
    paths.forEach(p => revalidatePath(p))

    return { success: true }
}
