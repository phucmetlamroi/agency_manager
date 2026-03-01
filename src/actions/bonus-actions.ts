'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

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
            }
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
            select: { role: true, isTreasurer: true }
        })

        if (currentUser?.role !== 'ADMIN' && !currentUser?.isTreasurer) {
            return { success: false, error: 'Permission denied.' }
        }

        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()

        // 2. Delete all bonuses for this month
        await workspacePrisma.monthlyBonus.deleteMany({
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
 * 1. Primary: Total Revenue (DESC)
 * 2. Tie-breaker: Total Execution Time in hours (ASC - faster wins)
 * 
 * Awards:
 * - Top 1: 15% of monthly salary
 * - Top 2: 10% of monthly salary
 * - Top 3: 5% of monthly salary
 */
export async function calculateMonthlyBonus(workspaceId: string) {
    try {
        // 1. Permission Check: Only Admin or Treasurer can calculate bonuses
        const session = await getSession()
        if (!session) {
            return { success: false, error: 'Unauthorized' }
        }

        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const currentUser = await workspacePrisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, isTreasurer: true }
        })

        if (currentUser?.role !== 'ADMIN' && !currentUser?.isTreasurer) {
            return { success: false, error: 'Permission denied. Only Admin or Treasurer can calculate bonuses.' }
        }

        // Use actual current date
        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()

        // Check if already locked
        const existingLock = await workspacePrisma.payrollLock.findUnique({
            where: {
                month_year_workspaceId: {
                    month: currentMonth,
                    year: currentYear,
                    workspaceId
                }
            }
        })

        if (existingLock?.isLocked) {
            return { success: false, error: 'Kỳ lương này ĐÃ BỊ KHÓA (Đã tính thưởng). Vui lòng Hoàn tác trước nếu muốn tính lại.' }
        }

        const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
        // Expand endOfMonth to include early March tasks into Feb payroll
        const endOfMonth = new Date(currentYear, currentMonth, 5, 23, 59, 59, 999)

        // 3. Fetch all users with completed tasks this month
        const users = await workspacePrisma.user.findMany({
            where: {
                role: { not: 'ADMIN' }, // Exclude all admin accounts from bonus
                username: { notIn: ['admin', 'Bảo Phúc', 'Daniel Hee'] } // Specifically exclude these usernames
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
            tasksCompleted: number
            monthlySalary: number
        }

        const rankings: UserRanking[] = []

        for (const user of users) {
            // Skip users with no completed tasks
            if (user.tasks.length === 0) continue

            // Calculate total revenue (sum of task values)
            // FIX: Handle Decimal type safely
            const revenue = user.tasks.reduce((sum, task) => {
                const val = task.value ? Number(task.value) : 0
                return sum + val
            }, 0)

            rankings.push({
                userId: user.id,
                username: user.username,
                revenue,
                tasksCompleted: user.tasks.length,
                monthlySalary: revenue // Using revenue as salary for bonus calculation
            })
        }

        // 5. Rank by revenue DESC, then by tasksCompleted DESC (Tie-breaker)
        rankings.sort((a, b) => {
            // Primary: Revenue (higher is better)
            if (Math.abs(b.revenue - a.revenue) > 0.01) {
                return b.revenue - a.revenue
            }

            // Tie-breaker: Who did more tasks to get that revenue
            return b.tasksCompleted - a.tasksCompleted
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
            await workspacePrisma.monthlyBonus.deleteMany({
                where: {
                    userId: user.userId,
                    month: currentMonth,
                    year: currentYear,
                    workspaceId
                }
            })

            // 8. Save to MonthlyBonus table
            await workspacePrisma.monthlyBonus.create({
                data: {
                    userId: user.userId,
                    month: currentMonth,
                    year: currentYear,
                    workspaceId,
                    rank,
                    revenue: user.revenue,
                    executionTimeHours: 0, // Migrated/Deprecating field, default 0
                    bonusAmount
                }
            })

            awardedBonuses.push({
                userId: user.userId,
                username: user.username,
                rank,
                revenue: user.revenue,
                bonusAmount,
                bonusPercentage: bonusPercentage * 100
            })
        }

        // 9. Create Lock Record
        await workspacePrisma.payrollLock.upsert({
            where: {
                month_year_workspaceId: {
                    month: currentMonth,
                    year: currentYear,
                    workspaceId
                }
            },
            update: { isLocked: true, lockedAt: new Date(), lockedBy: session.user.id },
            create: {
                month: currentMonth,
                year: currentYear,
                workspaceId,
                isLocked: true,
                lockedBy: session.user.id
            }
        })

        // 10. Revalidate payroll page to show updated bonuses
        revalidatePath(`/${workspaceId}/admin/payroll`)

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
