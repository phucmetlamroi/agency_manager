import { PrismaClient } from '@prisma/client'
import { prisma as globalPrisma } from './db'

/**
 * List of models that are shared across all workspaces and should NOT be filtered by `workspaceId`.
 */
const bypassModels = [
    'User',
    'Workspace',
    'WorkspaceMember',
    'Agency',
    'BillingProfile',
    'Payroll',
    'PayrollLock',
    'MonthlyBonus',
    'PerformanceMetric',
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
                    // Skip isolation if model is in bypass list
                    if (bypassModels.includes(model)) {
                        return query(args)
                    }

                    // Protect against operations without args
                    if (!args) {
                        args = {} as any
                    }

                    // 1. READ & DELETE Operations (Inject into `where`)
                    if (['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
                        (args as any).where = {
                            ...((args as any).where || {}),
                            workspaceId: currentWorkspaceId,
                            ...(currentProfileId ? { profileId: currentProfileId } : {})
                        }
                    }

                    // 2. CREATE Operations (Inject into `data`)
                    if (['create'].includes(operation)) {
                        (args as any).data = {
                            ...((args as any).data || {}),
                            workspaceId: currentWorkspaceId,
                            ...(currentProfileId ? { profileId: currentProfileId } : {})
                        }
                    }

                    if (['createMany'].includes(operation)) {
                        // `createMany` takes an array of data objects
                        if (Array.isArray((args as any).data)) {
                            (args as any).data = (args as any).data.map((item: any) => ({
                                ...item,
                                workspaceId: currentWorkspaceId,
                                ...(currentProfileId ? { profileId: currentProfileId } : {})
                            }))
                        } else {
                            (args as any).data = {
                                ...((args as any).data || {}),
                                workspaceId: currentWorkspaceId,
                                ...(currentProfileId ? { profileId: currentProfileId } : {})
                            }
                        }
                    }

                    // 3. UPSERT Operations
                    if (['upsert'].includes(operation)) {
                        (args as any).where = {
                            ...((args as any).where || {}),
                            workspaceId: currentWorkspaceId,
                            ...(currentProfileId ? { profileId: currentProfileId } : {})
                        }

                            (args as any).create = {
                            ...((args as any).create || {}),
                            workspaceId: currentWorkspaceId,
                            ...(currentProfileId ? { profileId: currentProfileId } : {})
                        }

                        // We do NOT inject `workspaceId` into `update` because `where` already constrains it,
                        // and updating the workspaceId is generally not allowed via standard upsert.
                    }

                    return query(args)
                },
            },
        },
    }) as unknown as PrismaClient
}
