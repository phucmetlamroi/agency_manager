'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

// --- SCORING WEIGHTS ---
const W_REVENUE = 40 // Max 40 points
const W_VOLUME = 30  // Max 30 points
const W_RECENCY = 20 // Max 20 points
const W_QUALITY = 10 // Max 10 points (Manual Rating)

export async function calculateAllClientScores() {
    try {
        const clients = await prisma.client.findMany({
            include: {
                tasks: {
                    select: {
                        jobPriceUSD: true,
                        createdAt: true,
                        status: true,
                        feedbacks: {
                            select: { severity: true }
                        }
                    }
                },
                projects: {
                    include: {
                        feedbacks: {
                            select: { severity: true }
                        }
                    }
                }
            }
        })

        let updatedCount = 0

        for (const client of clients) {
            // 1. Revenue Score (Max 40)
            // Goal: $4000 total revenue = 40 points. So 1 point per $100.
            const totalRevenue = client.tasks
                .filter(t => t.status === 'Hoàn tất')
                .reduce((sum, t) => sum + (t.jobPriceUSD || 0), 0)

            const revenueScore = Math.min(W_REVENUE, totalRevenue / 100)

            // 2. Volume/Loyalty Score (Max 30)
            // Goal: 15 tasks = 30 points. So 2 points per task.
            const taskCount = client.tasks.length
            const volumeScore = Math.min(W_VOLUME, taskCount * 2)

            // 3. Recency Score (Max 20)
            // Active < 7 days: 20
            // Active < 30 days: 10
            // Else: 0
            let recencyScore = 0
            if (client.tasks.length > 0) {
                const latestTask = client.tasks.reduce((latest, t) => {
                    return new Date(t.createdAt) > new Date(latest) ? t.createdAt : latest
                }, client.tasks[0].createdAt)

                const daysDiff = (Date.now() - new Date(latestTask).getTime()) / (1000 * 3600 * 24)
                if (daysDiff <= 7) recencyScore = 20
                else if (daysDiff <= 30) recencyScore = 10
            }

            // 4. Quality Score (Max 10)
            // Based on manual inputQuality: 5 -> 10, 1 -> 2. (Score * 2)
            const qualityScore = client.inputQuality * 2

            // 5. Penalties (Friction)
            // Critical Feedback (severity >= 4): -10 pts
            // Minor Feedback (severity < 4): -2 pts

            // Gather all feedbacks from Projects and Tasks
            const allFeedbacks = [
                ...client.projects.flatMap(p => p.feedbacks),
                ...client.tasks.flatMap(t => t.feedbacks)
            ]

            let penalty = 0
            allFeedbacks.forEach(fb => {
                if (fb.severity >= 4) penalty += 10
                else penalty += 2
            })

            // Calc Friction Index (0.0 - 1.0)
            // Ratio of Feedbacks / Tasks. If Tasks=0, Friction=0.
            const frictionIndex = taskCount > 0 ? (allFeedbacks.length / taskCount) : 0

            // Final Calculation
            let finalScore = (revenueScore + volumeScore + recencyScore + qualityScore) - penalty

            // Clamp 0-100
            finalScore = Math.max(0, Math.min(100, finalScore))

            // Determine Tier
            let tier = 'standard'
            if (finalScore >= 90) tier = 'DIAMOND'
            else if (finalScore >= 70) tier = 'GOLD'
            else if (finalScore >= 50) tier = 'SILVER'

            // Override Tier if Friction is too high or Input Quality too low
            if (frictionIndex > 0.5 || client.paymentRating <= 2) {
                tier = 'WARNING'
            }

            // Update DB
            await prisma.client.update({
                where: { id: client.id },
                data: {
                    aiScore: finalScore,
                    frictionIndex: frictionIndex,
                    tier: tier as any // Cast to ensure enum match
                }
            })
            updatedCount++
        }

        revalidatePath('/admin/crm')
        return { success: true, count: updatedCount }

    } catch (error) {
        console.error('Scoring calculation failed:', error)
        return { success: false, error: 'Lỗi tính toán AI Score. Vui lòng kiểm tra Server Logs.' }
    }
}
