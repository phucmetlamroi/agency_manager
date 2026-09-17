'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

import { getWorkspacePrisma, resolveActiveProfileId } from '@/lib/prisma-workspace'
import { verifyWorkspaceAccess, verifyFinanceAccess } from '@/lib/security'
import { serializeDecimal } from '@/lib/serialization'
import { audit } from '@/lib/audit-log'

// [AUDIT SWEEP-2026-07-30 · H1 fix] MỘT NGUỒN profileId DUY NHẤT CHO CẢ FILE.
//
// Mọi hàm dưới đây chấm quyền bằng verifyWorkspaceAccess/verifyFinanceAccess, và hai cổng đó
// chấm theo profile CỦA WORKSPACE trong URL (chúng tra `workspace.profileId` rồi tìm
// ProfileAccess trên đúng profile ấy). Nhưng phạm vi DỮ LIỆU trước đây lại lấy từ claim
// `sessionProfileId` trong JWT — hai nguồn khác nhau cho hai việc, trong cùng một hàm.
//
// Vì `Client` nằm trong `bypassModels` (prisma-workspace.ts), workspaceId KHÔNG được chèn vào
// truy vấn Client ⇒ profileId là bộ lọc tenant DUY NHẤT của nó. Lệch nguồn nghĩa là: quyền chấm
// trên profile B, dữ liệu lấy từ profile A. Ai cũng tự tạo được một profile riêng
// (createProfileForUser, hạn mức 5/người) và tự thành OWNER ở đó, nên một nhân sự thường của
// agency A chỉ cần tạo profile B + workspace của B, rồi mở CRM ở đó trong khi claim vẫn trỏ về A
// → đọc trọn danh sách khách của A và xoá vĩnh viễn được cây khách hàng.
//
// `resolveActiveProfileId` là khuôn ĐÃ CÓ trong repo (`admin/crm/[id]/page.tsx` dùng đúng nó):
// chuyển sang profile của workspace khi người gọi có ProfileAccess ở đó, và GIỮ claim cũ khi
// `workspace.profileId` là NULL (workspace legacy) — nên không làm chết CRM trên dữ liệu cũ.
//
// ⚠️ ĐỪNG "sửa" bằng cách chặn khi `sessionProfileId !== workspace.profileId`: điều hướng
// cross-profile là luồng HỢP LỆ mà `[workspaceId]/layout.tsx` cố ý hỗ trợ, chặn là gãy UX thật.

// --- CLIENT ACTIONS ---

export async function getClients(workspaceId: string) {
    try {
        // [AUDIT R1 — HIGH fix #15] CRM actions had NO workspace authz — any
        // authenticated user could read/mutate clients.
        // [AUDIT R10 — HIGH fix] The nested task/client includes carry finance scalars
        // (jobPriceUSD, wageVND, profitVND, exchangeRate) + client depositBalance, so a
        // bare MEMBER could RPC-replay this and read agency revenue + coworker wages. Gate
        // on profile-scoped finance/admin authority — the SAME predicate the admin layout
        // (verifyProfileAdminAccess) uses, so every real CRM/task-picker caller still passes.
        await verifyFinanceAccess(workspaceId)
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
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

/**
 * [Authz 2026-07 round 4] EVERY write that can put a client at a (profile, parent, name)
 * position runs inside this lock. Review found the first pass had locked only three of six —
 * and a lock only half the writers take is not a lock: unmerge could hold it, check "no root
 * Acme", and an UNLOCKED rename of "Beta"->"Acme" would land in the same window, producing the
 * two same-named ACTIVE roots that resolveShareToken collapses into ONE share scope, so either
 * client's link reads the other's tasks, invoices and files.
 *
 * deleteClient takes it too, for a different reason: merge validates its target parent and then
 * writes, and an unlocked soft-delete in between would leave an ACTIVE child under a trashed
 * parent — invisible in the active tree and not part of any deleted subtree.
 *
 * The key is the PROFILE, because that is the scope the uniqueness invariant is defined over.
 */
async function withClientNameLock<T>(
    wp: any,
    profileId: string | undefined,
    workspaceId: string,
    fn: (tx: any) => Promise<T>,
): Promise<T> {
    // Prisma's interactive default is 5s and db.ts sets none. deleteClient and restoreClient run
    // a level-by-level tree walk INSIDE this lock — one round-trip per level — so a deep client
    // hierarchy could blow the default and roll back, showing the admin nothing but the generic
    // "could not" message on perfectly valid data. 20s is the same budget the bulk-approve
    // transaction uses; maxWait covers contention with another CRM write holding the lock.
    return wp.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${String(profileId ?? workspaceId)}, 0))`
        return fn(tx)
    }, { timeout: 20_000, maxWait: 10_000 })
}


export async function createClient(data: { name: string, parentId?: number }, workspaceId: string) {
    try {
        // [AUDIT R1 — HIGH fix #15] Require workspace ADMIN to mutate CRM.
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        const parentId = data.parentId || null
        const created: { success: boolean; error?: string } = await withClientNameLock(workspacePrisma, profileId, workspaceId, async (tx) => {
            // A SOFT_DELETED parent must not accept new children. findDuplicateName only compares
            // ACTIVE siblings, so creating under a trashed parent slipped the guard entirely —
            // and then restoring that parent brought BOTH same-named children back to ACTIVE.
            if (parentId !== null) {
                const parent = await tx.client.findUnique({ where: { id: parentId }, select: { status: true } })
                if (!parent || parent.status !== 'ACTIVE') {
                    return { success: false, error: 'Khách hàng chính không còn hoạt động — hãy tải lại trang.' }
                }
            }
            if (await findDuplicateName(tx, data.name, parentId)) {
                return { success: false, error: `Khách hàng "${data.name.trim()}" đã tồn tại trong profile — clients giờ dùng chung cho mọi workspace, không cần tạo lại.` }
            }
            await tx.client.create({ data: { name: data.name, parentId } })
            return { success: true }
        })
        if (!created.success) return created
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create client' }
    }
}

export async function updateClient(id: number, data: { name: string }, workspaceId: string) {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        // Dup-guard on rename: same normalized name under the same parent. A rename REACHES a
        // name position exactly as a create does, so it takes the same lock — otherwise it is
        // the unlocked writer that defeats every locked one.
        const renamed: { success: boolean; error?: string } = await withClientNameLock(workspacePrisma, profileId, workspaceId, async (tx) => {
            const current = await tx.client.findUnique({ where: { id }, select: { parentId: true } })
            if (current && await findDuplicateName(tx, data.name, current.parentId, id)) {
                return { success: false, error: `Khách hàng "${data.name.trim()}" đã tồn tại trong profile.` }
            }
            await tx.client.update({ where: { id }, data: { name: data.name } })
            return { success: true }
        })
        if (!renamed.success) return renamed
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to update client' }
    }
}

// --- PROJECT ACTIONS ---

export async function createProject(data: { name: string, clientId: number, code?: string }, workspaceId: string) {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
        // [AUDIT R14 — fix] Require a real session profile (consistent with the other
        // create paths) so the clientId profile-filter below can't degrade to an
        // unscoped `profileId: undefined` query.
        if (!profileId || typeof profileId !== 'string') {
            return { success: false, error: 'Lỗi nội bộ: profileId thiếu — vui lòng chọn lại profile.' }
        }
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        // [AUDIT R14 — fix] Validate clientId belongs to THIS profile before binding the
        // project to it — a foreign numeric clientId would otherwise attach + surface
        // another profile's client name on read-back.
        const clientOk = await prisma.client.findFirst({
            where: { id: data.clientId, profileId },
            select: { id: true },
        })
        if (!clientOk) {
            return { success: false, error: 'Khách hàng được chọn không hợp lệ.' }
        }
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
 * [Soft-delete] Collect a client's full descendant subtree (root + all subsidiaries) so
 * soft-delete / restore cascade the whole tree the way the old hard-delete cascade did — but
 * reversibly. Uses the workspace-scoped client.
 *
 * `status` is OPTIONAL and each caller passes what it means:
 *   deleteClient  -> 'ACTIVE'        (a trashed descendant is already trashed)
 *   restoreClient -> 'SOFT_DELETED'  (an ACTIVE descendant is NOT ours to reactivate — and
 *                                     including it made the collision check exclude the very
 *                                     rows it existed to catch)
 *   permanentlyDeleteClient -> omitted, every status, because it removes the lot.
 *
 * Depth is NOT capped. The old `guard < 8` stopped descending while the caller updated
 * everything already collected, which partially trashed and partially restored deep trees.
 * Termination comes from the visited set, so a corrupt parent cycle also ends.
 */
async function collectClientSubtreeIds(wp: any, rootId: number, status?: 'ACTIVE' | 'SOFT_DELETED'): Promise<number[]> {
    const all = new Set<number>([rootId])
    let frontier: number[] = [rootId]
    // [round 4 review] The old `guard < 8` stopped DESCENDING at depth 8 while the caller went
    // on to update every id it HAD collected — so a 9-deep tree was partially soft-deleted
    // (leaving ACTIVE children under a trashed parent) and partially restored. Depth is bounded
    // by the visited set now: every node is enqueued at most once, so the loop terminates on a
    // cycle too, and a real hierarchy is never silently truncated.
    while (frontier.length > 0) {
        const children: { id: number }[] = await wp.client.findMany({
            where: { parentId: { in: frontier }, ...(status ? { status } : {}) },
            select: { id: true },
        })
        const next: number[] = []
        for (const c of children) {
            if (!all.has(c.id)) { all.add(c.id); next.push(c.id) }
        }
        frontier = next
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
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
        const wp = getWorkspacePrisma(workspaceId, profileId)
        // Locked as well: mergeClientIntoParent validates its target parent and then writes, so
        // an unlocked soft-delete landing in that window leaves an ACTIVE child hanging under a
        // trashed parent — gone from the active tree, and not inside any deleted subtree either.
        const ids = await withClientNameLock(wp, profileId, workspaceId, async (tx) => {
            const subtree = await collectClientSubtreeIds(tx, id, 'ACTIVE')
            await tx.client.updateMany({
                where: { id: { in: subtree } },
                data: { status: 'SOFT_DELETED', deletedAt: new Date() },
            })
            return subtree
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
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
        const wp = getWorkspacePrisma(workspaceId, profileId)
        // [Authz 2026-07 round 4] Restoring turns rows back to ACTIVE, which is a create as far
        // as the name-path scope is concerned. Round 3 checked only the SUBTREE ROOT, and review
        // showed why that is not enough: a client can be created under a SOFT_DELETED parent (a
        // stale form, or simply a second tab), because findDuplicateName compares ACTIVE siblings
        // only and the parent was not active. Restoring then flips BOTH same-named children to
        // ACTIVE at once, and resolveShareToken reads one name path as ONE client scope — each
        // link then reads the other's tasks, invoices and files. Every node is checked, and the
        // subtree is recollected INSIDE the lock so it cannot shift underneath the check.
        const restored: { success: boolean; error?: string; ids?: number[] } = await withClientNameLock(wp, profileId, workspaceId, async (tx) => {
            // SOFT_DELETED only. The previous version walked the tree without a status filter, so
            // an ACTIVE client already sitting at a name position INSIDE the tree was pulled into
            // the subtree set — and then excluded from the collision check as "one of ours". The
            // two rows it was supposed to catch were the two it silently allowed.
            const subtree = await collectClientSubtreeIds(tx, id, 'SOFT_DELETED')
            const rows: { id: number; name: string; parentId: number | null }[] = await tx.client.findMany({
                where: { id: { in: subtree }, status: 'SOFT_DELETED' },
                select: { id: true, name: true, parentId: true },
            })
            if (rows.length === 0) return { success: false, error: 'Không tìm thấy khách hàng trong Thùng rác.' }

            const parentIds = Array.from(new Set(rows.map((r) => r.parentId)))
            const nonNullParents = parentIds.filter((v): v is number => v !== null)
            // `in: [null, 10, 11]` is not a legal Prisma filter for a nullable Int — it is
            // rejected at validation, which turned EVERY ordinary root restore into the generic
            // "Không thể khôi phục" catch. Root level has to be its own OR branch.
            const parentWhere = parentIds.includes(null)
                ? { OR: [{ parentId: null }, ...(nonNullParents.length ? [{ parentId: { in: nonNullParents } }] : [])] }
                : { parentId: { in: nonNullParents } }
            const occupants: { id: number; name: string; parentId: number | null }[] = nonNullParents.length || parentIds.includes(null)
                ? await tx.client.findMany({
                    where: { status: 'ACTIVE', ...parentWhere },
                    select: { id: true, name: true, parentId: true },
                })
                : []

            const norm = (s: string) => (s ?? '').normalize('NFC').trim().toLowerCase()
            const key = (parentId: number | null, name: string) => `${parentId ?? -1}\u0000${norm(name)}`
            const taken = new Set(occupants.map((o) => key(o.parentId, o.name)))
            for (const r of rows) {
                const k = key(r.parentId, r.name)
                // Against what is already live...
                if (taken.has(k)) {
                    return { success: false, error: `Không thể khôi phục: đã có khách hàng "${r.name.trim()}" đang hoạt động ở cùng cấp. Đổi tên nó trước, rồi khôi phục lại.` }
                }
                // ...AND against the rest of this restore. Two soft-deleted siblings can share a
                // name (updateClient renames a trashed row without an ACTIVE-status check), and
                // reactivating both in one updateMany would create the collision by itself.
                taken.add(k)
            }

            await tx.client.updateMany({
                where: { id: { in: subtree } },
                data: { status: 'ACTIVE', deletedAt: null, hardDeleteAfter: null },
            })
            return { success: true, ids: subtree }
        })
        if (!restored.success) return restored
        const ids = restored.ids ?? []
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
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
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
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
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
        //
        // [AUDIT SWEEP H1 fix] Chỉ xoá được khách ĐÃ nằm trong Thùng rác. Giao diện chỉ mở nút này
        // từ trang Thùng rác, nhưng action là POST endpoint gọi trực tiếp được, nên trước đây một
        // `id` ACTIVE bất kỳ cũng xoá vĩnh viễn được (Client.id là Int tự tăng ⇒ dò tuần tự được),
        // kéo theo cascade subsidiaries + Project. Không hoàn tác.
        // Dùng `deleteMany` thay vì `delete` vì `delete` chỉ nhận khoá duy nhất, không nhận thêm
        // điều kiện `status`. `deleteMany` NẰM TRONG danh sách được chèn phạm vi của
        // prisma-workspace.ts:138 nên profileId vẫn được chèn — không mất lớp lọc tenant.
        const { count: deleted } = await wp.client.deleteMany({
            where: { id, status: 'SOFT_DELETED' },
        })
        if (deleted === 0) {
            return {
                success: false,
                error: 'Chỉ xoá vĩnh viễn được khách đang nằm trong Thùng rác. Hãy xoá tạm trước.',
            }
        }
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
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        if (childId === parentId) return { success: false, error: 'Không thể gộp khách hàng vào chính nó.' }

        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
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

        // [Authz 2026-07 round 2] Merging MOVES a client under a new parent, so it needs the
        // same duplicate guard and the same lock as detaching. Hardening only unmergeClient was
        // treating one direction of the same edge: dragging "Acme" under "Bob" when "Bob > Acme"
        // already exists produces two ACTIVE siblings with one name, and resolveShareToken reads
        // a shared name path as a SINGLE client scope — either link then reads both libraries.
        const merged: { success: boolean; error?: string } = await withClientNameLock(workspacePrisma, profileId, workspaceId, async (tx) => {
            const fresh = await tx.client.findUnique({ where: { id: childId }, select: { name: true, parentId: true, status: true } })
            if (!fresh || fresh.status !== 'ACTIVE' || fresh.parentId !== null) {
                return { success: false, error: 'Khách hàng đã thay đổi, vui lòng tải lại trang.' }
            }
            // Re-read the PARENT inside the lock as well. Round 3 revalidated only the child, so
            // a soft-delete landing between the pre-flight read and this write left an ACTIVE
            // client parented to a trashed one — missing from the active hierarchy, and outside
            // any deleted subtree, so nothing would ever clean it up or show it.
            const freshParent = await tx.client.findUnique({ where: { id: parentId }, select: { parentId: true, status: true } })
            if (!freshParent || freshParent.status !== 'ACTIVE' || freshParent.parentId !== null) {
                return { success: false, error: 'Khách hàng chính đã thay đổi, vui lòng tải lại trang.' }
            }
            if (await findDuplicateName(tx, fresh.name, parentId, childId)) {
                return { success: false, error: `Không thể gộp: khách hàng chính đã có "${fresh.name.trim()}" trực thuộc. Đổi tên một trong hai trước khi gộp.` }
            }
            await tx.client.update({ where: { id: childId }, data: { parentId } })
            return { success: true }
        })
        if (!merged.success) return merged

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
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        // [Authz 2026-07] Detaching MOVES a client to root level, so it has to clear the same
        // duplicate guard createClient and updateClient already run — this was the one
        // parent-changing path without one. The share-token scope identifies a client by its
        // hierarchical NAME PATH, so two ACTIVE roots named "Michael" in one profile collapse
        // into a SINGLE scope and either one's link reads the other's tasks, invoices and
        // files. "Bob > Michael" alongside a root "Michael" is legal (the unique index keys on
        // profile + parent + name), which makes detaching the way that pair gets created.
        // Guard and write in ONE transaction behind a per-profile advisory lock. Checking then
        // updating as two statements let two concurrent detaches — "A > Acme" and "B > Acme",
        // no root Acme yet — each see no conflict and both land, producing exactly the pair of
        // same-named ACTIVE roots that resolveShareToken then reads as a SINGLE client scope.
        // The database index that would catch this lives in a MANUAL migration whose own header
        // says it may not be applied, and postinstall runs `prisma db push`, which does not
        // create it — so the lock is the real guarantee here, not a belt over a braces.
        const result: { success: boolean; error?: string } = await withClientNameLock(workspacePrisma, profileId, workspaceId, async (tx) => {
            const target = await tx.client.findUnique({
                where: { id: clientId },
                select: { name: true, parentId: true },
            })
            if (!target) return { success: false, error: 'Không tìm thấy khách hàng.' }
            if (target.parentId !== null && await findDuplicateName(tx, target.name, null, clientId)) {
                return { success: false, error: `Không thể tách: đã có khách hàng "${target.name.trim()}" ở cấp gốc. Đổi tên một trong hai trước khi tách.` }
            }
            await tx.client.update({ where: { id: clientId }, data: { parentId: null } })
            return { success: true }
        })
        if (!result.success) return result

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
        // [AUDIT R10 — HIGH fix] Returns per-task jobPriceUSD/wageVND/profitVND, full
        // invoice totals, and client depositBalance (all serializeDecimal'd, NOT stripped).
        // Was gated at MEMBER → a non-finance editor could RPC-replay it for full agency
        // finance. Gate on profile-scoped finance authority (same as the admin CRM that
        // is its only caller).
        await verifyFinanceAccess(workspaceId)
        const session = await getSession()
        // [AUDIT SWEEP H1 fix] Phạm vi dữ liệu phải theo profile CỦA WORKSPACE — xem chú thích
        // đầu file. KHÔNG đổi lại thành `sessionProfileId`.
        const profileId = (await resolveActiveProfileId(
            session?.user?.id ?? '',
            workspaceId,
            (session?.user as any)?.sessionProfileId,
        )) ?? undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        // [Bug fix 2026-06] Scope tasks/invoices to the SELECTED workspace so the
        // detail matches the workspace switcher + the per-workspace revenue/task
        // numbers in the Clients Manager list (getClients already filters tasks by
        // workspaceId). Previously this showed the client's all-workspace history,
        // which contradicted the per-workspace revenue and made the "Tổng số Task"
        // card disagree with the (truncated) list. The middleware does NOT inject
        // workspaceId into nested relation includes, so the filter is explicit.
        // No `take` cap → the card count equals the rows the UI renders.
        const client = await workspacePrisma.client.findUnique({
            where: { id: clientId },
            include: {
                subsidiaries: {
                    where: { status: 'ACTIVE' },
                    include: { tasks: { where: { workspaceId }, orderBy: { createdAt: 'desc' } } }
                },
                tasks: {
                    where: { workspaceId },
                    orderBy: { createdAt: 'desc' },
                    include: { rating: true }
                },
                invoices: { where: { workspaceId }, orderBy: { issueDate: 'desc' } },
                // [AUDIT SWEEP fix] `projects` là quan hệ lồng DUY NHẤT ở đây bị bỏ sót — ba quan hệ
                // trên đều đã lọc. Chú thích ngay phía trên nói đúng lý do (extension không chèn
                // workspaceId vào include), chỉ dòng này quên áp. Không lọc ⇒ tên + mã dự án của
                // MỌI workspace khác trong cùng profile đi kèm response về máy khách.
                projects: { where: { workspaceId } }
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
