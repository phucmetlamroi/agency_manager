'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Calculate and award monthly bonuses based on revenue and efficiency ranking.
 * 
 * Ranking Algorithm:
 * 1. Primary: Total Revenue (DESC)
 * 2. Tie-breaker: Total Execution Time in hours (ASC - faster wins)
 * 
 * Awards:
 * - Top 1: 15% of monthly salary
 * - Top 2: 10% of monthly salary
 * - Top 3: 5% of monthly salary
 */
export async function calculateMonthlyBonus() {
    try {
        // 1. Permission Check: Only Admin or Treasurer can calculate bonuses
        const session = await getSession()
        if (!session) {
            return { success: false, error: 'Unauthorized' }
        }

        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, isTreasurer: true }
        })

        if (currentUser?.role !== 'ADMIN' && !currentUser?.isTreasurer) {
            return { success: false, error: 'Permission denied. Only Admin or Treasurer can calculate bonuses.' }
        }

        // 2. Get current month/year (Vietnam Time: UTC+7)
        const now = new Date()
        const currentMonth = now.getMonth() + 1 // 1-12
        const currentYear = now.getFullYear()

        const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
        const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)

        // 3. Fetch all users with completed tasks this month
        const users = await prisma.user.findMany({
            where: {
                role: 'USER',
                username: { not: 'admin' } // Exclude admin account
            },
            include: {
                tasks: {
                    where: {
                        status: 'Hoàn tất',
                        updatedAt: {
                            gte: startOfMonth,
                            lte: endOfMonth
                        }
                    }
                }
            }
        })

        // 4. Calculate revenue and execution time for each user
        interface UserRanking {
            userId: string
            username: string
            revenue: number
            executionTimeHours: number
            monthlySalary: number
        }

        const rankings: UserRanking[] = []

        for (const user of users) {
            // Skip users with no completed tasks
            if (user.tasks.length === 0) continue

            // Calculate total revenue (sum of task values)
            const revenue = user.tasks.reduce((sum, task) => sum + task.value, 0)

            // Calculate total execution time in hours
            let totalExecutionMs = 0
            for (const task of user.tasks) {
                // Execution time = completedAt (updatedAt) - assignedAt (createdAt)
                const completedAt = task.updatedAt.getTime()
                const assignedAt = task.createdAt.getTime()
                totalExecutionMs += (completedAt - assignedAt)
            }
            const executionTimeHours = totalExecutionMs / (1000 * 60 * 60) // Convert ms to hours

            rankings.push({
                userId: user.id,
                username: user.username,
                revenue,
                executionTimeHours,
                monthlySalary: revenue // Using revenue as salary for bonus calculation
            })
        }

        // 5. Rank by revenue DESC, then executionTime ASC (faster wins)
        rankings.sort((a, b) => {
            // Primary: Revenue (higher is better)
            if (b.revenue !== a.revenue) {
                return b.revenue - a.revenue
            }
            // Tie-breaker: Execution time (lower is better - faster completion)
            return a.executionTimeHours - b.executionTimeHours
        })

        // 6. Award Top 1-3 with bonuses
        const bonusPercentages = [0.15, 0.10, 0.05] // 15%, 10%, 5%
        const awardedBonuses = []

        for (let i = 0; i < Math.min(3, rankings.length); i++) {
            const user = rankings[i]
            const rank = i + 1
            const bonusPercentage = bonusPercentages[i]
            const bonusAmount = user.monthlySalary * bonusPercentage

            // 7. Delete existing bonus for this month (if recalculating)
            await prisma.monthlyBonus.deleteMany({
                where: {
                    userId: user.userId,
                    month: currentMonth,
                    year: currentYear
                }
            })

            // 8. Save to MonthlyBonus table
            const bonus = await prisma.monthlyBonus.create({
                data: {
                    userId: user.userId,
                    month: currentMonth,
                    year: currentYear,
                    rank,
                    revenue: user.revenue,
                    executionTimeHours: user.executionTimeHours,
                    bonusAmount
                }
            })

            awardedBonuses.push({
                userId: user.userId,
                username: user.username,
                rank,
                revenue: user.revenue,
                executionTimeHours: user.executionTimeHours,
                bonusAmount,
                bonusPercentage: bonusPercentage * 100
            })
        }

        // 9. Revalidate payroll page to show updated bonuses
        revalidatePath('/admin/payroll')

        return {
            success: true,
            bonuses: awardedBonuses,
            month: currentMonth,
            year: currentYear
        }

    } catch (error) {
        console.error('Error calculating monthly bonus:', error)
        return { success: false, error: 'Failed to calculate bonuses' }
    }
}
