'use server'

import { getWorkspacePrisma } from "@/lib/prisma-workspace"
import { verifyWorkspaceAccess } from "@/lib/security"
import { revalidatePath } from 'next/cache'

export async function getAnalyticsData(workspaceId: string) {
    try {
        const { user } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const currentProfileId = (user as any).sessionProfileId || undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, currentProfileId)

    const completedTasksAggregate = await workspacePrisma.task.groupBy({
        by: ['assigneeId'],
        where: {
            status: { in: ['Hoàn tất', 'Revision'] },
            assigneeId: { not: null }
        },
        _count: {
            id: true
        }
    })

    const errorLogsAggregate = await (workspacePrisma as any).errorLog.groupBy({
        by: ['userId'],
        _sum: {
            calculatedScore: true
        }
    })

    const userIds = Array.from(new Set([
        ...completedTasksAggregate.map(t => t.assigneeId as string),
        ...errorLogsAggregate.map((e: any) => e.userId)
    ]))

    if (userIds.length === 0) return []

    const users = await workspacePrisma.user.findMany({
        where: { id: { in: userIds } },
        select: { 
            id: true, 
            username: true,
            hasAcceptedTerms: true,
            termsAcceptedAt: true
        }
    })

    const analyticsData = users.map(u => {
        const taskCount = completedTasksAggregate.find(t => t.assigneeId === u.id)?._count.id || 0
        const totalPenalty = errorLogsAggregate.find((e: any) => e.userId === u.id)?._sum.calculatedScore || 0
        
        // Calculate Error Rate: if 0 tasks, rate is set to the penalty count to highlight issues
        const errorRate = taskCount > 0 ? Number((totalPenalty / taskCount).toFixed(2)) : (totalPenalty > 0 ? totalPenalty : 0)

        // Rank Logic:
        // S: Rate < 0.3
        // A: Rate < 0.6
        // B: Rate < 1.0
        // C: Rate < 1.5
        // D: Rate >= 1.5 or (0 tasks but has penalties)
        let rank = 'S'
        if (taskCount >= 8) {
            if (errorRate < 0.3) rank = 'S'
            else if (errorRate < 0.6) rank = 'A'
            else if (errorRate < 1.0) rank = 'B'
            else if (errorRate < 1.5) rank = 'C'
            else rank = 'D'
        } else if (taskCount > 0) {
            // Low volume but still check rate
            if (errorRate < 1.0) rank = 'N/A' 
            else rank = 'D'
        } else if (totalPenalty > 0) {
            rank = 'D' // Errors with 0 tasks is always D
        } else {
            rank = 'N/A'
        }

        return {
            id: u.id,
            username: u.username,
            completedTasks: taskCount,
            totalPenalty: totalPenalty,
            errorRate,
            rank,
            hasAcceptedTerms: u.hasAcceptedTerms,
            termsAcceptedAt: u.termsAcceptedAt ? u.termsAcceptedAt.toISOString() : null
        }
    })

    return analyticsData
    } catch(e) {
        return []
    }
}

export async function getUserErrorDetails(workspaceId: string, userId: string) {
    try {
        const { user, isGlobalAdmin } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        if (!isGlobalAdmin && user.id !== userId) return []
        const currentProfileId = (user as any).sessionProfileId || undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, currentProfileId)

    const dict = await (workspacePrisma as any).errorDictionary.findMany({
        where: { isActive: true }
    })

    const errorLogsGrouped = await (workspacePrisma as any).errorLog.groupBy({
        by: ['errorId'],
        where: { userId }, // Removed redundant workspaceId as prisma extension handles it
        _sum: { frequency: true, calculatedScore: true }
    })

    const dictMap = new Map(dict.map((entry: any) => [entry.id, entry]))
    const logMap = new Map(errorLogsGrouped.map((entry: any) => [entry.errorId, entry]))
    
    // Logic: Duyệt qua TOÀN BỘ từ điển lỗi để đảm bảo mọi loại lỗi đều xuất hiện
    const details = dict.map((d: any) => {
        const logEntry = logMap.get(d.id) as { _sum: { frequency: number; calculatedScore: number } } | undefined

        return {
            errorId: d.id,
            code: d.code,
            description: d.description,
            totalFrequency: logEntry?._sum.frequency || 0,
            totalPenalty: logEntry?._sum.calculatedScore || 0
        }
    })

    return details.sort((a: any, b: any) => {
        // Ưu tiên lỗi có vi phạm (frequency > 0) lên đầu
        if ((b.totalFrequency > 0 ? 1 : 0) !== (a.totalFrequency > 0 ? 1 : 0)) {
            return (b.totalFrequency > 0 ? 1 : 0) - (a.totalFrequency > 0 ? 1 : 0)
        }
        // Sau đó sắp xếp theo tần suất giảm dần
        if (b.totalFrequency !== a.totalFrequency) return b.totalFrequency - a.totalFrequency
        // Cuối cùng theo mã lỗi
        return a.code.localeCompare(b.code)
    })
    } catch(e) {
        return []
    }
}

export async function getUserPerformanceScore(workspaceId: string, userId: string) {
    try {
        const { user, isGlobalAdmin } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        if (!isGlobalAdmin && user.id !== userId) return null
        const currentProfileId = (user as any).sessionProfileId || undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, currentProfileId)

    const taskCount = await workspacePrisma.task.count({
        where: {
            assigneeId: userId,
            status: { in: ['Hoàn tất', 'Revision'] }
        }
    })

    const errorSum = await (workspacePrisma as any).errorLog.aggregate({
        _sum: { calculatedScore: true },
        where: { userId }
    })

    const totalPenalty = errorSum._sum.calculatedScore || 0
    const errorRate = taskCount > 0 ? Number((totalPenalty / taskCount).toFixed(2)) : (totalPenalty > 0 ? totalPenalty : 0)

    // Match the rank logic from getAnalyticsData
    let rank = 'S'
    if (taskCount >= 8) {
        if (errorRate < 0.3) rank = 'S'
        else if (errorRate < 0.6) rank = 'A'
        else if (errorRate < 1.0) rank = 'B'
        else if (errorRate < 1.5) rank = 'C'
        else rank = 'D'
    } else if (taskCount > 0) {
        if (errorRate < 1.0) rank = 'N/A' 
        else rank = 'D'
    } else if (totalPenalty > 0) {
        rank = 'D'
    } else {
        rank = 'N/A'
    }

    return {
        taskCount,
        totalPenalty,
        errorRate,
        rank
    }
    } catch(e) {
        console.error('[getUserPerformanceScore Error]', e)
        return {
            taskCount: 0,
            totalPenalty: 0,
            errorRate: 0,
            rank: 'N/A'
        }
    }
}

export async function getStaffErrorLogsDetail(workspaceId: string, userId: string) {
    try {
        const { user, isGlobalAdmin } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        if (!isGlobalAdmin && user.id !== userId) return []
        const currentProfileId = (user as any).sessionProfileId || undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, currentProfileId)

    const logs = await (workspacePrisma as any).errorLog.findMany({
        where: { userId },
        include: {
            task: {
                select: { id: true, title: true, client: { select: { name: true } }, project: { select: { name: true } } }
            },
            error: {
                select: { code: true, description: true }
            },
            detectedBy: {
                select: { username: true, nickname: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    // Group logs by taskId
    const taskMap = new Map<string, any>()

    for (const log of logs) {
        if (!log.task) continue

        if (!taskMap.has(log.taskId)) {
            taskMap.set(log.taskId, {
                taskId: log.taskId,
                taskTitle: log.task.title,
                clientName: log.task.client?.name || null,
                projectName: log.task.project?.name || null,
                latestErrorAt: log.createdAt.toISOString(),
                totalPenalty: 0,
                errors: []
            })
        }

        const taskEntry = taskMap.get(log.taskId)
        taskEntry.totalPenalty += Number(log.calculatedScore || 0)
        taskEntry.errors.push({
            id: log.id,
            errorCode: log.error.code,
            errorDescription: log.error.description,
            frequency: Number(log.frequency || 0),
            penalty: Number(log.calculatedScore || 0),
            detectedBy: log.detectedBy?.nickname || log.detectedBy?.username || 'Hệ thống',
            createdAt: log.createdAt.toISOString()
        })
    }

    return Array.from(taskMap.values())
    } catch(e) {
        return []
    }
}

export async function removeErrorLog(workspaceId: string, errorLogId: string) {
    try {
        const { user, workspaceRole, isGlobalAdmin } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        if (!isGlobalAdmin && workspaceRole !== 'ADMIN') {
            return { success: false, error: 'Unauthorized' }
        }

        const currentProfileId = (user as any).sessionProfileId || undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, currentProfileId)

        await (workspacePrisma as any).errorLog.delete({
            where: { id: errorLogId }
        })
        
        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true }
    } catch (e: any) {
        console.error('[Remove ErrorLog Error]', e)
        return { success: false, error: e.message || 'Database error' }
    }
}
