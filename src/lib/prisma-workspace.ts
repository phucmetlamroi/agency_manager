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
