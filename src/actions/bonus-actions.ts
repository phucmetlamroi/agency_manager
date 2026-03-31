'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { SALARY_COMPLETED_STATUS, SALARY_PENDING_STATUSES } from '@/lib/task-statuses'

const toSafeNumber = (value: unknown): number => {
    if (value == null) return 0
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    if (typeof value === 'bigint') return Number(value)
    if (typeof value === 'object' && value !== null) {
        const maybeDecimal = value as { toNumber?: () => number; toString?: () => string }
        if (typeof maybeDecimal.toNumber === 'function') {
            const parsed = maybeDecimal.toNumber()
            return Number.isFinite(parsed) ? parsed : 0
        }
        if (typeof maybeDecimal.toString === 'function') {
            const parsed = Number(maybeDecimal.toString())
            return Number.isFinite(parsed) ? parsed : 0
        }
    }
    const fallback = Number(value)
    return Number.isFinite(fallback) ? fallback : 0
}

export async function getPayrollLockStatus(workspaceId: string) {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const lock = await workspacePrisma.payrollLock.findUnique({
            where: {
                month_year_workspaceId: {
                    month: currentMonth,
                    year: currentYear,
                    workspaceId
                }
            } as any
        })
        return { isLocked: lock?.isLocked ?? false }
    } catch {
        return { isLocked: false }
    }
}

export async function revertMonthlyBonus(workspaceId: string) {
    try {
        const session = await getSession()
        if (!session) return { success: false, error: 'Unauthorized' }

        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const workspace = await workspacePrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, profileId: true }
        })
        if (!workspace) return { success: false, error: 'Workspace not found.' }

        const currentUser = await workspacePrisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, role: true, isTreasurer: true }
        })

        if (currentUser?.role !== 'ADMIN' && !currentUser?.isTreasurer) {
            return { success: false, error: 'Permission denied.' }
        }

        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()

        await workspacePrisma.monthlyBonus.deleteMany({
            where: { workspaceId, month: currentMonth, year: currentYear }
        })
        await workspacePrisma.monthlyRank.deleteMany({
            where: { workspaceId, month: currentMonth, year: currentYear }
        })
        await workspacePrisma.payrollLock.deleteMany({
            where: { workspaceId, month: currentMonth, year: currentYear }
        })

        revalidatePath(`/${workspaceId}/admin/payroll`)
        return { success: true, message: 'Da hoan tac va mo khoa ky luong.' }
    } catch (error: any) {
        console.error('Error reverting bonus:', error)
        return { success: false, error: `Failed to revert: ${error?.message || 'Unknown error'}` }
    }
}

/**
 * Ranking algorithm:
 * 1. Primary: incomeScore = max(0, tentativeRevenue - totalPenalty) (DESC)
 * 2. Tie-breaker #1: errorRate (ASC)
 * 3. Tie-breaker #2: rankScore priority (DESC)
 * 4. Tie-breaker #3: tasksCompleted (DESC), then revenue (DESC), then username (ASC)
 */
export async function calculateMonthlyBonus(workspaceId: string) {
    let stage = 'init'
    try {
        stage = 'session'
        const session = await getSession()
        if (!session) return { success: false, error: 'Unauthorized' }

        stage = 'prisma-workspace'
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        stage = 'workspace-find'
        const workspace = await workspacePrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, profileId: true }
        })
        if (!workspace) return { success: false, error: 'Workspace not found.' }

        stage = 'permission-find-user'
        const currentUser = await workspacePrisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, role: true, isTreasurer: true }
        })
        if (currentUser?.role !== 'ADMIN' && !currentUser?.isTreasurer) {
            return { success: false, error: 'Permission denied.' }
        }

        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()
        const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
        const endOfMonth = new Date(currentYear, currentMonth, 5, 23, 59, 59, 999)

        stage = 'lock-check'
        const existingLock = await workspacePrisma.payrollLock.findUnique({
            where: {
                month_year_workspaceId: {
                    month: currentMonth,
                    year: currentYear,
                    workspaceId
                }
            } as any
        })
        if (existingLock?.isLocked) {
            return { success: false, error: 'Ky luong nay da bi khoa.' }
        }

        stage = 'aggregate-completed'
        const completedTaskAggregates = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                workspaceId,
                assigneeId: { not: null },
                status: SALARY_COMPLETED_STATUS,
                updatedAt: { gte: startOfMonth, lte: endOfMonth }
            },
            _sum: { value: true },
            _count: { _all: true }
        })

        const totalTasksFound = completedTaskAggregates.reduce((acc, row) => acc + row._count._all, 0)
        if (totalTasksFound === 0) {
            return { success: false, error: 'Khong co du lieu task hoan tat.' }
        }

        stage = 'aggregate-pending'
        const pendingTaskAggregates = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                workspaceId,
                assigneeId: { not: null },
                status: { in: SALARY_PENDING_STATUSES },
                updatedAt: { gte: startOfMonth, lte: endOfMonth }
            },
            _sum: { value: true }
        })

        // Use calculatedScore directly to avoid fragile relation join with ErrorDictionary.
        stage = 'aggregate-penalty'
        const penaltyAggregates = await workspacePrisma.errorLog.groupBy({
            by: ['userId'],
            where: {
                workspaceId,
                createdAt: { gte: startOfMonth, lte: endOfMonth }
            },
            _sum: { calculatedScore: true }
        })

        const candidateUserIds = Array.from(
            new Set(completedTaskAggregates.map(row => row.assigneeId).filter(Boolean) as string[])
        )
        if (candidateUserIds.length === 0) {
            return { success: false, error: 'Khong tim thay nhan su hop le.' }
        }

        stage = 'users-find-many'
        const users = await workspacePrisma.user.findMany({
            where: {
                id: { in: candidateUserIds },
                username: { not: 'admin' },
                role: { notIn: ['ADMIN', 'CLIENT', 'LOCKED'] }
            },
            select: {
                id: true,
                username: true,
                nickname: true
            }
        })

        const completedByUserId = new Map(
            completedTaskAggregates
                .filter(row => row.assigneeId)
                .map(row => [
                    row.assigneeId as string,
                    {
                        tasksCompleted: row._count._all,
                        revenue: toSafeNumber(row._sum.value)
                    }
                ])
        )
        const pendingByUserId = new Map(
            pendingTaskAggregates
                .filter(row => row.assigneeId)
                .map(row => [row.assigneeId as string, toSafeNumber(row._sum.value)])
        )
        const penaltyByUserId = new Map(
            penaltyAggregates.map(row => [row.userId, toSafeNumber(row._sum.calculatedScore)])
        )

        interface UserRanking {
            userId: string
            username: string
            revenue: number
            pendingRevenue: number
            tentativeRevenue: number
            tasksCompleted: number
            monthlySalary: number
            totalPenalty: number
            errorRate: number
            rankScore: string
            incomeScore: number
        }

        const rankPriority = (rank: string) => {
            if (rank === 'S') return 5
            if (rank === 'A') return 4
            if (rank === 'B') return 3
            if (rank === 'C') return 2
            if (rank === 'D') return 1
            return 0
        }

        const rankings: UserRanking[] = []
        for (const user of users) {
            const completed = completedByUserId.get(user.id)
            if (!completed || completed.tasksCompleted <= 0) continue

            const revenue = completed.revenue
            const tasksCompleted = completed.tasksCompleted
            const pendingRevenue = pendingByUserId.get(user.id) || 0
            const totalPenalty = penaltyByUserId.get(user.id) || 0
            const tentativeRevenue = revenue + pendingRevenue
            const errorRate = tasksCompleted >= 8 ? Number((totalPenalty / tasksCompleted).toFixed(2)) : 0

            let rankScore = 'UNRANKED'
            if (tasksCompleted >= 8) {
                if (errorRate < 0.3) rankScore = 'S'
                else if (errorRate <= 0.6) rankScore = 'A'
                else if (errorRate <= 1.0) rankScore = 'B'
                else if (errorRate <= 1.5) rankScore = 'C'
                else rankScore = 'D'
            }

            rankings.push({
                userId: user.id,
                username: user.nickname || user.username,
                revenue,
                pendingRevenue,
                tentativeRevenue,
                tasksCompleted,
                monthlySalary: revenue,
                totalPenalty,
                errorRate,
                rankScore,
                incomeScore: Math.max(0, tentativeRevenue - totalPenalty)
            })
        }

        if (rankings.length === 0) {
            return { success: false, error: 'Khong co nhan su hop le de xep hang.' }
        }

        stage = 'sort-rankings'
        rankings.sort((a, b) => {
            if (Math.abs(b.incomeScore - a.incomeScore) > 0.01) return b.incomeScore - a.incomeScore
            if (a.errorRate !== b.errorRate) return a.errorRate - b.errorRate

            const aRank = rankPriority(a.rankScore)
            const bRank = rankPriority(b.rankScore)
            if (aRank !== bRank) return bRank - aRank

            if (b.tasksCompleted !== a.tasksCompleted) return b.tasksCompleted - a.tasksCompleted
            if (Math.abs(b.revenue - a.revenue) > 0.01) return b.revenue - a.revenue
            return a.username.localeCompare(b.username, 'vi')
        })

        const eligibleForBonus = rankings.filter(r => r.rankScore === 'S')
        const bonusPercentages = [0.1, 0.05]

        stage = 'persist-delete-bonus'
        await workspacePrisma.monthlyBonus.deleteMany({
            where: { month: currentMonth, year: currentYear, workspaceId }
        })
        stage = 'persist-delete-rank'
        await workspacePrisma.monthlyRank.deleteMany({
            where: { month: currentMonth, year: currentYear, workspaceId }
        })

        stage = 'persist-upsert-lock'
        const payrollLock = await workspacePrisma.payrollLock.upsert({
            where: {
                month_year_workspaceId: {
                    month: currentMonth,
                    year: currentYear,
                    workspaceId
                }
            } as any,
            update: {
                isLocked: true,
                lockedAt: new Date(),
                lockedBy: session.user.id,
                profileId: workspace.profileId ?? null
            },
            create: {
                month: currentMonth,
                year: currentYear,
                workspaceId,
                profileId: workspace.profileId ?? null,
                isLocked: true,
                lockedBy: session.user.id
            }
        })

        const awardedBonuses: Array<{
            userId: string
            username: string
            rank: number
            bonusAmount: number
        }> = []

        stage = 'persist-create-bonuses'
        for (let i = 0; i < Math.min(2, eligibleForBonus.length); i++) {
            const user = eligibleForBonus[i]
            const bonusAmount = user.monthlySalary * bonusPercentages[i]

            await workspacePrisma.monthlyBonus.create({
                data: {
                    userId: user.userId,
                    month: currentMonth,
                    year: currentYear,
                    workspaceId,
                    profileId: workspace.profileId ?? null,
                    rank: i + 1,
                    revenue: user.revenue,
                    executionTimeHours: 0,
                    bonusAmount
                }
            })

            awardedBonuses.push({
                userId: user.userId,
                username: user.username,
                rank: i + 1,
                bonusAmount
            })
        }

        const monthlyRankData = rankings.map(user => ({
            userId: user.userId,
            month: currentMonth,
            year: currentYear,
            workspaceId,
            profileId: workspace.profileId ?? null,
            totalTasks: user.tasksCompleted,
            totalPenalty: user.totalPenalty,
            errorRate: user.errorRate,
            rank: user.rankScore,
            isLocked: true,
            payrollLockId: payrollLock.id
        }))

        if (monthlyRankData.length > 0) {
            stage = 'persist-create-ranks'
            await workspacePrisma.monthlyRank.createMany({ data: monthlyRankData })
        }

        stage = 'revalidate'
        revalidatePath(`/${workspaceId}/admin/payroll`)
        return {
            success: true,
            bonuses: awardedBonuses,
            month: currentMonth,
            year: currentYear
        }
    } catch (error: any) {
        const detail = error?.message || 'Unknown error'
        const stackLine = typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 2).join(' | ') : ''
        console.error('Error calculating monthly bonus:', { stage, detail, stack: stackLine, error })
        return { success: false, error: `Failed to calculate bonuses [${stage}]: ${detail}` }
    }
}
