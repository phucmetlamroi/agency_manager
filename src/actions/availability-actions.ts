'use server'

import { prisma as globalPrisma } from '@/lib/db'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getCurrentUser } from '@/lib/auth-guard'
import { getVietnamCurrentHour, getVietnamDateKey, getVietnamDayStart, getVietnamWeekKeys } from '@/lib/date-utils'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'

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
    if (userRole === 'ADMIN') return

    const membership = await globalPrisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } }
    })
    if (membership) return

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
        
        const date = getVietnamDayStart(dateKey)
        const record = await (globalPrisma as any).dailyAvailability.findUnique({
            where: { 
                userId_date_workspaceId_profileId: { 
                    userId: user.id, 
                    date,
                    workspaceId,
                    profileId: user.profileId || ''
                } 
            }
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

        const weekKeys = getVietnamWeekKeys(dateKey)
        const dates = weekKeys.map(getVietnamDayStart)

        const records = await (globalPrisma as any).dailyAvailability.findMany({
            where: {
                userId: user.id,
                date: { in: dates },
                workspaceId,
                profileId: user.profileId ?? ''
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

        const cleanSchedule = schedule.map(s => (VALID_STATUSES.has(s) ? s : 'EMPTY'))
        const todayKey = getVietnamDateKey()

        const targetDate = getVietnamDayStart(dateKey)
        const todayDate = getVietnamDayStart(todayKey)
        if (targetDate < todayDate) {
            return { error: 'Không thể chỉnh sửa lịch trong quá khứ.' }
        }

        const userRecord = await globalPrisma.user.findUnique({ where: { id: user.id } })
        const profileId = userRecord?.profileId || ''

        await (globalPrisma as any).dailyAvailability.upsert({
            where: {
                userId_date_workspaceId_profileId: {
                    userId: user.id,
                    date: targetDate,
                    workspaceId,
                    profileId
                }
            },
            update: {
                schedule: cleanSchedule as any,
            },
            create: {
                userId: user.id,
                workspaceId,
                profileId,
                date: targetDate,
                schedule: cleanSchedule as any
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
        // SECURITY: workspace-scoped admin check (was global ADMIN only).
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }

        const date = getVietnamDayStart(dateKey)
        const workspace = await globalPrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true }
        })

        if (!workspace) return { error: 'Workspace not found' }

        const profileUsers = await globalPrisma.user.findMany({
            where: {
                OR: [
                    { profileId: workspace.profileId },
                    { profileAccesses: { some: { profileId: workspace.profileId || '' } } }
                ]
            },
            select: { id: true, username: true, nickname: true, role: true }
        })

        const availabilities = await (globalPrisma as any).dailyAvailability.findMany({
            where: { 
                profileId: workspace.profileId || '',
                workspaceId,
                date 
            }
        })

        const availabilityMap = new Map<string, string[]>(
            availabilities.map((a: any) => [a.userId, normalizeSchedule(a.schedule as string[] | null)])
        )

        const rows = profileUsers
            .map((u: any) => ({
                id: u.id,
                username: u.username,
                nickname: u.nickname,
                role: u.role,
                schedule: availabilityMap.get(u.id) || [...DEFAULT_SCHEDULE]
            }))
            .filter((u: any) => u.role !== 'CLIENT' && u.role !== 'LOCKED')

        return { date: dateKey, users: rows }
    } catch (error: any) {
        console.error('getAdminAvailabilityMatrix error:', error)
        return { error: `Server error: ${error.message || 'Unknown'}` }
    }
}

export async function getAdminAvailabilityWeek(dateKey: string, workspaceId: string) {
    try {
        // SECURITY: workspace-scoped admin check (was global ADMIN only).
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        if (!isValidDateKey(dateKey)) return { error: 'Invalid date' }

        const weekKeys = getVietnamWeekKeys(dateKey)
        const dates = weekKeys.map(getVietnamDayStart)

        const workspace = await globalPrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true }
        })

        if (!workspace) return { error: 'Workspace not found' }

        const profileUsers = await globalPrisma.user.findMany({
            where: {
                OR: [
                    { profileId: workspace.profileId },
                    { profileAccesses: { some: { profileId: workspace.profileId || '' } } }
                ]
            },
            select: { id: true, username: true, nickname: true, role: true }
        })

        const availabilities = await (globalPrisma as any).dailyAvailability.findMany({
            where: { 
                profileId: workspace.profileId || '',
                workspaceId,
                date: { in: dates } 
            }
        })

        const scheduleMap = new Map<string, Record<string, string[]>>()
        for (const record of availabilities as any[]) {
            const key = getVietnamDateKey(record.date)
            const userId = record.userId
            
            const userSchedules = scheduleMap.get(userId) || {}
            userSchedules[key] = normalizeSchedule(record?.schedule as string[] | null)
            scheduleMap.set(userId, userSchedules)
        }

        const rows = profileUsers
            .map((u: any) => ({
                id: u.id,
                username: u.username,
                nickname: u.nickname,
                role: u.role,
                schedules: scheduleMap.get(u.id) || {}
            }))
            .filter((u: any) => u.role !== 'CLIENT' && u.role !== 'LOCKED')

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
