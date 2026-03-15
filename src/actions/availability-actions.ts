'use server'

import { prisma as globalPrisma } from '@/lib/db'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getCurrentUser } from '@/lib/auth-guard'
import { getVietnamCurrentHour, getVietnamDateKey, getVietnamDayStart, getVietnamWeekKeys } from '@/lib/date-utils'
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

const ensureWorkspaceAccess = async (userId: string, workspaceId: string, userRole?: string, userProfileId?: string | null) => {
    // 1. Admin bypass
    if (userRole === 'ADMIN') return

    // 2. Check explicit membership
    const membership = await globalPrisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } }
    })
    if (membership) return

    // 3. Fallback: Check if user belongs to the same Profile as the workspace
    const workspace = await globalPrisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true }
    })

    if (workspace && userProfileId && workspace.profileId === userProfileId) {
        return
    }

    throw new Error('Unauthorized workspace access')
}

export async function getMyAvailability(dateKey: string, workspaceId: string) {
    try {
        const user = await getCurrentUser()
        if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }

        await ensureWorkspaceAccess(user.id, workspaceId, user.role, user.profileId)
        
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const date = getVietnamDayStart(dateKey)
        const record = await workspacePrisma.dailyAvailability.findUnique({
            where: { userId_date: { userId: user.id, date } }
        })

        return {
            date: dateKey,
            schedule: normalizeSchedule(record?.schedule as string[] | null)
        }
    } catch (error: any) {
        console.error('getMyAvailability error:', error)
        return { error: `Server error: ${error.message || 'Unknown'}` }
    }
}

export async function getMyAvailabilityWeek(dateKey: string, workspaceId: string) {
    try {
        const user = await getCurrentUser()
        if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }

        await ensureWorkspaceAccess(user.id, workspaceId, user.role, user.profileId)

        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const weekKeys = getVietnamWeekKeys(dateKey)
        const dates = weekKeys.map(getVietnamDayStart)

        const records = await workspacePrisma.dailyAvailability.findMany({
            where: {
                userId: user.id,
                date: { in: dates }
            }
        })

        const scheduleMap = new Map<string, string[]>()
        for (const record of records) {
            const key = getVietnamDateKey(record.date)
            scheduleMap.set(key, normalizeSchedule(record?.schedule as string[] | null))
        }

        return {
            weekStartKey: weekKeys[0],
            days: weekKeys.map(key => ({
                dateKey: key,
                schedule: scheduleMap.get(key) || [...DEFAULT_SCHEDULE]
            }))
        }
    } catch (error: any) {
        console.error('getMyAvailabilityWeek error:', error)
        return { error: `Server error: ${error.message || 'Unknown'}` }
    }
}

export async function saveMyAvailability(dateKey: string, schedule: string[], workspaceId: string) {
    try {
        const user = await getCurrentUser()
        if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }
        if (!Array.isArray(schedule) || schedule.length !== 24) return { error: 'Invalid schedule length' }

        await ensureWorkspaceAccess(user.id, workspaceId, user.role, user.profileId)
        const workspacePrisma = getWorkspacePrisma(workspaceId)

        const cleanSchedule = schedule.map(s => (VALID_STATUSES.has(s) ? s : 'EMPTY'))
        const todayKey = getVietnamDateKey()

        const targetDate = getVietnamDayStart(dateKey)
        const todayDate = getVietnamDayStart(todayKey)
        if (targetDate < todayDate) {
            return { error: 'Không thể chỉnh sửa lịch trong quá khứ.' }
        }

        if (dateKey === todayKey) {
            const currentHour = getVietnamCurrentHour()
            const existing = await workspacePrisma.dailyAvailability.findUnique({
                where: { userId_date: { userId: user.id, date: targetDate } }
            })
            const existingSchedule = normalizeSchedule(existing?.schedule as string[] | null)

            for (let i = 0; i < currentHour; i += 1) {
                if (cleanSchedule[i] !== existingSchedule[i]) {
                    return { error: 'Không thể chỉnh sửa giờ đã qua.' }
                }
            }
        }

        const userRecord = await globalPrisma.user.findUnique({ where: { id: user.id } })
        const profileId = userRecord?.profileId || null

        await workspacePrisma.dailyAvailability.upsert({
            where: { userId_date: { userId: user.id, date: targetDate } },
            create: {
                userId: user.id,
                workspaceId,
                profileId,
                date: targetDate,
                schedule: cleanSchedule as any
            },
            update: {
                schedule: cleanSchedule as any,
                workspaceId,
                profileId
            }
        })

        revalidatePath(`/${workspaceId}/dashboard/schedule`)
        revalidatePath(`/${workspaceId}/admin/schedule`)
        revalidatePath(`/${workspaceId}/admin/queue`)

        return { success: true }
    } catch (error: any) {
        console.error('saveMyAvailability error:', error)
        return { error: `Server error: ${error.message || 'Unknown'}` }
    }
}

export async function getAdminAvailabilityMatrix(dateKey: string, workspaceId: string) {
    try {
        const user = await getCurrentUser()
        if (user.role !== 'ADMIN') return { error: 'Unauthorized' }
        if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }

        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const date = getVietnamDayStart(dateKey)

        const members = await globalPrisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: { id: true, username: true, nickname: true, role: true }
                }
            }
        })

        const availabilities = await workspacePrisma.dailyAvailability.findMany({
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
    } catch (error: any) {
        console.error('getAdminAvailabilityMatrix error:', error)
        return { error: `Server error: ${error.message || 'Unknown'}` }
    }
}

export async function getAdminAvailabilityWeek(dateKey: string, workspaceId: string) {
    try {
        const user = await getCurrentUser()
        if (user.role !== 'ADMIN') return { error: 'Unauthorized' }
        if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }

        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const weekKeys = getVietnamWeekKeys(dateKey)
        const dates = weekKeys.map(getVietnamDayStart)

        const members = await globalPrisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: { id: true, username: true, nickname: true, role: true }
                }
            }
        })

        const availabilities = await workspacePrisma.dailyAvailability.findMany({
            where: { workspaceId, date: { in: dates } }
        })

        const scheduleMap = new Map<string, Record<string, string[]>>()
        for (const record of availabilities) {
            const key = getVietnamDateKey(record.date)
            const existing = scheduleMap.get(record.userId) || {}
            existing[key] = normalizeSchedule(record?.schedule as string[] | null)
            scheduleMap.set(record.userId, existing)
        }

        const rows = members
            .map(m => ({
                id: m.user.id,
                username: m.user.username,
                nickname: m.user.nickname,
                role: m.user.role,
                schedules: scheduleMap.get(m.user.id) || {}
            }))
            .filter(u => u.role !== 'CLIENT' && u.role !== 'LOCKED')

        return {
            weekStartKey: weekKeys[0],
            days: weekKeys,
            users: rows
        }
    } catch (error: any) {
        console.error('getAdminAvailabilityWeek error:', error)
        return { error: `Server error: ${error.message || 'Unknown'}` }
    }
}
