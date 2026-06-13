'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { serializeDecimal } from '@/lib/serialization'
import { audit } from '@/lib/audit-log'

// --- CLIENT ACTIONS ---

export async function getClients(workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        // [Canonical Clients] The client LIST is profile-wide now (every
        // workspace sees the same canonical clients), but the task/project
        // counts shown on each card stay scoped to THIS workspace — data
        // isolation per workspace is unchanged. Relation includes don't go
        // through the middleware, so the workspaceId filter is explicit.
        const clients = await workspacePrisma.client.findMany({
            // status: 'ACTIVE' excludes both SOFT_DELETED (Trash) and MERGED
            // (absorbed duplicates from the canonical migration).
            where: { parentId: null, status: 'ACTIVE' },
            include: {
                subsidiaries: {
                    where: { status: 'ACTIVE' },
                    include: {
                        projects: { where: { workspaceId } },
                        tasks: { where: { workspaceId } }
                    }
                },
                projects: { where: { workspaceId } },
                tasks: { where: { workspaceId } }
            },
            orderBy: { createdAt: 'desc' }
        })
        return { success: true, data: clients }
    } catch (error) {
        console.error('Failed to fetch clients:', error)
        return { success: false, error: 'Failed to fetch clients' }
    }
}

/**
 * [Canonical Clients] App-level duplicate guard — one ACTIVE client per
 * (profile, parent, normalized name). Backstops the partial unique index
 * (client_profile_path_unique) during the window before it's applied, and
 * turns the DB error into a friendly Vietnamese message after.
 */
async function findDuplicateName(
    wp: any,
    name: string,
    parentId: number | null,
    excludeId?: number,
): Promise<boolean> {
    const siblings: { id: number; name: string }[] = await wp.client.findMany({
        where: { parentId, status: 'ACTIVE' },
        select: { id: true, name: true },
    })
    // NFC + trim + lowercase — IDENTICAL to clientPathKey (src/lib/client-dedupe)
    // so the create/rename guard rejects exactly what the picker would collapse.
    // Without NFC, two visually-identical Vietnamese names with different Unicode
    // encodings slip the guard and re-create the very duplicate this prevents.
    const norm = (s: string) => (s ?? '').normalize('NFC').trim().toLowerCase()
    const normalized = norm(name)
    return siblings.some((s) => s.id !== excludeId && norm(s.name) === normalized)
}


export async function createClient(data: { name: string, parentId?: number }, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        const parentId = data.parentId || null
        if (await findDuplicateName(workspacePrisma, data.name, parentId)) {
            return { success: false, error: `Khách hàng "${data.name.trim()}" đã tồn tại trong profile — clients giờ dùng chung cho mọi workspace, không cần tạo lại.` }
        }
        await workspacePrisma.client.create({
            data: {
                name: data.name,
                parentId
            }
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create client' }
    }
}

export async function updateClient(id: number, data: { name: string }, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        // Dup-guard on rename: same normalized name under the same parent.
        const current = await workspacePrisma.client.findUnique({ where: { id }, select: { parentId: true } })
        if (current && await findDuplicateName(workspacePrisma, data.name, current.parentId, id)) {
            return { success: false, error: `Khách hàng "${data.name.trim()}" đã tồn tại trong profile.` }
        }
        await workspacePrisma.client.update({
            where: { id },
            data: { name: data.name }
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to update client' }
    }
}

// --- PROJECT ACTIONS ---

export async function createProject(data: { name: string, clientId: number, code?: string }, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        await workspacePrisma.project.create({
            data: {
                name: data.name,
                clientId: data.clientId,
                code: data.code
            }
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create project' }
    }
}

// [Sprint A removed] FEEDBACK ACTIONS — Feedback model + ManagerReviewChecklist
// đã bỏ. Caller cũ (UI) đã được cleanup. Giữ stub để tránh runtime crash nếu
// còn caller chưa biết.
export async function createFeedback(_data: any, _workspaceId: string) {
    return { success: false, error: 'Feature removed: feedback system was simplified out of the workflow.' }
}

// --- SOFT-DELETE / TRASH / RESTORE ---

/**
 * [Soft-delete] Collect a client's full descendant subtree (root + all
 * subsidiaries, bounded depth) so soft-delete / restore cascade the whole tree
 * the way the old hard-delete cascade did — but reversibly. Status is NOT
 * filtered here, so it works for soft-delete (children ACTIVE) AND restore
 * (children SOFT_DELETED). Uses the workspace-scoped client.
 */
async function collectClientSubtreeIds(wp: any, rootId: number): Promise<number[]> {
    const all = new Set<number>([rootId])
    let frontier: number[] = [rootId]
    let guard = 0
    while (frontier.length > 0 && guard < 8) {
        const children: { id: number }[] = await wp.client.findMany({
            where: { parentId: { in: frontier } },
            select: { id: true },
        })
        const next: number[] = []
        for (const c of children) {
            if (!all.has(c.id)) { all.add(c.id); next.push(c.id) }
        }
        frontier = next
        guard++
    }
    return Array.from(all)
}

/**
 * Soft-delete a client → move it (and its subsidiary subtree) to the Trash.
 * Reversible via restoreClient. Tasks/Invoices stay intact (the row survives),
 * just hidden from the active CRM lists/pickers.
 */
export async function deleteClient(id: number, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const wp = getWorkspacePrisma(workspaceId, profileId)
        const ids = await collectClientSubtreeIds(wp, id)
        await wp.client.updateMany({
            where: { id: { in: ids } },
            data: { status: 'SOFT_DELETED', deletedAt: new Date() },
        })
        void audit({
            workspaceId,
            actorUserId: session?.user?.id ?? null,
            action: 'client.soft_deleted',
            targetType: 'Client',
            targetId: String(id),
            after: { subtreeCount: ids.length },
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        revalidatePath(`/${workspaceId}/admin/client-trash`)
        return { success: true }
    } catch (error) {
        console.error('Soft-delete client failed:', error)
        return { success: false, error: 'Không thể chuyển khách hàng vào Thùng rác.' }
    }
}

/**
 * Restore a soft-deleted client (and its subtree) from the Trash back to ACTIVE.
 */
export async function restoreClient(id: number, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const wp = getWorkspacePrisma(workspaceId, profileId)
        const ids = await collectClientSubtreeIds(wp, id)
        await wp.client.updateMany({
            where: { id: { in: ids } },
            data: { status: 'ACTIVE', deletedAt: null, hardDeleteAfter: null },
        })
        void audit({
            workspaceId,
            actorUserId: session?.user?.id ?? null,
            action: 'client.restored',
            targetType: 'Client',
            targetId: String(id),
            after: { subtreeCount: ids.length },
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        revalidatePath(`/${workspaceId}/admin/client-trash`)
        return { success: true }
    } catch (error) {
        console.error('Restore client failed:', error)
        return { success: false, error: 'Không thể khôi phục khách hàng.' }
    }
}

/**
 * List soft-deleted clients for the Client Trash. Returns the "deletion roots"
 * (a soft-deleted client with no parent, or whose parent is still ACTIVE) so a
 * cascaded subtree shows once under its top node. Restoring a root restores its
 * whole subtree.
 */
export async function getTrashedClients(workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const wp = getWorkspacePrisma(workspaceId, profileId)
        const clients = await wp.client.findMany({
            where: {
                status: 'SOFT_DELETED',
                OR: [
                    { parentId: null },
                    { parent: { status: { not: 'SOFT_DELETED' } } },
                ],
            },
            include: {
                _count: { select: { tasks: true, subsidiaries: true, invoices: true } },
            },
            orderBy: { deletedAt: 'desc' },
        })
        return { success: true as const, data: serializeDecimal(clients) }
    } catch (error) {
        console.error('getTrashedClients failed:', error)
        return { success: false as const, error: 'Lỗi tải Thùng rác khách hàng.' }
    }
}

/**
 * Permanently delete a soft-deleted client (+ subtree). Manual-only, irreversible.
 * Guard: Invoice.clientId is a REQUIRED, non-nullable Restrict FK, so a client/
 * subtree that still has invoices CANNOT be purged — we block with a clear
 * message instead of letting it throw P2003. Tasks detach (SetNull); Projects +
 * child clients cascade away.
 */
export async function permanentlyDeleteClient(id: number, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const wp = getWorkspacePrisma(workspaceId, profileId)
        const ids = await collectClientSubtreeIds(wp, id)
        // [Canonical Clients] Invoice guard must be GLOBAL: the canonical
        // client can have invoices in OTHER workspaces of the profile — the
        // workspace-scoped count would miss them and the hard-delete would
        // explode with a vague P2003 mid-flight.
        const invoiceCount = await prisma.invoice.count({ where: { clientId: { in: ids } } })
        if (invoiceCount > 0) {
            return {
                success: false,
                error: `Không thể xoá vĩnh viễn: còn ${invoiceCount} hoá đơn liên kết (tính trên TẤT CẢ workspace). Hãy xử lý hoá đơn trước — khách vẫn nằm trong Thùng rác.`,
            }
        }
        // Delete the top node; child clients + projects cascade, tasks detach.
        await wp.client.delete({ where: { id } })
        void audit({
            workspaceId,
            actorUserId: session?.user?.id ?? null,
            action: 'client.hard_deleted',
            targetType: 'Client',
            targetId: String(id),
            before: { subtreeCount: ids.length },
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        revalidatePath(`/${workspaceId}/admin/client-trash`)
        return { success: true }
    } catch (error: any) {
        console.error('Permanent delete client failed:', error)
        if (error?.code === 'P2003') {
            return { success: false, error: 'Không thể xoá vĩnh viễn: còn dữ liệu liên kết (hoá đơn).' }
        }
        return { success: false, error: 'Không thể xoá vĩnh viễn khách hàng.' }
    }
}

/**
 * Merges a standalone (root-level) client INTO another root-level client,
 * making it a subsidiary. Both must have parentId === null.
 */
export async function mergeClientIntoParent(childId: number, parentId: number, workspaceId: string) {
    try {
        if (childId === parentId) return { success: false, error: 'Không thể gộp khách hàng vào chính nó.' }

        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        // Safety: ensure both are root-level clients
        const [child, parent] = await Promise.all([
            workspacePrisma.client.findUnique({ where: { id: childId }, select: { parentId: true, status: true } }),
            workspacePrisma.client.findUnique({ where: { id: parentId }, select: { parentId: true, status: true } })
        ])

        if (!child || !parent) return { success: false, error: 'Không tìm thấy khách hàng.' }
        // [Soft-delete + Canonical Clients] only ACTIVE clients can be merged
        // (blocks both Trash rows and MERGED migration leftovers)
        if (child.status !== 'ACTIVE' || parent.status !== 'ACTIVE') {
            return { success: false, error: 'Chỉ có thể gộp khách hàng đang hoạt động (không nằm trong Thùng rác).' }
        }
        if (child.parentId !== null) return { success: false, error: 'Khách hàng được kéo đã là khách hàng trực thuộc, không thể gộp.' }
        if (parent.parentId !== null) return { success: false, error: 'Khách hàng đích đến đã là khách hàng trực thuộc, không thể dùng làm khách hàng chính.' }

        await workspacePrisma.client.update({
            where: { id: childId },
            data: { parentId }
        })

        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        console.error('Merge failed:', error)
        return { success: false, error: 'Thất bại khi gộp khách hàng.' }
    }
}

/**
 * Removes the parentId of a subsidiary, making it a standalone root-level client again.
 */
export async function unmergeClient(clientId: number, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        await workspacePrisma.client.update({
            where: { id: clientId },
            data: { parentId: null }
        })

        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        console.error('Unmerge failed:', error)
        return { success: false, error: 'Thất bại khi tách khách hàng.' }
    }
}

/**
 * Read-only: lấy chi tiết 1 khách hàng (mirror đúng query của
 * /admin/crm/[id]/page.tsx) để hiển thị Chi tiết IN-PLACE trong Dashboard.
 * Trả về { client, distribution, ratings } đã serialize Decimal.
 */
export async function getClientDetail(clientId: number, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        // [Canonical Clients] Detail/analytics view intentionally shows the
        // client's FULL history across all workspaces of the profile — that's
        // the point of one canonical id ("dữ liệu từ trước tới giờ").
        const client = await workspacePrisma.client.findUnique({
            where: { id: clientId },
            include: {
                subsidiaries: {
                    where: { status: 'ACTIVE' },
                    include: { tasks: { orderBy: { createdAt: 'desc' }, take: 5 } }
                },
                tasks: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    include: { rating: true }
                },
                invoices: { orderBy: { issueDate: 'desc' }, take: 20 },
                projects: true
            }
        })

        // [Soft-delete + Canonical] trashed/merged clients aren't reachable from the active CRM
        if (!client || client.status !== 'ACTIVE') {
            return { success: false as const, error: 'Không tìm thấy khách hàng.' }
        }

        // Ratings submitted by this client's user account (global lookup, like the detail page)
        const clientUser = await prisma.user.findFirst({ where: { username: client.name } })
        const ratings = clientUser ? await prisma.rating.findMany({
            where: { workspaceId, clientId: clientUser.id },
            include: {
                task: { select: { id: true, title: true } },
                staff: { select: { username: true, nickname: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        }) : []

        // Distribution for the donut
        let distribution: { name: string; value: number }[] = []
        if (client.subsidiaries.length > 0) {
            distribution = client.subsidiaries
                .map(sub => ({ name: sub.name, value: sub.tasks.length }))
                .filter(d => d.value > 0)
        } else {
            distribution = [{ name: 'Direct Tasks', value: client.tasks.length }]
        }

        return {
            success: true as const,
            client: serializeDecimal(client),
            distribution,
            ratings: serializeDecimal(ratings)
        }
    } catch (error) {
        console.error('getClientDetail failed:', error)
        return { success: false as const, error: 'Lỗi tải chi tiết khách hàng.' }
    }
}
