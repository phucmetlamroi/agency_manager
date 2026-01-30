'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function getPerformanceReport(month: number, year: number) {
    try {
        // Try to fetch existing snapshot first
        const metrics = await prisma.performanceMetric.findMany({
            where: { month, year },
            include: { user: true },
            orderBy: { revenue: 'desc' }
        })

        // If data exists, return it (Fast Load)
        if (metrics.length > 0) {
            return { success: true, data: metrics, source: 'snapshot' }
        }

        // If no data, calculate from scratch (First run for this month)
        return await calculatePerformance(month, year)

    } catch (error) {
        console.error('Get Performance Error:', error)
        return { success: false, error: 'Failed to Fetch Report' }
    }
}

export async function calculatePerformance(month: number, year: number) {
    try {
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 0) // Last day of month

        const users = await prisma.user.findMany({
            where: { role: 'USER' },
            include: {
                tasks: {
                    where: {
                        status: 'Hoàn tất',
                        updatedAt: {
                            gte: startDate,
                            lte: endDate
                        }
                    },
                    include: { feedbacks: true }
                }
            }
        })

        const updates = []

        for (const user of users) {
            let totalRevenue = 0
            let totalTasks = user.tasks.length
            let onTimeCount = 0
            let internalRevisions = 0
            let clientRevisions = 0

            for (const task of user.tasks) {
                // Revenue
                totalRevenue += (task.value || 0)

                // On Time Check (deadline >= completedAt) (Approx using updatedAt as completedAt)
                if (task.deadline) {
                    if (task.updatedAt <= task.deadline) onTimeCount++
                } else {
                    onTimeCount++ // No deadline = On Time
                }

                // Feedbacks
                const taskInternalFbs = await prisma.feedback.count({
                    where: { taskId: task.id, type: 'INTERNAL' }
                })
                const taskClientFbs = await prisma.feedback.count({
                    where: { taskId: task.id, type: 'CLIENT' }
                })

                internalRevisions += taskInternalFbs
                clientRevisions += taskClientFbs
            }

            const onTimeRate = totalTasks > 0 ? (onTimeCount / totalTasks) * 100 : 100

            // Classification Logic
            // 1. UNDERPERFORM: Late > 30% OR Internal Revisions > 30% of tasks
            // 2. POTENTIAL: Revenue > 10M AND Internal Revisions < 10%
            // 3. NORMAL: Else

            let classification = 'NORMAL'
            let score = 50 // Base score

            // Calc Score (Simple formula)
            // Start 50 -> Add revenue points -> Subtract penalty
            score += (totalRevenue / 1000000) * 2 // 2 pts per million
            score -= (internalRevisions * 10) // Heavy penalty for internal errors
            score += (onTimeRate > 90 ? 10 : 0)

            score = Math.max(0, Math.min(100, score))

            if (totalTasks > 0) {
                const lateRate = (totalTasks - onTimeCount) / totalTasks
                const errorRate = internalRevisions / totalTasks

                if (lateRate > 0.3 || errorRate > 0.3) {
                    classification = 'UNDERPERFORM'
                } else if (totalRevenue > 10000000 && errorRate < 0.1) {
                    classification = 'POTENTIAL'
                }
            }

            // Push to updates
            updates.push(prisma.performanceMetric.upsert({
                where: {
                    userId_month_year: {
                        userId: user.id,
                        month,
                        year
                    }
                },
                create: {
                    userId: user.id,
                    month,
                    year,
                    revenue: totalRevenue,
                    onTimeRate,
                    internalRevisionCount: internalRevisions,
                    clientRevisionCount: clientRevisions,
                    score,
                    classification
                },
                update: {
                    revenue: totalRevenue,
                    onTimeRate,
                    internalRevisionCount: internalRevisions,
                    clientRevisionCount: clientRevisions,
                    score,
                    classification,
                    measuredAt: new Date()
                }
            }))
        }

        await prisma.$transaction(updates)
        revalidatePath('/admin/performance')

        // Fetch fresh data to return
        const freshData = await prisma.performanceMetric.findMany({
            where: { month, year },
            include: { user: true },
            orderBy: { revenue: 'desc' }
        })

        return { success: true, data: freshData, source: 'calculated' }

    } catch (error) {
        console.error('Calculation Error:', error)
        return { success: false, error: 'Calculation Failed' }
    }
}
