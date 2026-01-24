'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function getNotifications() {
    const session = await getSession()
    if (!session || !session.user) return []

    // Fetch broadcast (userId: null) OR specific to user
    // Ideally Admin sees broadcasts + their own. 
    // Editors see only their own (if we implement user notifications).

    // For now, simpler: Admin sees all broadcasts (userId: null). 
    // We can assume system notifications are 'null'.

    const notifications = await prisma.notification.findMany({
        where: {
            OR: [
                { userId: null }, // Broadcast
                { userId: session.user.id } // Specific
            ],
            isRead: false
        },
        orderBy: { createdAt: 'desc' },
        take: 20
    })

    return notifications
}

export async function markAsRead(id: string) {
    await prisma.notification.update({
        where: { id },
        data: { isRead: true }
    })
    revalidatePath('/admin')
}
