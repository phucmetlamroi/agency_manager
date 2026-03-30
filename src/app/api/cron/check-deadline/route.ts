import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

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

        // Tìm các task đã quá hạn và chưa được xử lý (trạng thái khác Hoàn tất/Đã hủy/Quá hạn)
        const overdueTasks = await prisma.task.findMany({
            where: {
                deadline: { lt: now },
                status: { notIn: ['Hoàn tất', 'Đã hủy', 'Quá hạn'] },
                assigneeId: { not: null }
            },
            include: {
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        role: true,
                        nickname: true
                    }
                }
            }
        })

        const results = []

        for (const task of overdueTasks) {
            if (!task.assignee) continue

            // 1. [REMOVED] Logic: Deduct reputation points
            
            // 2. Mark task as 'Quá hạn' (Overdue)
            await prisma.task.update({
                where: { id: task.id },
                data: { status: 'Quá hạn' }
            })

            results.push(`Task [${task.title}] marked as Overdue for user ${task.assignee.username}`)
        }

        return NextResponse.json({ success: true, processed: results })
    } catch (error) {
        console.error('Check Deadline Cron Error:', error)
        return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
    }
}
