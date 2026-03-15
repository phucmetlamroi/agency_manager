import { PrismaClient } from '@prisma/client'
import { prisma as globalPrisma } from './db'

/**
 * List of models that are shared across all workspaces and should NOT be filtered by `workspaceId`.
 */
const bypassModels = [
    'Profile',
    'User',
    'Workspace',
    'WorkspaceMember',
    'BillingProfile',
    'Payroll',
    'PayrollLock',
    'MonthlyBonus',
    'PerformanceMetric',
    'ErrorDictionary'
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
    'Agency'
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

                    // 1. READ & DELETE Operations (Inject into `where`)
                    if (['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
                        (args as any).where = {
                            ...((args as any).where || {}),
                            ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                            ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {})
                        }
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
