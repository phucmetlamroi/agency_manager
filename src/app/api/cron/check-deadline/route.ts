import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { createNotificationInternal } from '@/actions/notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'

// Call this route via Cron Job (e.g. Vercel Cron) every hour
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization')
    const headerKey =
        request.headers.get('x-cron-secret') ||
        request.headers.get('x-cron-key') ||
        null
    const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const key = headerKey || bearerKey
    const secret = process.env.CRON_SECRET

    if (!secret) {
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }

    if (key !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const now = new Date()
        const results: string[] = []

        // ── 1. TASK_DEADLINE_APPROACHING — tasks with deadline in next 24h ──
        const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        const approachingTasks = await prisma.task.findMany({
            where: {
                deadline: { gte: now, lte: twentyFourHoursFromNow },
                status: { notIn: ['Hoàn tất', 'Đã hủy', 'Quá hạn'] },
                assigneeId: { not: null },
            },
            include: {
                assignee: {
                    select: { id: true, username: true, nickname: true },
                },
            },
        })

        for (const task of approachingTasks) {
            if (!task.assignee) continue

            // Dedup: skip if we already created this notification for this task
            const existing = await prisma.notification.findFirst({
                where: {
                    userId: task.assignee.id,
                    taskId: task.id,
                    type: 'TASK_DEADLINE_APPROACHING',
                },
            })
            if (existing) continue

            const deadlineStr = task.deadline
                ? new Date(task.deadline).toLocaleString('vi-VN')
                : ''
            const notif = await createNotificationInternal({
                userId: task.assignee.id,
                type: 'TASK_DEADLINE_APPROACHING',
                title: `Sắp đến hạn: ${task.title}`,
                body: `Task "${task.title}" sẽ đến hạn lúc ${deadlineStr}. Hãy hoàn thành sớm!`,
                taskId: task.id,
                metadata: { taskTitle: task.title, deadline: task.deadline?.toISOString() },
            })
            // Broadcast for in-app bell
            void broadcastNotificationToUser(task.assignee.id, {
                id: notif.id,
                type: notif.type,
                title: notif.title,
                body: notif.body,
                avatarUrl: null,
                isRead: false,
                conversationId: null,
                messageId: null,
                taskId: task.id,
                actorId: null,
                metadata: notif.metadata as Record<string, any> | null,
                createdAt: notif.createdAt.toISOString(),
            })
            results.push(`Deadline approaching: [${task.title}] → ${task.assignee.username}`)
        }

        // ── 2. TASK_OVERDUE — mark overdue + send notification ──
        const overdueTasks = await prisma.task.findMany({
            where: {
                deadline: { lt: now },
                status: { notIn: ['Hoàn tất', 'Đã hủy', 'Quá hạn'] },
                assigneeId: { not: null },
            },
            include: {
                assignee: {
                    select: { id: true, username: true, nickname: true },
                },
            },
        })

        for (const task of overdueTasks) {
            if (!task.assignee) continue

            // Mark task as 'Quá hạn' (Overdue)
            await prisma.task.update({
                where: { id: task.id },
                data: { status: 'Quá hạn' },
            })

            // Dedup: skip notification if already sent for this task
            const existing = await prisma.notification.findFirst({
                where: {
                    userId: task.assignee.id,
                    taskId: task.id,
                    type: 'TASK_OVERDUE',
                },
            })
            if (!existing) {
                const notif = await createNotificationInternal({
                    userId: task.assignee.id,
                    type: 'TASK_OVERDUE',
                    title: `Quá hạn: ${task.title}`,
                    body: `Task "${task.title}" đã quá hạn. Vui lòng liên hệ Admin để cập nhật tiến độ.`,
                    taskId: task.id,
                    metadata: { taskTitle: task.title, deadline: task.deadline?.toISOString() },
                })
                void broadcastNotificationToUser(task.assignee.id, {
                    id: notif.id,
                    type: notif.type,
                    title: notif.title,
                    body: notif.body,
                    avatarUrl: null,
                    isRead: false,
                    conversationId: null,
                    messageId: null,
                    taskId: task.id,
                    actorId: null,
                    metadata: notif.metadata as Record<string, any> | null,
                    createdAt: notif.createdAt.toISOString(),
                })
            }

            results.push(`Task [${task.title}] marked as Overdue for user ${task.assignee.username}`)
        }

        return NextResponse.json({ success: true, processed: results })
    } catch (error) {
        console.error('Check Deadline Cron Error:', error)
        return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
    }
}
