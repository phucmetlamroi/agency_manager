/**
 * MCP Tool definitions for task assignment operations.
 * Registers: assign_task, unassign_task, bulk_assign_tasks
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getMcpAuthContext } from '../auth-context.js'
import { assignTask, unassignTask, bulkAssignTasks } from '../services/assign-service.js'

export function registerTaskAssignTools(server: McpServer) {

    // ── assign_task ─────────────────────────────────────────────────────
    server.tool(
        'assign_task',
        'Assign a task to a specific user. The task status will be automatically updated from queue status to "Nhận task" if needed (assigneeId/status invariant). The assignee must be a member of the workspace.',
        {
            workspaceId: z.string().describe('ID of the workspace the task belongs to'),
            taskId: z.string().describe('ID of the task to assign'),
            assigneeId: z.string().describe('User ID of the person to assign the task to'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await assignTask(
                    params.workspaceId,
                    profileId,
                    params.taskId,
                    params.assigneeId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── unassign_task ───────────────────────────────────────────────────
    server.tool(
        'unassign_task',
        'Remove the current assignee from a task. The task status will be automatically reverted to queue status ("Đang đợi giao") and deadline cleared per the assigneeId/status invariant.',
        {
            workspaceId: z.string().describe('ID of the workspace the task belongs to'),
            taskId: z.string().describe('ID of the task to unassign'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await unassignTask(
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

    // ── bulk_assign_tasks ───────────────────────────────────────────────
    server.tool(
        'bulk_assign_tasks',
        'Assign multiple tasks to a single user in one operation. All tasks must belong to the same workspace. The assigneeId/status invariant is enforced for each task. Returns results per task including any individual failures.',
        {
            workspaceId: z.string().describe('ID of the workspace all tasks belong to'),
            taskIds: z.array(z.string()).min(1).describe('Array of task IDs to assign'),
            assigneeId: z.string().describe('User ID to assign all tasks to'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await bulkAssignTasks(
                    params.workspaceId,
                    profileId,
                    params.taskIds,
                    params.assigneeId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )
}
