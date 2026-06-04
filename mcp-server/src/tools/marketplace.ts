/**
 * MCP Tool definitions for the task marketplace.
 * Registers: toggle_marketplace, list_marketplace_tasks, claim_task, return_task
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getMcpAuthContext } from '../auth-context.js'
import { toggleMarketplace, listMarketplaceTasks, claimTask, returnTask } from '../services/marketplace-service.js'

export function registerMarketplaceTools(server: McpServer) {

    // ── toggle_marketplace ──────────────────────────────────────────────
    server.tool(
        'toggle_marketplace',
        'Enable or disable the task marketplace for a workspace. When enabled, unassigned tasks become visible in the marketplace for workspace members to claim. Requires workspace admin-level MCP access.',
        {
            workspaceId: z.string().describe('ID of the workspace to toggle marketplace for'),
            enabled: z.boolean().describe('Set to true to enable the marketplace, false to disable'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await toggleMarketplace(
                    params.workspaceId,
                    params.enabled,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── list_marketplace_tasks ──────────────────────────────────────────
    server.tool(
        'list_marketplace_tasks',
        'List all tasks currently available in the workspace marketplace. Only returns unassigned tasks in the queue that are eligible for claiming.',
        {
            workspaceId: z.string().describe('ID of the workspace to list marketplace tasks from'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await listMarketplaceTasks(
                    params.workspaceId,
                    profileId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── claim_task ──────────────────────────────────────────────────────
    server.tool(
        'claim_task',
        'Claim a marketplace task for a specific user. The task must be in the marketplace (unassigned, queue status). After claiming, the task is assigned to the user and its status transitions out of the queue.',
        {
            workspaceId: z.string().describe('ID of the workspace the task belongs to'),
            taskId: z.string().describe('ID of the marketplace task to claim'),
            userId: z.string().describe('User ID of the person claiming the task'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await claimTask(
                    params.workspaceId,
                    profileId,
                    params.taskId,
                    params.userId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── return_task ─────────────────────────────────────────────────────
    server.tool(
        'return_task',
        'Return a previously claimed task back to the marketplace. The task is unassigned and its status reverts to the queue. The deadline is cleared automatically.',
        {
            workspaceId: z.string().describe('ID of the workspace the task belongs to'),
            taskId: z.string().describe('ID of the task to return to the marketplace'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await returnTask(
                    params.workspaceId,
                    profileId,
                    params.taskId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )
}
