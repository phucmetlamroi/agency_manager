'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function getPayrollLockStatus() {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    try {
        const lock = await prisma.payrollLock.findUnique({
            where: {
                month_year: {
                    month: currentMonth,
                    year: currentYear
                }
            }
        })
        return { isLocked: lock?.isLocked ?? false }
    } catch (error) {
        return { isLocked: false }
    }
}

export async function revertMonthlyBonus() {
    try {
        // 1. Permission Check
        const session = await getSession()
        if (!session) return { success: false, error: 'Unauthorized' }

        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, isTreasurer: true }
        })

        if (currentUser?.role !== 'ADMIN' && !currentUser?.isTreasurer) {
            return { success: false, error: 'Permission denied.' }
        }

        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()

        // 2. Delete all bonuses for this month
        await prisma.monthlyBonus.deleteMany({
            where: {
                month: currentMonth,
                year: currentYear
            }
        })

        // 3. Delete Lock (Unlock)
        await prisma.payrollLock.deleteMany({
            where: {
                month: currentMonth,
                year: currentYear
            }
        })

        revalidatePath('/admin/payroll')
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

        // Check if already locked
        const existingLock = await prisma.payrollLock.findUnique({
            where: {
                month_year: {
                    month: currentMonth,
                    year: currentYear
                }
            }
        })

        if (existingLock?.isLocked) {
            return { success: false, error: 'Kỳ lương này ĐÃ BỊ KHÓA (Đã tính thưởng). Vui lòng Hoàn tác trước nếu muốn tính lại.' }
        }

        const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
        const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)

        // 3. Fetch all users with completed tasks this month
        const users = await prisma.user.findMany({
            where: {
                // role: 'USER', // Allow all users except main admin
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

        // Validation: Check if there is data to calculate
        if (!users || users.length === 0) {
            return { success: false, error: 'Không tìm thấy nhân viên nào có hoạt động trong hệ thống.' }
        }

        const totalTasksFound = users.reduce((acc, u) => acc + u.tasks.length, 0)
        if (totalTasksFound === 0) {
            return { success: false, error: 'Không có dữ liệu Task hoặc Doanh thu nào trong tháng này để tính toán.' }
        }

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

            // Calculate total execution time in hours using Smart Stopwatch (accumulatedSeconds)
            let totalExecutionMs = 0
            for (const task of user.tasks) {
                // Use the new accumulatedSeconds field derived from Stopwatch
                // If the task is somehow still RUNNING when calculating (unlikely if Hoàn tất stops it, but safe to check),
                // we should add the pending duration. 
                // But generally only Completed tasks are queried here.
                const activeSeconds = task.accumulatedSeconds || 0
                totalExecutionMs += (activeSeconds * 1000)
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
            await prisma.monthlyBonus.create({
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

        // 9. Create Lock Record
        await prisma.payrollLock.upsert({
            where: {
                month_year: {
                    month: currentMonth,
                    year: currentYear
                }
            },
            update: { isLocked: true, lockedAt: new Date(), lockedBy: session.user.id },
            create: {
                month: currentMonth,
                year: currentYear,
                isLocked: true,
                lockedBy: session.user.id
            }
        })

        // 10. Revalidate payroll page to show updated bonuses
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
