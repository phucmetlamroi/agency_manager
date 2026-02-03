'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export type ScheduleType = 'BUSY' | 'OVERTIME' | 'AVAILABLE' | 'TASK'

export async function getUserSchedule(userId: string, startDate: Date, endDate: Date) {
    try {
        const schedules = await prisma.userSchedule.findMany({
            where: {
                userId: userId,
                startTime: {
                    gte: startDate,
                },
                endTime: {
                    lte: endDate,
                }
            },
            orderBy: {
                startTime: 'asc'
            }
        })
        return { success: true, data: schedules }
    } catch (error) {
        console.error('Error fetching schedule:', error)
        return { success: false, error: 'Failed to fetch schedule' }
    }
}

export async function createUserSchedule(userId: string, data: {
    startTime: Date,
    endTime: Date,
    type: ScheduleType,
    note?: string
}) {
    try {
        if (data.endTime <= data.startTime) {
            return { success: false, error: 'End time must be after start time' }
        }

        const blocks = []
        let current = new Date(data.startTime)

        // Loop hour by hour
        while (current < data.endTime) {
            const next = new Date(current)
            next.setHours(next.getHours() + 1)

            // If next is beyond endTime (partial hour?), clamp it?
            // The grid enforces setMinutes(0), so usually this is exact.
            // But let's be safe: min(next, endTime).
            const blockEnd = next > data.endTime ? data.endTime : next

            blocks.push({
                userId,
                startTime: new Date(current),
                endTime: new Date(blockEnd),
                type: data.type,
                note: data.note,
                // Add default createdAt/updatedAt if needed by schema, usually auto
            })
            current = next
        }

        // Use transaction or createMany (createMany doesn't return created records in all DBs/Prisma versions well for returning data to UI?)
        // Postgres returns count.
        // To return data to UI for optimistic update, we might need transaction + findMany or just loop create.
        // Loop create is slower but returns IDs.
        // Given typically < 10 blocks, loop is fine.

        const createdSchedules = []

        // Use transaction to ensure all or nothing
        const results = await prisma.$transaction(
            blocks.map(block => prisma.userSchedule.create({ data: block }))
        )

        revalidatePath('/dashboard/schedule')
        revalidatePath('/admin/schedule')

        // Return array of created items
        return { success: true, data: results }
    } catch (error) {
        console.error('Error creating schedule:', error)
        return { success: false, error: 'Failed to create schedule' }
    }
}

export async function deleteUserSchedule(id: string, userId: string) {
    try {
        // Ensure user owns the schedule or is admin (logic handles ownership via userId check usually)
        await prisma.userSchedule.delete({
            where: {
                id: id,
                userId: userId // Security: Only delete own
            }
        })
        revalidatePath('/dashboard/schedule')
        revalidatePath('/admin/schedule')
        return { success: true }
    } catch (error) {
        console.error('Error deleting schedule:', error)
        return { success: false, error: 'Failed to delete schedule' }
    }
}

// Admin Action
export async function getAllSchedules(startDate: Date, endDate: Date) {
    try {
        const schedules = await prisma.userSchedule.findMany({
            where: {
                startTime: { gte: startDate },
                endTime: { lte: endDate }
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        nickname: true,
                        // avatar?
                    }
                }
            },
            orderBy: { startTime: 'asc' }
        })
        return { success: true, data: schedules }
    } catch (error) {
        console.error('Error fetching all schedules:', error)
        return { success: false, error: 'Failed to fetch schedules' }
    }
}
