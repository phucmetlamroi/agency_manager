/**
 * MCP Tool definitions for task status transitions and history.
 * Registers: update_task_status, get_status_history
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getMcpAuthContext } from '../auth-context.js'
import { updateTaskStatus, getStatusHistory } from '../services/status-service.js'
import { VALID_TASK_STATUSES } from '../services/statuses.js'

export function registerTaskStatusTools(server: McpServer) {

    // ── update_task_status ──────────────────────────────────────────────
    server.tool(
        'update_task_status',
        `Transition a task to a new status. The status must be one of the valid statuses: ${VALID_TASK_STATUSES.join(', ')}. The assigneeId/status invariant is enforced automatically (e.g. unassigned tasks revert to queue status).`,
        {
            workspaceId: z.string().describe('ID of the workspace the task belongs to'),
            taskId: z.string().describe('ID of the task to update'),
            newStatus: z.string().describe(
                `New status for the task. Must be one of: ${VALID_TASK_STATUSES.join(', ')}`,
            ),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await updateTaskStatus(
                    params.workspaceId,
                    profileId,
                    params.taskId,
                    params.newStatus,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── get_status_history ──────────────────────────────────────────────
    server.tool(
        'get_status_history',
        'Retrieve the full status transition history for a task, ordered chronologically. Each entry includes the old status, new status, timestamp, and who made the change.',
        {
            workspaceId: z.string().describe('ID of the workspace the task belongs to'),
            taskId: z.string().describe('ID of the task to get history for'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await getStatusHistory(
                    params.workspaceId,
                    params.taskId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )
}
