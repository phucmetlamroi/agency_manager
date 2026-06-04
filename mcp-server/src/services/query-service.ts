/**
 * Read-only query service for MCP server.
 * Provides workspace listing, stats, user listing, search, and dashboard summaries.
 */
import { prisma } from '../prisma-client.js'
import { validateWorkspaceAccess, listAccessibleWorkspaces } from '../auth-context.js'
import { getWorkspacePrisma } from '../workspace-scoping.js'
import { VALID_TASK_STATUSES, SALARY_COMPLETED_STATUS } from './statuses.js'

// ---------------------------------------------------------------------------
// listWorkspaces
// ---------------------------------------------------------------------------

export async function listWorkspaces() {
    return listAccessibleWorkspaces()
}

// ---------------------------------------------------------------------------
// getWorkspaceStats
// ---------------------------------------------------------------------------

export async function getWorkspaceStats(
    wsId: string,
    profileId: string,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    // Run aggregations in parallel
    const [statusCounts, revenueAgg, completedCount] = await Promise.all([
        // Task count grouped by status
        wsPrisma.task.groupBy({
            by: ['status'],
            _count: { id: true },
            where: { isArchived: false },
        }),
        // Total revenue (sum of jobPriceUSD across all non-archived tasks)
        wsPrisma.task.aggregate({
            _sum: { jobPriceUSD: true },
            where: { isArchived: false },
        }),
        // Completed task count
        wsPrisma.task.count({
            where: { status: SALARY_COMPLETED_STATUS, isArchived: false },
        }),
    ])

    // Format status counts into a map
    const statusBreakdown: Record<string, number> = {}
    let totalTasks = 0
    for (const row of statusCounts) {
        statusBreakdown[row.status] = row._count.id
        totalTasks += row._count.id
    }

    return {
        totalTasks,
        completedCount,
        totalRevenueUSD: Number(revenueAgg._sum.jobPriceUSD ?? 0),
        statusBreakdown,
    }
}

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

export async function listUsers(
    wsId: string,
    profileId: string,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    const users = await wsPrisma.user.findMany({
        select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            role: true,
            avatarUrl: true,
            createdAt: true,
        },
        orderBy: { username: 'asc' },
    })

    return users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName ?? null,
        email: u.email ?? null,
        role: u.role,
        avatarUrl: u.avatarUrl ?? null,
        createdAt: u.createdAt.toISOString(),
    }))
}

// ---------------------------------------------------------------------------
// searchTasks
// ---------------------------------------------------------------------------

export interface SearchTasksFilters {
    status?: string
    assigneeId?: string
    limit?: number
}

export async function searchTasks(
    wsId: string,
    profileId: string,
    query: string,
    filters?: SearchTasksFilters,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    if (!query || query.trim().length === 0) {
        throw new Error('Search query must not be empty')
    }

    const where: Record<string, any> = {
        title: { contains: query.trim(), mode: 'insensitive' },
        isArchived: false,
    }

    if (filters?.status) {
        where.status = filters.status
    }
    if (filters?.assigneeId) {
        where.assigneeId = filters.assigneeId
    }

    const limit = Math.min(filters?.limit ?? 25, 100)

    const tasks = await wsPrisma.task.findMany({
        where,
        include: {
            client: { select: { id: true, name: true } },
            assignee: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
    })

    return tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        type: t.type,
        deadline: t.deadline?.toISOString() ?? null,
        jobPriceUSD: Number(t.jobPriceUSD ?? 0),
        assigneeId: t.assigneeId ?? null,
        clientId: t.clientId ?? null,
        client: t.client ? { id: t.client.id, name: t.client.name } : null,
        assignee: t.assignee
            ? { id: t.assignee.id, username: t.assignee.username, displayName: t.assignee.displayName ?? null }
            : null,
        updatedAt: t.updatedAt?.toISOString() ?? null,
    }))
}

// ---------------------------------------------------------------------------
// getDashboardSummary
// ---------------------------------------------------------------------------

export async function getDashboardSummary(
    wsId: string,
    profileId: string,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    // Run all queries in parallel
    const [
        totalTasks,
        overdueCount,
        completedToday,
        pendingAssignments,
        upcomingDeadlines,
    ] = await Promise.all([
        // Total non-archived tasks
        wsPrisma.task.count({
            where: { isArchived: false },
        }),

        // Overdue: deadline is past AND status is not completed/cancelled
        wsPrisma.task.count({
            where: {
                isArchived: false,
                deadline: { lt: now },
                status: { notIn: ['Hoàn tất', 'Đã hủy'] },
            },
        }),

        // Completed today (updatedAt within today and status = completed)
        wsPrisma.task.count({
            where: {
                status: SALARY_COMPLETED_STATUS,
                updatedAt: { gte: todayStart, lt: todayEnd },
            },
        }),

        // Tasks waiting for assignment (queue status, no assignee)
        wsPrisma.task.count({
            where: {
                isArchived: false,
                status: 'Đang đợi giao',
                assigneeId: null,
            },
        }),

        // Top 5 upcoming deadlines (future deadlines, not completed/cancelled)
        wsPrisma.task.findMany({
            where: {
                isArchived: false,
                deadline: { gte: now },
                status: { notIn: ['Hoàn tất', 'Đã hủy'] },
            },
            select: {
                id: true,
                title: true,
                deadline: true,
                status: true,
                assignee: { select: { id: true, username: true, displayName: true } },
            },
            orderBy: { deadline: 'asc' },
            take: 5,
        }),
    ])

    return {
        totalTasks,
        overdueCount,
        completedToday,
        pendingAssignments,
        upcomingDeadlines: upcomingDeadlines.map((t) => ({
            id: t.id,
            title: t.title,
            deadline: t.deadline?.toISOString() ?? null,
            status: t.status,
            assignee: t.assignee
                ? { id: t.assignee.id, username: t.assignee.username, displayName: t.assignee.displayName ?? null }
                : null,
        })),
    }
}
