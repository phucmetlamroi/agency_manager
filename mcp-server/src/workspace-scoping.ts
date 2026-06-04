/**
 * Port of src/lib/prisma-workspace.ts for MCP server.
 * Creates workspace-scoped Prisma client WITHOUT Next.js imports.
 */
import { prisma } from './prisma-client.js'

/** Models shared across all workspaces — NOT filtered by workspaceId */
const bypassModels = [
    'Profile', 'User', 'Workspace', 'WorkspaceMember', 'BillingProfile',
    'ErrorDictionary', 'Contact', 'Conversation', 'ConversationParticipant',
    'Message', 'MessageReaction', 'MessageReadReceipt',
]

/** Models that do NOT have a profileId column */
const noProfileModels = [
    'Profile', 'WorkspaceMember', 'ErrorDictionary', 'BillingProfile',
    'Feedback', 'Rating', 'Session', 'Event', 'UserPresence', 'Agency',
    'Contact', 'Conversation', 'ConversationParticipant', 'Message',
    'MessageReaction', 'MessageReadReceipt',
]

/**
 * Creates an extended PrismaClient that automatically injects workspaceId
 * (and optionally profileId) into queries for isolated models.
 */
export function getWorkspacePrisma(currentWorkspaceId: string, currentProfileId?: string) {
    if (!currentWorkspaceId) {
        throw new Error('getWorkspacePrisma requires a valid currentWorkspaceId')
    }

    return prisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (!args) args = {} as any

                    const isBypassed = bypassModels.includes(model)
                    const hasNoProfile = noProfileModels.includes(model)

                    // READ & DELETE: inject into where
                    if ([
                        'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow',
                        'findMany', 'count', 'aggregate', 'groupBy',
                        'update', 'updateMany', 'delete', 'deleteMany',
                    ].includes(operation)) {
                        let baseWhere: any = { ...((args as any).where || {}) }

                        if (!isBypassed) baseWhere.workspaceId = currentWorkspaceId

                        if (currentProfileId && !hasNoProfile) {
                            if (model === 'User') {
                                delete baseWhere.profileId
                                baseWhere = {
                                    ...baseWhere,
                                    AND: [
                                        ...(baseWhere.AND || []),
                                        {
                                            OR: [
                                                { profileId: currentProfileId },
                                                { profileAccesses: { some: { profileId: currentProfileId } } },
                                            ],
                                        },
                                    ],
                                }
                            } else {
                                baseWhere.profileId = currentProfileId
                            }
                        }

                        ;(args as any).where = baseWhere
                    }

                    // CREATE: inject into data
                    if (operation === 'create') {
                        ;(args as any).data = {
                            ...((args as any).data || {}),
                            ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                            ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {}),
                        }
                    }

                    if (operation === 'createMany') {
                        if (Array.isArray((args as any).data)) {
                            ;(args as any).data = (args as any).data.map((item: any) => ({
                                ...item,
                                ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                                ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {}),
                            }))
                        } else {
                            ;(args as any).data = {
                                ...((args as any).data || {}),
                                ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                                ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {}),
                            }
                        }
                    }

                    // UPSERT: inject into where + create + update
                    if (operation === 'upsert') {
                        const inject = {
                            ...(!isBypassed ? { workspaceId: currentWorkspaceId } : {}),
                            ...(currentProfileId && !hasNoProfile ? { profileId: currentProfileId } : {}),
                        }
                        ;(args as any).where = { ...((args as any).where || {}), ...inject }
                        ;(args as any).create = { ...((args as any).create || {}), ...inject }
                        ;(args as any).update = { ...((args as any).update || {}), ...inject }
                    }

                    return query(args)
                },
            },
        },
    })
}
