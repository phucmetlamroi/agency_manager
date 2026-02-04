'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'

/**
 * Fetch schedule for the current user within a date range
 */
export async function getMySchedule(start: Date, end: Date) {
    try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')
        if (!sessionCookie) return { success: false, error: 'Unauthorized' }
        const session = await decrypt(sessionCookie.value)
        const userId = session.user.id

        const schedules = await prisma.userSchedule.findMany({
            where: {
                userId: userId,
                startTime: { gte: start },
                endTime: { lte: end }
            },
            orderBy: { startTime: 'asc' }
        })

        return { success: true, data: schedules }
    } catch (e) {
        console.error('Failed to get schedule', e)
        return { success: false, error: 'Failed' }
    }
}

/**
 * Fetch schedule for ALL users (Admin View)
 */
export async function getCompanySchedule(start: Date, end: Date) {
    try {
        // Need middleware to protect this, but checking role here is safe too
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')
        if (!sessionCookie) return { success: false, error: 'Unauthorized' }
        const session = await decrypt(sessionCookie.value)
        if (session.user.role !== 'ADMIN') return { success: false, error: 'Forbidden' }

        const schedules = await prisma.userSchedule.findMany({
            where: {
                startTime: { gte: start },
                endTime: { lte: end }
            },
            include: {
                user: {
                    select: { id: true, username: true, nickname: true, role: true }
                }
            },
            orderBy: { startTime: 'asc' }
        })

        return { success: true, data: schedules }
    } catch (e) {
        return { success: false, error: 'Failed' }
    }
}

/**
 * Create a schedule block
 */
export async function createScheduleBlock(data: {
    startTime: Date,
    endTime: Date,
    type: 'BUSY' | 'OVERTIME' | 'AVAILABLE',
    note?: string
}) {
    try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')
        if (!sessionCookie) return { success: false, error: 'Unauthorized' }
        const session = await decrypt(sessionCookie.value)
        const userId = session.user.id

        if (new Date(data.startTime) >= new Date(data.endTime)) {
            return { success: false, error: 'Thời gian kết thúc phải sau thời gian bắt đầu' }
        }

        await prisma.userSchedule.create({
            data: {
                userId,
                startTime: data.startTime,
                endTime: data.endTime,
                type: data.type,
                note: data.note
            }
        })

        revalidatePath('/dashboard/schedule')
        return { success: true }
    } catch (e) {
        console.error('Create block failed', e)
        return { success: false, error: 'Lỗi tạo lịch' }
    }
}

/**
 * Delete a schedule block (Owner or Admin)
 */
export async function deleteScheduleBlock(id: string) {
    try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')
        if (!sessionCookie) return { success: false, error: 'Unauthorized' }
        const session = await decrypt(sessionCookie.value)
        const userId = session.user.id

        const block = await prisma.userSchedule.findUnique({ where: { id } })
        if (!block) return { success: false, error: 'Not found' }

        // Allow deletion if owner OR admin
        if (block.userId !== userId && session.user.role !== 'ADMIN') {
            return { success: false, error: 'Forbidden' }
        }

        await prisma.userSchedule.delete({ where: { id } })
        revalidatePath('/dashboard/schedule')
        return { success: true }
    } catch (e) {
        return { success: false, error: 'Failed to delete' }
    }
}

/**
 * Check availability for a specific user on a specific date (or just check if they are BUSY now)
 * Returns true if available (or OVERTIME), false if BUSY.
 */
export async function checkUserAvailability(userId: string, date: Date) {
    try {
        const start = new Date(date)
        start.setMinutes(start.getMinutes() - 30) // Check buffer?
        const end = new Date(date)
        end.setMinutes(end.getMinutes() + 30)

        // Find any overlapping BUSY blocks
        const conflicts = await prisma.userSchedule.findMany({
            where: {
                userId: userId,
                type: 'BUSY',
                OR: [
                    {
                        startTime: { lte: start },
                        endTime: { gte: start }
                    },
                    {
                        startTime: { lte: end },
                        endTime: { gte: end }
                    }
                ]
            }
        })

        return {
            available: conflicts.length === 0,
            conflicts: conflicts
        }
    } catch (e) {
        return { available: true } // Fail safe
    }
}
