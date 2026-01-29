import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET() {
    try {
        const session = await getSession()
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = session.user.id
        const userRole = session.user.role

        let tasks

        if (userRole === 'ADMIN') {
            // Admin sees all tasks
            tasks = await prisma.task.findMany({
                include: { assignee: true },
                orderBy: { createdAt: 'desc' }
            })
        } else {
            // User sees only their assigned tasks
            tasks = await prisma.task.findMany({
                where: { assigneeId: userId },
                include: { assignee: true }, // Include assignee for consistency w/ types
                orderBy: { createdAt: 'desc' }
            })
        }

        return NextResponse.json(tasks)
    } catch (error) {
        console.error('Failed to fetch tasks:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
