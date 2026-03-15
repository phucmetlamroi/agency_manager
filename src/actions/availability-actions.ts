'use server'

import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth-guard'
import { getVietnamCurrentHour, getVietnamDateKey, getVietnamDayStart } from '@/lib/date-utils'
import { revalidatePath } from 'next/cache'

const VALID_STATUSES = new Set(['EMPTY', 'FREE', 'BUSY', 'TENTATIVE'])
const DEFAULT_SCHEDULE = Array.from({ length: 24 }, () => 'EMPTY')

const normalizeSchedule = (schedule: string[] | null | undefined): string[] => {
    if (!schedule || schedule.length !== 24) return [...DEFAULT_SCHEDULE]
    return schedule.map(s => (VALID_STATUSES.has(s) ? s : 'EMPTY'))
}

const isValidDateKey = (dateKey: string): boolean => {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
}

const ensureWorkspaceAccess = async (userId: string, workspaceId: string) => {
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } }
    })
    if (!membership) {
        throw new Error('Unauthorized workspace access')
    }
}

export async function getMyAvailability(dateKey: string, workspaceId: string) {
    const user = await getCurrentUser()
    if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }

    await ensureWorkspaceAccess(user.id, workspaceId)

    const date = getVietnamDayStart(dateKey)
    const record = await prisma.dailyAvailability.findUnique({
        where: { userId_date: { userId: user.id, date } }
    })

    return {
        date: dateKey,
        schedule: normalizeSchedule(record?.schedule as string[] | null)
    }
}

export async function saveMyAvailability(dateKey: string, schedule: string[], workspaceId: string) {
    const user = await getCurrentUser()
    if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }
    if (!Array.isArray(schedule) || schedule.length !== 24) return { error: 'Invalid schedule length' }

    await ensureWorkspaceAccess(user.id, workspaceId)

    const cleanSchedule = schedule.map(s => (VALID_STATUSES.has(s) ? s : 'EMPTY'))
    const todayKey = getVietnamDateKey()

    const targetDate = getVietnamDayStart(dateKey)
    const todayDate = getVietnamDayStart(todayKey)
    if (targetDate < todayDate) {
        return { error: 'Không thể chỉnh sửa lịch trong quá khứ.' }
    }

    if (dateKey === todayKey) {
        const currentHour = getVietnamCurrentHour()
        const existing = await prisma.dailyAvailability.findUnique({
            where: { userId_date: { userId: user.id, date: targetDate } }
        })
        const existingSchedule = normalizeSchedule(existing?.schedule as string[] | null)

        for (let i = 0; i < currentHour; i += 1) {
            if (cleanSchedule[i] !== existingSchedule[i]) {
                return { error: 'Không thể chỉnh sửa giờ đã qua.' }
            }
        }
    }

    const userRecord = await prisma.user.findUnique({ where: { id: user.id } })
    const profileId = userRecord?.profileId || null

    await prisma.dailyAvailability.upsert({
        where: { userId_date: { userId: user.id, date: targetDate } },
        create: {
            userId: user.id,
            workspaceId,
            profileId,
            date: targetDate,
            schedule: cleanSchedule
        },
        update: {
            schedule: cleanSchedule,
            workspaceId,
            profileId
        }
    })

    revalidatePath(`/${workspaceId}/dashboard/schedule`)
    revalidatePath(`/${workspaceId}/admin/schedule`)
    revalidatePath(`/${workspaceId}/admin/queue`)

    return { success: true }
}

export async function getAdminAvailabilityMatrix(dateKey: string, workspaceId: string) {
    const user = await getCurrentUser()
    if (user.role !== 'ADMIN') return { error: 'Unauthorized' }
    if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }

    const date = getVietnamDayStart(dateKey)

    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
            user: {
                select: { id: true, username: true, nickname: true, role: true }
            }
        }
    })

    const availabilities = await prisma.dailyAvailability.findMany({
        where: { workspaceId, date }
    })

    const availabilityMap = new Map(
        availabilities.map(a => [a.userId, normalizeSchedule(a.schedule as string[] | null)])
    )

    const rows = members
        .map(m => ({
            id: m.user.id,
            username: m.user.username,
            nickname: m.user.nickname,
            role: m.user.role,
            schedule: availabilityMap.get(m.user.id) || [...DEFAULT_SCHEDULE]
        }))
        .filter(u => u.role !== 'CLIENT' && u.role !== 'LOCKED')

    return { date: dateKey, users: rows }
}
