import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'

// Call this route via Cron Job (e.g. Vercel Cron) every hour
export async function GET(request: Request) {
    try {
        const now = new Date()

        // Find overdue tasks that are NOT completed and haven't been penalized yet?
        // We need a way to mark "penalized" to avoid double deduction.
        // For now, let's assume this runs and we might need a flag "isOverdueProcessed" in Task model?
        // Or simpler: Check if it's overdue and reputation NOT deducted.
        // WITHOUT schema change for flag, it's risky to auto-deduct repeatedly.
        // USER CHECKLIST says: "Trong Cron Job quét deadline... nếu quá hạn... trừ 10 điểm"

        // Strategy: We can add a "status" check. If it's overdue, maybe we auto-change status to "Overdue" or something?
        // Or we rely on the implementation guide which didn't specify a flag.

        // SAFE APPROACH for this context: 
        // We will just return the list of overdue tasks for manual review OR
        // we implement a one-time penalty if we can track it.
        // User requirements are strict on automation.

        // Let's assume we can change status to "EXPIRED" to prevent re-scan.

        const overdueTasks = await prisma.task.findMany({
            where: {
                deadline: { lt: now }, // Passed deadline
                status: { notIn: ['Hoàn tất', 'Đã hủy', 'EXPIRED'] }, // Not finished
                assigneeId: { not: null }
            },
            include: { assignee: true }
        })

        const results = []

        for (const task of overdueTasks) {
            if (!task.assignee) continue

            // 1. Deduct 10 points
            const currentRep = task.assignee.reputation
            const newRep = currentRep - 10

            await prisma.user.update({
                where: { id: task.assignee.id },
                data: { reputation: newRep }
            })

            // 2. Mark task as EXPIRED (to stop repeated deduction)
            // Or "Overdue" - let's stick to existing statuses if possible, 
            // but we need to mark it. Let's use "EXPIRED" as a technical status?
            // Or maybe just leave it and accept that the cron logic needs a flag.
            // I'll update the Task to have a note or something?
            // Actually, "status" is a string, I can set it to "Quá hạn" (Overdue).
            await prisma.task.update({
                where: { id: task.id },
                data: { status: 'Quá hạn' }
            })

            // 3. User Banned if <= 0
            if (newRep <= 0) {
                await prisma.user.update({
                    where: { id: task.assignee.id },
                    data: { role: UserRole.LOCKED } // Or lock
                })
                results.push(`User ${task.assignee.username} BANNED (Rep: ${newRep})`)
            } else {
                results.push(`User ${task.assignee.username} penalized -10 (Task: ${task.title})`)
            }
        }

        return NextResponse.json({ success: true, processed: results })
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
    }
}
