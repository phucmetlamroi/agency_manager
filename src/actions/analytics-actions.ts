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
        const errorRate = taskCount >= 8 ? Number((totalPenalty / taskCount).toFixed(2)) : 0

        let rank = 'S'
        if (taskCount >= 8) {
            if (errorRate < 0.3) rank = 'S'
            else if (errorRate < 0.6) rank = 'A'
            else if (errorRate < 1.0) rank = 'B'
            else if (errorRate < 1.5) rank = 'C'
            else rank = 'D'
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
        where: { userId, workspaceId },
        _sum: { frequency: true, calculatedScore: true }
    })

    const dictMap = new Map(dict.map((entry: any) => [entry.id, entry]))
    const logMap = new Map(errorLogsGrouped.map((entry: any) => [entry.errorId, entry]))
    const uniqueErrorIds = Array.from(new Set([...dictMap.keys(), ...logMap.keys()]))

    const details = uniqueErrorIds.map((errorId) => {
        const dictionaryEntry = dictMap.get(errorId)
        const logEntry = logMap.get(errorId)

        return {
            errorId,
            code: dictionaryEntry?.code ?? `#${errorId.slice(0, 6).toUpperCase()}`,
            description: dictionaryEntry?.description ?? 'Lỗi chưa được định nghĩa',
            totalFrequency: logEntry?._sum.frequency || 0,
            totalPenalty: logEntry?._sum.calculatedScore || 0
        }
    })

    return details
        .filter((detail) => detail.totalFrequency > 0)
        .sort((a, b) => {
            if (b.totalFrequency !== a.totalFrequency) {
                return b.totalFrequency - a.totalFrequency
            }

            return a.code.localeCompare(b.code)
        })
}
