/**
 * MCP Tool definitions for core Task CRUD operations.
 * Registers: create_task, get_task, list_tasks, delete_task
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getMcpAuthContext } from '../auth-context.js'
import { createTask, getTask, listTasks, deleteTask } from '../services/task-service.js'

export function registerTaskCrudTools(server: McpServer) {

    // ── create_task ─────────────────────────────────────────────────────
    server.tool(
        'create_task',
        'Create a new task in a workspace. Requires MCP profile access to the target workspace. Returns the created task object.',
        {
            workspaceId: z.string().describe('ID of the workspace to create the task in'),
            title: z.string().min(1).describe('Title of the task'),
            clientId: z.string().describe('ID of the client this task belongs to'),
            type: z.enum(['Short', 'Long', 'Trial']).optional().describe('Task type — Short, Long, or Trial'),
            assigneeId: z.string().optional().describe('User ID to assign the task to. If omitted, task enters the queue.'),
            deadline: z.string().optional().describe('ISO 8601 date string for the task deadline'),
            jobPriceUSD: z.number().optional().describe('Job price in USD'),
            value: z.number().optional().describe('Task value / payout amount'),
            notes: z.string().optional().describe('Free-form notes for the task'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await createTask(
                    params.workspaceId,
                    profileId,
                    {
                        title: params.title,
                        clientId: Number(params.clientId),
                        type: params.type,
                        assigneeId: params.assigneeId,
                        deadline: params.deadline,
                        jobPriceUSD: params.jobPriceUSD,
                        value: params.value,
                        notes: params.notes,
                    },
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── get_task ─────────────────────────────────────────────────────────
    server.tool(
        'get_task',
        'Retrieve a single task by ID within a workspace. Returns full task details including assignee, client, and status history.',
        {
            workspaceId: z.string().describe('ID of the workspace the task belongs to'),
            taskId: z.string().describe('ID of the task to retrieve'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await getTask(
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

    // ── list_tasks ──────────────────────────────────────────────────────
    server.tool(
        'list_tasks',
        'List tasks in a workspace with optional filters. Supports pagination via limit/offset. Returns an array of task summaries.',
        {
            workspaceId: z.string().describe('ID of the workspace to list tasks from'),
            status: z.string().optional().describe('Filter by task status (e.g. "Hoàn tất", "Đang thực hiện")'),
            assigneeId: z.string().optional().describe('Filter by assigned user ID'),
            clientId: z.string().optional().describe('Filter by client ID'),
            isArchived: z.boolean().default(false).describe('Include archived tasks. Defaults to false.'),
            limit: z.number().int().min(1).max(200).default(50).describe('Max number of tasks to return. Defaults to 50.'),
            offset: z.number().int().min(0).default(0).describe('Number of tasks to skip for pagination. Defaults to 0.'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await listTasks(
                    params.workspaceId,
                    profileId,
                    {
                        status: params.status,
                        assigneeId: params.assigneeId,
                        clientId: params.clientId ? Number(params.clientId) : undefined,
                        isArchived: params.isArchived,
                        limit: params.limit,
                        offset: params.offset,
                    },
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── delete_task ─────────────────────────────────────────────────────
    server.tool(
        'delete_task',
        'Delete a task from a workspace. This is a permanent operation. Requires MCP profile access to the workspace.',
        {
            workspaceId: z.string().describe('ID of the workspace the task belongs to'),
            taskId: z.string().describe('ID of the task to delete'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await deleteTask(
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
