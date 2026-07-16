/**
 * Shared authorization guards for MCP write-tools.
 *
 * [AUDIT HT-036 / HT-041] The MCP service-account is confined to its own profile by
 * validateWorkspaceAccess(), but the individual write-tools did NOT verify that the USER or
 * CLIENT they were handed actually belongs to the target workspace/profile. That let a caller
 * assign/claim a task to a userId from another workspace, or create a task against a clientId
 * from another tenant within the profile. These guards close that gap; call them from every
 * write path that accepts an externally-supplied assigneeId/userId/clientId.
 */
import { prisma } from '../prisma-client.js'
import { getMcpAuthContext } from '../auth-context.js'

/** Throw unless `userId` is a member of workspace `wsId`. [HT-036] */
export async function assertWorkspaceMember(wsId: string, userId: string): Promise<void> {
    if (!userId) throw new Error('userId is required')
    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: wsId, userId },
        select: { id: true },
    })
    if (!member) {
        throw new Error(`User ${userId} is not a member of workspace ${wsId}`)
    }
}

/** Throw unless client `clientId` belongs to the MCP profile and is active. [HT-041] */
export async function assertClientInProfile(clientId: number): Promise<void> {
    const ctx = getMcpAuthContext()
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { profileId: true, status: true },
    })
    if (!client || client.profileId !== ctx.profileId) {
        throw new Error(`Client ${clientId} does not belong to this profile`)
    }
    if (client.status === 'SOFT_DELETED' || client.status === 'MERGED') {
        throw new Error(`Client ${clientId} is not active`)
    }
}
