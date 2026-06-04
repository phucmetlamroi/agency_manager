/**
 * MCP Tool definitions for read-only queries and reporting.
 * Registers: list_workspaces, get_workspace_stats, list_users, search_tasks, get_dashboard_summary
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getMcpAuthContext } from '../auth-context.js'
import {
    listWorkspaces,
    getWorkspaceStats,
    listUsers,
    searchTasks,
    getDashboardSummary,
} from '../services/query-service.js'

export function registerQueryTools(server: McpServer) {

    // ── list_workspaces ─────────────────────────────────────────────────
    server.tool(
        'list_workspaces',
        'List all workspaces accessible by the current MCP profile. Returns workspace IDs, names, and creation dates. No parameters required.',
        {},
        async () => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await listWorkspaces()
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── get_workspace_stats ─────────────────────────────────────────────
    server.tool(
        'get_workspace_stats',
        'Get aggregate statistics for a workspace: task counts by status, member count, active client count, and completion rates.',
        {
            workspaceId: z.string().describe('ID of the workspace to get statistics for'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await getWorkspaceStats(
                    params.workspaceId,
                    profileId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── list_users ──────────────────────────────────────────────────────
    server.tool(
        'list_users',
        'List users/members. If workspaceId is provided, lists members of that workspace. If omitted, lists all users accessible by the MCP profile.',
        {
            workspaceId: z.string().optional().describe('Optional workspace ID to scope the user list. If omitted, returns all users in the profile.'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                if (!params.workspaceId) {
                    throw new Error('workspaceId is required for list_users')
                }
                const result = await listUsers(
                    params.workspaceId,
                    profileId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── search_tasks ────────────────────────────────────────────────────
    server.tool(
        'search_tasks',
        'Full-text search across tasks by title, notes, or client name. Can be scoped to a single workspace or search across all accessible workspaces. Supports status and assignee filters.',
        {
            query: z.string().min(1).describe('Search query string to match against task titles, notes, and client names'),
            workspaceId: z.string().optional().describe('Optional workspace ID to scope the search. If omitted, searches all accessible workspaces.'),
            status: z.string().optional().describe('Optional status filter to narrow results'),
            assigneeId: z.string().optional().describe('Optional assignee filter to narrow results'),
            limit: z.number().int().min(1).max(100).default(20).describe('Max number of results to return. Defaults to 20.'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                if (!params.workspaceId) {
                    throw new Error('workspaceId is required for search_tasks')
                }
                const result = await searchTasks(
                    params.workspaceId,
                    profileId,
                    params.query,
                    {
                        status: params.status,
                        assigneeId: params.assigneeId,
                        limit: params.limit,
                    },
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )

    // ── get_dashboard_summary ───────────────────────────────────────────
    server.tool(
        'get_dashboard_summary',
        'Get a high-level dashboard summary for a workspace: task breakdown by status, overdue tasks, recent activity, top assignees by workload, and financial summaries.',
        {
            workspaceId: z.string().describe('ID of the workspace to generate the dashboard summary for'),
        },
        async (params) => {
            try {
                const { profileId } = getMcpAuthContext()
                const result = await getDashboardSummary(
                    params.workspaceId,
                    profileId,
                )
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message ?? err}` }], isError: true }
            }
        },
    )
}
