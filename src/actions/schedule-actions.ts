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
        // Basic validation: End > Start
        if (data.endTime <= data.startTime) {
            return { success: false, error: 'End time must be after start time' }
        }

        // Prevent overlapping with existing BUSY blocks? 
        // For now, let's allow overlapping for flexible adjustment, or we can check.
        // Simple overlap check:
        const overlaps = await prisma.userSchedule.count({
            where: {
                userId: userId,
                // Existing start < New end AND Existing end > New start
                startTime: { lt: data.endTime },
                endTime: { gt: data.startTime }
            }
        })

        if (overlaps > 0) {
            // Option: Allow logic to proceed or warn. 
            // For now, let's just return success but maybe we should warn?
            // The user requested "smart interaction", maybe we just stack them or warn.
            // Let's NOT block for now to keep it snappy, but ideally we should merge.
        }

        const newSchedule = await prisma.userSchedule.create({
            data: {
                userId,
                startTime: data.startTime,
                endTime: data.endTime,
                type: data.type,
                note: data.note
            }
        })

        revalidatePath('/dashboard/schedule')
        revalidatePath('/admin/schedule')
        return { success: true, data: newSchedule }
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
