'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { SALARY_PENDING_STATUSES } from '@/lib/task-statuses'

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
    } catch (error) {
        return { isLocked: false }
    }
}

export async function revertMonthlyBonus(workspaceId: string) {
    try {
        // 1. Permission Check
        const session = await getSession()
        if (!session) return { success: false, error: 'Unauthorized' }

        const workspacePrisma = getWorkspacePrisma(workspaceId)
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

        // 2. Delete all bonuses and ranks for this month
        await workspacePrisma.monthlyBonus.deleteMany({
            where: {
                workspaceId,
                month: currentMonth,
                year: currentYear
            }
        })
        await workspacePrisma.monthlyRank.deleteMany({
            where: {
                workspaceId,
                month: currentMonth,
                year: currentYear
            }
        })

        // 3. Delete Lock (Unlock)
        await workspacePrisma.payrollLock.deleteMany({
            where: {
                workspaceId,
                month: currentMonth,
                year: currentYear
            }
        })

        revalidatePath(`/${workspaceId}/admin/payroll`)
        return { success: true, message: 'Đã hoàn tác và mở khóa kỳ lương.' }

    } catch (error) {
        console.error('Error reverting bonus:', error)
        return { success: false, error: 'Failed to revert.' }
    }
}

/**
 * Calculate and award monthly bonuses based on revenue and efficiency ranking.
 * 
 * Ranking Algorithm:
 * 1. Primary: Net Income (Revenue - Penalties) (DESC)
 * 2. Tie-breaker: Error Rate (ASC)
 */
export async function calculateMonthlyBonus(workspaceId: string) {
    try {
        // 1. Permission Check
        const session = await getSession()
        if (!session) return { success: false, error: 'Unauthorized' }

        const workspacePrisma = getWorkspacePrisma(workspaceId)
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

        // Check Lock
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
            return { success: false, error: 'Kỳ lương này đã bị khóa.' }
        }

        const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
        const endOfMonth = new Date(currentYear, currentMonth, 5, 23, 59, 59, 999)

        // 2. Fetch Users with tasks and errorLogs
        const users = await workspacePrisma.user.findMany({
            where: {
                role: { not: 'ADMIN' },
                username: { not: 'admin' }
            },
            select: {
                id: true,
                username: true,
                role: true,
                nickname: true,
                tasks: {
                    where: {
                        workspaceId,
                        status: 'Hoàn tất',
                        updatedAt: { gte: startOfMonth, lte: endOfMonth }
                    }
                },
                errorLogs: {
                    where: {
                        workspaceId,
                        createdAt: { gte: startOfMonth, lte: endOfMonth }
                    },
                    include: { error: true }
                }
            }
        })

        if (!users || users.length === 0) {
            return { success: false, error: 'Không tìm thấy nhân viên.' }
        }

        const totalTasksFound = users.reduce((acc, u) => acc + u.tasks.length, 0)
        if (totalTasksFound === 0) {
            return { success: false, error: 'Không có dữ liệu task hoàn tất.' }
        }

        const pendingTasksAggregate = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                status: { in: SALARY_PENDING_STATUSES },
                assigneeId: { not: null },
                updatedAt: { gte: startOfMonth, lte: endOfMonth },
                workspaceId
            },
            _sum: { value: true }
        })

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
            if (user.tasks.length === 0) continue

            const revenue = user.tasks.reduce((sum, task) => sum + Number(task.value || 0), 0)
            const totalTasks = user.tasks.length
            const totalPenalty = user.errorLogs.reduce((sum, log) => sum + (log.error?.penalty || 0), 0)
            const errorRate = totalTasks >= 8 ? Number((totalPenalty / totalTasks).toFixed(2)) : 0
            const pendingRevenue = Number(pendingTasksAggregate.find((p: any) => p.assigneeId === user.id)?._sum.value || 0)
            const tentativeRevenue = revenue + pendingRevenue
           
            let rankScore = 'UNRANKED'
            if (totalTasks >= 8) {
                if (errorRate < 0.3) rankScore = 'S'
                else if (errorRate <= 0.6) rankScore = 'A'
                else if (errorRate <= 1.0) rankScore = 'B'
                else if (errorRate <= 1.5) rankScore = 'C'
                else rankScore = 'D'
            }

            const incomeScore = Math.max(0, tentativeRevenue - totalPenalty)
            rankings.push({
                userId: user.id,
                username: user.username,
                revenue,
                pendingRevenue,
                tentativeRevenue,
                tasksCompleted: totalTasks,
                monthlySalary: revenue,
                totalPenalty,
                errorRate,
                rankScore,
                incomeScore
            })
        }

        rankings.sort((a, b) => {
            if (Math.abs(b.incomeScore - a.incomeScore) > 0.01) return b.incomeScore - a.incomeScore
            if (a.errorRate !== b.errorRate) return a.errorRate - b.errorRate
            const aRank = rankPriority(a.rankScore)
            const bRank = rankPriority(b.rankScore)
            if (aRank !== bRank) return bRank - aRank
            return b.tasksCompleted - a.tasksCompleted
        })

        const eligibleForBonus = rankings.filter(r => r.rankScore === 'S')
        const bonusPercentages = [0.10, 0.05]

        // Persistence
        await workspacePrisma.monthlyBonus.deleteMany({
            where: { month: currentMonth, year: currentYear, workspaceId }
        })
        await workspacePrisma.monthlyRank.deleteMany({
            where: { month: currentMonth, year: currentYear, workspaceId }
        })

        const payrollLock = await workspacePrisma.payrollLock.upsert({
            where: {
                month_year_workspaceId: {
                    month: currentMonth,
                    year: currentYear,
                    workspaceId
                }
            } as any,
            update: { isLocked: true, lockedAt: new Date(), lockedBy: session.user.id },
            create: {
                month: currentMonth,
                year: currentYear,
                workspaceId,
                isLocked: true,
                lockedBy: session.user.id
            }
        })

        const awardedBonuses = []
        for (let i = 0; i < Math.min(2, eligibleForBonus.length); i++) {
            const user = eligibleForBonus[i]
            const bonusAmount = user.monthlySalary * bonusPercentages[i]

            await workspacePrisma.monthlyBonus.create({
                data: {
                    userId: user.userId,
                    month: currentMonth,
                    year: currentYear,
                    workspaceId,
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

        const monthlyRankData = rankings.map(u => ({
            userId: u.userId,
            month: currentMonth,
            year: currentYear,
            workspaceId,
            totalTasks: u.tasksCompleted,
            totalPenalty: u.totalPenalty,
            errorRate: u.errorRate,
            rank: u.rankScore,
            isLocked: true,
            payrollLockId: payrollLock.id
        }))

        if (monthlyRankData.length > 0) {
            await workspacePrisma.monthlyRank.createMany({ data: monthlyRankData })
        }

        revalidatePath(`/${workspaceId}/admin/payroll`)
        return { success: true, bonuses: awardedBonuses }

    } catch (error) {
        console.error('Error calculating monthly bonus:', error)
        return { success: false, error: 'Failed to calculate bonuses' }
    }
}
