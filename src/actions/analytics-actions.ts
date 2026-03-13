'use server'

import { getWorkspacePrisma } from "@/lib/prisma-workspace"
import { getSession } from "@/lib/auth"

export async function getAnalyticsData(workspaceId: string) {
    const session = await getSession()
    if (!session || !session.user) return []
    const workspacePrisma = getWorkspacePrisma(workspaceId, session.user.sessionProfileId || undefined)

    const completedTasksAggregate = await workspacePrisma.task.groupBy({
        by: ['assigneeId'],
        where: {
            status: 'Hoàn tất',
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
        select: { id: true, username: true }
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
            totalPenalty,
            errorRate,
            rank
        }
    })

    return analyticsData
}

export async function getUserErrorDetails(workspaceId: string, userId: string) {
    const session = await getSession()
    if (!session || !session.user) return []
    const workspacePrisma = getWorkspacePrisma(workspaceId, session.user.sessionProfileId || undefined)

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
    
    // CRITICAL FIX: Ensure we only iterate over IDs that actually exist in the log for this user
    const loggedErrorIds = errorLogsGrouped.map((e: any) => e.errorId)

    const details = loggedErrorIds.map((errorId: string) => {
        const dictionaryEntry = dictMap.get(errorId) as { code: string; description: string } | undefined
        const logEntry = logMap.get(errorId) as { _sum: { frequency: number; calculatedScore: number } } | undefined

        return {
            errorId,
            code: dictionaryEntry?.code ?? `#${errorId.toString().slice(0, 6).toUpperCase()}`,
            description: dictionaryEntry?.description ?? 'Lỗi chưa được định nghĩa',
            totalFrequency: logEntry?._sum.frequency || 0,
            totalPenalty: logEntry?._sum.calculatedScore || 0
        }
    })

    return details.sort((a: any, b: any) => b.totalFrequency - a.totalFrequency)
}
