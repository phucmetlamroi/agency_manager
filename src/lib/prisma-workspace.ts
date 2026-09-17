import { PrismaClient } from '@prisma/client'
import { prisma as globalPrisma } from './db'

/**
 * List of models that are shared across all workspaces and should NOT be filtered by `workspaceId`.
 *
 * [Canonical Clients 2026-06] 'Client' added: clients are now PROFILE-scoped
 * (one canonical record per profile, visible in every workspace). Reads and
 * creates still get `profileId` injected below — Client is NOT in
 * noProfileModels — so tenant isolation moves from workspace-level to
 * profile-level. Task/Invoice data isolation per workspace is unchanged
 * (those models stay out of this list).
 */
const bypassModels = [
    'Profile',
    'User',
    'Workspace',
    'WorkspaceMember',
    'BillingProfile',
    'ErrorDictionary',
    'Contact',
    'Client'
]

/**
 * Models that strictly do NOT have a profileId column.
 */
const noProfileModels = [
    'Profile',
    'WorkspaceMember',
    'ErrorDictionary',
    'BillingProfile',
    'Feedback',
    'Rating',
    'Session',
    'Event',
    'UserPresence',
    'Agency',
    'Contact'
]

/**
 * Creates an extended PrismaClient that automatically injects `workspaceId`
 * into the `where` and `data` objects of queries for isolated models.
 *
 * @param currentWorkspaceId The ID of the current active workspace.
 * @param currentProfileId The ID of the current profile (optional isolation).
 * @returns Extended Prisma Client
 */
/**
 * [Task-loss A1] Resolve the profileId a workspace page must scope its data to.
 *
 * WorkspaceLayout already RECONCILES the session profile against the workspace's OWN profile (a
 * user viewing a workspace that belongs to a different profile they can access renders under that
 * workspace's profile). But every page re-derives profileId from the session independently, and
 * `getWorkspacePrisma(workspaceId, sessionProfileId)` injects the WRONG profileId into each
 * Task / Invoice query → the row filter matches nothing → the whole board looks wiped even though
 * the tasks still exist. This helper reproduces the layout's reconcile so a page can never scope
 * to the wrong profile:
 *   1. base = session profile, else the user's first-granted profile (legacy / cross-profile),
 *   2. if the workspace belongs to a DIFFERENT profile the user actually has access to → switch.
 * Access itself is already gated by the layout; this only picks the correct data scope. Returns
 * null only when the user has no resolvable profile at all (caller should redirect to /login).
 */
export async function resolveActiveProfileId(
    userId: string,
    workspaceId: string,
    sessionProfileId: string | null | undefined,
): Promise<string | null> {
    let profileId: string | null = sessionProfileId ?? null
    if (!profileId) {
        try {
            const first = await globalPrisma.profileAccess.findFirst({
                where: { userId },
                select: { profileId: true },
                orderBy: { grantedAt: 'asc' },
            })
            profileId = first?.profileId ?? null
        } catch (e) {
            console.warn('[resolveActiveProfileId] first-access lookup failed:', e)
        }
    }
    if (!profileId) return null

    try {
        const ws = await globalPrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true },
        })
        if (ws?.profileId && ws.profileId !== profileId) {
            const xAccess = await globalPrisma.profileAccess.findUnique({
                where: { userId_profileId: { userId, profileId: ws.profileId } },
                select: { profileId: true },
            })
            if (xAccess) profileId = xAccess.profileId
        }
    } catch (e) {
        // Keep the base profileId — the layout already gated access; worst case the page shows its
        // own-profile (possibly empty) view, exactly as before this fix. Never throw here.
        console.warn('[resolveActiveProfileId] workspace-profile reconcile failed:', e)
    }
    return profileId
}

/**
 * [PHẢN BIỆN 2026-07-30 · CS-2] Profile SỞ HỮU workspace này — nguồn DUY NHẤT cho các đường GHI.
 *
 * Khác `resolveActiveProfileId` ở trên: hàm đó dành cho TRANG hiển thị, và khi người gọi không có
 * ProfileAccess trên profile của workspace thì nó GIỮ claim để trang không trắng trơn. Với các
 * đường GHI (tạo task, tạo hoá đơn, khoá tài khoản) thì hành vi "giữ claim" chính là lỗ hổng:
 * cổng `verifyWorkspaceAccess` chấm trên `workspace.profileId`, nên dữ liệu cũng PHẢI lấy từ đúng
 * hàng đó, không có nhánh lùi nào.
 *
 * Trả `null` khi workspace không tồn tại hoặc chưa gắn profile ⇒ nơi gọi FAIL CLOSED.
 * (`createWorkspaceAction` luôn gán profileId non-null, nên `null` chỉ xảy ra với dữ liệu legacy —
 * và với một thao tác GHI thì dừng lại là đúng, không phải đoán.)
 */
export async function resolveWorkspaceProfileId(workspaceId: string): Promise<string | null> {
    if (!workspaceId) return null
    try {
        const ws = await globalPrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true },
        })
        return ws?.profileId ?? null
    } catch (e) {
        // Fail closed: lỗi tra cứu KHÔNG được biến thành "dùng tạm claim".
        console.error('[resolveWorkspaceProfileId] lookup failed:', e)
        return null
    }
}

export function getWorkspacePrisma(currentWorkspaceId: string, currentProfileId?: string) {
    if (!currentWorkspaceId) {
        throw new Error("getWorkspacePrisma requires a valid currentWorkspaceId")
    }

    return globalPrisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (!args) {
                        args = {} as any
                    }

                    const isBypassed = bypassModels.includes(model)
                    const hasNoProfile = noProfileModels.includes(model)

                    // [Canonical Clients] FAIL-CLOSED guard: Client is bypassed
                    // from workspaceId injection, so profileId is its ONLY
                    // tenant filter. A call site that constructed this client
                    // without currentProfileId would otherwise query Clients
                    // UNFILTERED — a silent cross-profile leak. Throw loudly
                    // (all envs, not just dev) so a missed sweep site surfaces
                    // as an error instead of a data leak.
                    if (model === 'Client' && !currentProfileId) {
                        throw new Error(
                            `[prisma-workspace] Client queries require profileId — ` +
                            `getWorkspacePrisma(workspaceId, profileId) was called without ` +
                            `profileId (workspace ${currentWorkspaceId}, op ${operation}). ` +
                            `Pass sessionProfileId or resolve workspace.profileId first.`,
                        )
                    }

                    // 1. READ & DELETE Operations (Inject into `where`)
                    if (['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
                        let baseWhere: any = { ...((args as any).where || {}) }

                        if (!isBypassed) baseWhere.workspaceId = currentWorkspaceId

                        if (currentProfileId && !hasNoProfile) {
                            if (model === 'User') {
                                // Cho phép tài khoản thuộc Profile này HOẶC được cấp quyền truy cập "Du Học" vào Profile này
                                delete baseWhere.profileId
                                baseWhere = {
                                    ...baseWhere,
                                    AND: [
                                        ...(baseWhere.AND || []),
                                        {
                                            OR: [
                                                { profileId: currentProfileId },
                                                // [Client membership] CLIENT members are view-only portal users —
                                                // exclude them from workspace-scoped User queries (assignee pickers,
                                                // admin user list, etc.). Staff keep ADMIN/USER access → still matched.
                                                { profileAccesses: { some: { profileId: currentProfileId, role: { not: 'CLIENT' } } } }
                                            ]
                                        }
                                    ]
                                }
                            } else {
                                baseWhere.profileId = currentProfileId
                            }
                        }

                        (args as any).where = baseWhere
                    }

                    // 2. CREATE Operations (Inject into `data`)
                    if (['create'].includes(operation)) {
                        (args as any).data = {
                            ...((args as any).data || {}),
                            ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                            ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {})
                        }
                    }

                    if (['createMany'].includes(operation)) {
                        if (Array.isArray((args as any).data)) {
                            (args as any).data = (args as any).data.map((item: any) => ({
                                ...item,
                                ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                                ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {})
                            }))
                        } else {
                            (args as any).data = {
                                ...((args as any).data || {}),
                                ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                                ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {})
                            }
                        }
                    }

                    // 3. UPSERT Operations
                    if (['upsert'].includes(operation)) {
                        (args as any).where = {
                            ...((args as any).where || {}),
                            ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                            ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {})
                        }

                        (args as any).create = {
                            ...((args as any).create || {}),
                            ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                            ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {})
                        }

                        (args as any).update = {
                            ...((args as any).update || {}),
                            ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                            ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {})
                        }
                    }

                    return query(args)
                },
            },
        },
    })
}
