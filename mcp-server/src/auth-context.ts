/**
 * MCP Server auth context — service account model.
 *
 * MCP runs as a profile-level admin, not per-user JWT.
 * Environment variables:
 *   MCP_PROFILE_ID     — the profile UUID this MCP instance serves
 *   MCP_WORKSPACE_IDS  — comma-separated workspace whitelist (empty = all in profile)
 */
import { prisma } from './prisma-client.js'

export interface McpAuthContext {
    profileId: string
    allowedWorkspaceIds: string[]  // empty = all workspaces in profile
}

let _cachedContext: McpAuthContext | null = null

export function getMcpAuthContext(): McpAuthContext {
    if (_cachedContext) return _cachedContext

    const profileId = process.env.MCP_PROFILE_ID
    if (!profileId) {
        console.error('[MCP] CRITICAL: MCP_PROFILE_ID not set.')
        process.exit(1)
    }

    const wsIds = process.env.MCP_WORKSPACE_IDS
    const allowedWorkspaceIds = wsIds
        ? wsIds.split(',').map(s => s.trim()).filter(Boolean)
        : []

    _cachedContext = { profileId, allowedWorkspaceIds }
    return _cachedContext
}

/**
 * Validate that a workspace belongs to the MCP profile and is in the whitelist.
 * Returns the workspace or throws an error string.
 */
export async function validateWorkspaceAccess(workspaceId: string): Promise<{
    id: string
    name: string
    profileId: string | null
}> {
    const ctx = getMcpAuthContext()

    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, profileId: true, status: true },
    })

    if (!ws) throw new Error(`Workspace ${workspaceId} not found`)
    if (ws.profileId !== ctx.profileId) {
        throw new Error(`Workspace ${workspaceId} does not belong to profile ${ctx.profileId}`)
    }
    if ((ws as any).status === 'SOFT_DELETED') {
        throw new Error(`Workspace ${workspaceId} is deleted`)
    }
    if (ctx.allowedWorkspaceIds.length > 0 && !ctx.allowedWorkspaceIds.includes(workspaceId)) {
        throw new Error(`Workspace ${workspaceId} not in MCP whitelist`)
    }

    return ws
}

/**
 * List all workspaces accessible by this MCP instance.
 */
export async function listAccessibleWorkspaces() {
    const ctx = getMcpAuthContext()

    const where: any = {
        profileId: ctx.profileId,
        status: 'ACTIVE',
    }
    if (ctx.allowedWorkspaceIds.length > 0) {
        where.id = { in: ctx.allowedWorkspaceIds }
    }

    return prisma.workspace.findMany({
        where,
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    })
}
