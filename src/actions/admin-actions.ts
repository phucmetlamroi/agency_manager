'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { parseVietnamDate, getMonthDateRange } from '@/lib/date-utils'
import { getSession } from '@/lib/auth'

export async function lockMonthAction(monthString?: string) {
    try {
        const session = await getSession()
        if (!session || session.user.role !== 'ADMIN') {
            return { error: 'Unauthorized' }
        }

        const { startDate, endDate } = getMonthDateRange(monthString)
        const targetYear = startDate.getFullYear()
        const targetMonth = startDate.getMonth() + 1

        // 1. Check for pending tasks in this month
        const pendingTasks = await prisma.task.findMany({
            where: {
                isArchived: false,
                status: { notIn: ['Hoàn tất', 'Tạm ngưng'] },
                deadline: {
                    gte: startDate,
                    lte: endDate
                }
            }
        })

        if (pendingTasks.length > 0) {
            return { error: `Không thể chốt tháng. Còn ${pendingTasks.length} task chưa hoàn tất (Đang đợi giao, Đang làm...). Vui lòng hoàn tất hoặc dời deadline sang tháng sau.` }
        }

        // 2. Instantiate Lock
        await prisma.payrollLock.upsert({
            where: {
                month_year: {
                    month: targetMonth,
                    year: targetYear
                }
            },
            update: {
                isLocked: true,
                lockedAt: new Date(),
                lockedBy: session.user.id
            },
            create: {
                month: targetMonth,
                year: targetYear,
                isLocked: true,
                lockedBy: session.user.id,
                lockedAt: new Date()
            }
        })

        // 3. Soft Archiving
        await prisma.task.updateMany({
            where: {
                isArchived: false,
                status: 'Hoàn tất',
                deadline: {
                    gte: startDate,
                    lte: endDate
                }
            },
            data: {
                isArchived: true
            }
        })

        revalidatePath('/admin')
        revalidatePath('/dashboard')
        revalidatePath('/admin/queue')
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Error locking month' }
    }
}

export async function updateUserRole(userId: string, newRole: string) {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole as UserRole }
        })
        revalidatePath('/admin/users')
        revalidatePath('/admin')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update role' }
    }
}

export async function updateUserReputation(userId: string, change: number) {
    try {
        // Fetch current to check bounds
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return { error: 'User not found' }

        let newRep = (user.reputation || 100) + change
        if (newRep > 100) newRep = 100
        // We allow manual override below 0? Maybe not automatically lock here, leave that to the auto-checker 
        // or strictly follow rule "Points <= 0 => Lock".
        // Let's enforce the lock if score drops <= 0

        let newRole = user.role
        if (newRep <= 0 && user.role !== 'ADMIN') {
            newRole = 'LOCKED' as UserRole
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                reputation: newRep,
                role: newRole
            }
        })
        revalidatePath('/admin/users')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update reputation' }
    }
}

export async function createTask(formData: FormData) {
    try {
        const title = formData.get('title') as string
        const value = parseFloat(formData.get('value') as string) || 0

        let assigneeId: string | null = formData.get('assigneeId') as string
        if (!assigneeId || assigneeId === '' || assigneeId === 'null') {
            assigneeId = null
        }

        const deadline = formData.get('deadline') as string
        const references = formData.get('references') as string
        const fileLink = formData.get('fileLink') as string
        const type = formData.get('type') as string || 'Short form'
        const resources = formData.get('resources') as string
        const notes = formData.get('notes') as string
        const collectFilesLink = formData.get('collectFilesLink') as string

        const jobPriceUSD = parseFloat(formData.get('jobPriceUSD') as string) || 0
        const exchangeRate = parseFloat(formData.get('exchangeRate') as string) || 25300
        const wageVND = parseFloat(formData.get('value') as string) || 0

        // Server-side calculation to ensure data integrity
        const revenueVND = jobPriceUSD * exchangeRate
        const profitVND = revenueVND - wageVND

        const clientId = formData.get('clientId') ? parseInt(formData.get('clientId') as string) : null

        // FIX: Fetch assignee's agencyId if being assigned
        let assignedAgencyId: string | null = null
        if (assigneeId) {
            const assignee = await prisma.user.findUnique({
                where: { id: assigneeId },
                select: { agencyId: true }
            })
            assignedAgencyId = assignee?.agencyId || null
        }

        await prisma.task.create({
            data: {
                title,
                value,
                type,
                deadline: deadline ? parseVietnamDate(deadline) : null,
                resources: resources || null,
                references: references || null,
                notes: notes || null,
                assigneeId: assigneeId || null,
                assignedAgencyId: assignedAgencyId, // FIX: Sync with assignee's agency
                fileLink: fileLink || null,
                collectFilesLink: collectFilesLink || null,
                status: assigneeId ? 'Đã nhận task' : 'Đang đợi giao',

                // Financials
                jobPriceUSD,
                wageVND,
                exchangeRate,
                profitVND,
                clientId
            }
        })
        revalidatePath('/admin')
        revalidatePath('/admin/queue')
        revalidatePath('/admin/crm') // Revalidate CRM to show new tasks
        return { success: true }
    } catch (e) {
        return { error: 'Error creating task' }
    }
}
