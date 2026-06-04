/**
 * MCP Tool definitions for bulk operations on tasks.
 * Registers: bulk_update_details, bulk_update_status
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getMcpAuthContext } from '../auth-context.js'
import { updateTaskDetails } from '../services/task-service.js'
import { updateTaskStatus } from '../services/status-service.js'
import { VALID_TASK_STATUSES } from '../services/statuses.js'

export function registerBulkOpsTools(server: McpServer) {

    // ── bulk_update_details ─────────────────────────────────────────────
    server.tool(
        'bulk_update_details',
        'Update details (type, assignee, deadline, pricing, notes, etc.) for multiple tasks at once. All tasks must belong to the same workspace. The assigneeId/status invariant is enforced per task. Returns per-task results including individual successes and failures.',
        {
            workspaceId: z.string().describe('ID of the workspace all tasks belong to'),
            taskIds: z.array(z.string()).min(1).describe('Array of task IDs to update'),
            updates: z.object({
                type: z.enum(['Short', 'Long', 'Trial']).optional().describe('New task type'),
                assigneeId: z.string().nullable().optional().describe('New assignee user ID, or null to unassign'),
                deadline: z.string().nullable().optional().describe('New deadline as ISO 8601 date string, or null to clear'),
                jobPriceUSD: z.number().nullable().optional().describe('New job price in USD, or null to clear'),
                value: z.number().nullable().optional().describe('New task value / payout, or null to clear'),
                productLink: z.string().nullable().optional().describe('Product link URL, or null to clear'),
                resources: z.string().nullable().optional().describe('Resources text, or null to clear'),
                references: z.string().nullable().optional().describe('References text, or null to clear'),
                notes: z.string().nullable().optional().describe('Notes text, or null to clear'),
            }).describe('Object containing the fields to update. Only provided fields are changed.'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const results: Array<{ taskId: string; success: boolean; data?: any; error?: string }> = []

                for (const taskId of params.taskIds) {
                    try {
                        const data = await updateTaskDetails(
                            params.workspaceId,
                            profileId,
                            taskId,
                            params.updates,
                        )
                        results.push({ taskId, success: true, data })
                    } catch (err: any) {
                        results.push({ taskId, success: false, error: err.message ?? String(err) })
                    }
                }

                const summary = {
                    total: params.taskIds.length,
                    succeeded: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length,
                    results,
                }
                return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── bulk_update_status ──────────────────────────────────────────────
    server.tool(
        'bulk_update_status',
        `Transition multiple tasks to the same new status in one operation. All tasks must belong to the same workspace. Valid statuses: ${VALID_TASK_STATUSES.join(', ')}. The assigneeId/status invariant is enforced per task. Returns per-task results.`,
        {
            workspaceId: z.string().describe('ID of the workspace all tasks belong to'),
            taskIds: z.array(z.string()).min(1).describe('Array of task IDs to update'),
            newStatus: z.string().describe(
                `New status for all tasks. Must be one of: ${VALID_TASK_STATUSES.join(', ')}`,
            ),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const results: Array<{ taskId: string; success: boolean; data?: any; error?: string }> = []

                for (const taskId of params.taskIds) {
                    try {
                        const data = await updateTaskStatus(
                            params.workspaceId,
                            profileId,
                            taskId,
                            params.newStatus,
                        )
                        results.push({ taskId, success: true, data })
                    } catch (err: any) {
                        results.push({ taskId, success: false, error: err.message ?? String(err) })
                    }
                }

                const summary = {
                    total: params.taskIds.length,
                    succeeded: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length,
                    results,
                }
                return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )
}
