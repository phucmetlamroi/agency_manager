'use server'

import { getWorkspacePrisma } from "@/lib/prisma-workspace"
import { getSession } from "@/lib/auth"

export async function getAnalyticsData(workspaceId: string) {
    const session = await getSession()
    if (!session || !session.user) return []
    const workspacePrisma = getWorkspacePrisma(workspaceId, session.user.sessionProfileId || undefined)

    // 1. Fetch completed tasks aggregation by assignee
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

    // 2. Fetch sum of penalties by user
    const errorLogsAggregate = await (workspacePrisma as any).errorLog.groupBy({
        by: ['userId'],
        _sum: {
            calculatedScore: true
        }
    })

    // 3. Collect unique User IDs
    const userIds = Array.from(new Set([
        ...completedTasksAggregate.map(t => t.assigneeId as string),
        ...errorLogsAggregate.map((e: any) => e.userId)
    ]))

    if (userIds.length === 0) return []

    const users = await workspacePrisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true }
    })

    // 4. Combine data and calculate Error Rate & Rank
    const analyticsData = users.map(u => {
        const taskCount = completedTasksAggregate.find(t => t.assigneeId === u.id)?._count.id || 0
        const totalPenalty = errorLogsAggregate.find((e: any) => e.userId === u.id)?._sum.calculatedScore || 0
        const errorRate = taskCount >= 8 ? Number((totalPenalty / taskCount).toFixed(2)) : 0
        
        let rank = 'S' 
        if (taskCount >= 8) {
             if (errorRate < 0.3) rank = 'S'
             else if (errorRate < 0.6) rank = 'A'
             else if (errorRate < 1.0) rank = 'B'
             else if (errorRate < 1.5) rank = 'C'
             else rank = 'D'
        } else {
             rank = 'N/A' // Not enough volume
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

    // 1. Lấy toàn bộ từ điển lỗi hoạt động
    const dict = await (workspacePrisma as any).errorDictionary.findMany({
        where: { isActive: true }
    })

    // 2. Nhóm các lỗi thực tế của user
    const errorLogsGrouped = await (workspacePrisma as any).errorLog.groupBy({
        by: ['errorId'],
        where: { userId, workspaceId },
        _sum: { frequency: true, calculatedScore: true }
    })

    // 3. Trộn dữ liệu: Hiển thị 0 cho các lỗi không có trong log
    return dict.map((d: any) => {
        const log = errorLogsGrouped.find((e: any) => e.errorId === d.id)
        return {
            errorId: d.id,
            code: d.code,
            description: d.description,
            totalFrequency: log?._sum.frequency || 0,
            totalPenalty: log?._sum.calculatedScore || 0
        }
    }).sort((a: any, b: any) => {
        // Ưu tiên lỗi có tần suất cao lên đầu, sau đó đến mã lỗi
        if (b.totalFrequency !== a.totalFrequency) {
            return b.totalFrequency - a.totalFrequency
        }
        return a.code.localeCompare(b.code)
    })
}
