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
}
