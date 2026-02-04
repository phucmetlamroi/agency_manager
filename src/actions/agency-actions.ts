'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'

/**
 * Validates if current user is SUPER_ADMIN
 */
async function checkSuperAdmin() {
    try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')
        if (!sessionCookie) return null
        const session = await decrypt(sessionCookie.value)

        // Assuming we treat Role 'ADMIN' as Super Admin for now, 
        // or check specific username if needed. 
        // Plan said: Existing ADMIN users -> System Admins.
        if (session.user.role === 'ADMIN') return session.user
        return null
    } catch {
        return null
    }
}

/**
 * Get all agencies (Super Admin only)
 */
export async function getAllAgencies() {
    const admin = await checkSuperAdmin()
    if (!admin) return { success: false, error: 'Unauthorized' }

    try {
        const agencies = await prisma.agency.findMany({
            include: {
                owner: { select: { id: true, username: true, nickname: true } },
                _count: { select: { members: true, tasks: true } }
            },
            orderBy: { createdAt: 'desc' }
        })
        return { success: true, data: agencies }
    } catch (e) {
        return { success: false, error: 'Failed to fetch agencies' }
    }
}

/**
 * Create new Agency
 */
export async function createAgency(data: { name: string, code: string, ownerId?: string }) {
    const admin = await checkSuperAdmin()
    if (!admin) return { success: false, error: 'Unauthorized' }

    try {
        // VALIDATION: Single Role Policy
        if (data.ownerId) {
            const existingUser = await prisma.user.findUnique({
                where: { id: data.ownerId },
                include: { ownedAgency: true }
            })
            if (existingUser) {
                if (existingUser.ownedAgency.length > 0) throw new Error('User is already an Agency Owner')
                if (existingUser.agencyId) throw new Error('User is currently a Member of another Agency')
            }
        }

        const agency = await prisma.agency.create({
            data: {
                name: data.name,
                code: data.code.toUpperCase(),
                ownerId: data.ownerId,
                status: 'ACTIVE'
            }
        })

        // VALIDATION: Check if Owner is already compromised (Double Role)
        if (data.ownerId) {
            const existingUser = await prisma.user.findUnique({
                where: { id: data.ownerId },
                include: { ownedAgency: true }
            })

            if (existingUser) {
                if (existingUser.ownedAgency.length > 0) {
                    // Rollback? Or just error? 
                    // Since we already created agency, we should fail earlier.
                    // But replacing code inside the `try` block before create is better.
                    // Let's do it right.
                }
            }
        }

        // RE-PLAN: Move validation UP before creation.



        // If ownerId provided, update that user's agencyId? 
        // Usually Owner is also a member, but let's keep it flexible.
        if (data.ownerId) {
            await prisma.user.update({
                where: { id: data.ownerId },
                data: { agencyId: agency.id } // Owner belongs to their agency
            })

            // MIGRATE TASKS: Automatically assign user's existing tasks to this Agency
            // Keep assigneeId (so they keep doing it), but add assignedAgencyId
            await prisma.task.updateMany({
                where: { assigneeId: data.ownerId },
                data: { assignedAgencyId: agency.id }
            })
        }

        revalidatePath('/admin/agencies')
        revalidatePath('/admin/users')
        revalidatePath('/dashboard')
        revalidatePath('/admin/users')
        revalidatePath('/dashboard')
        revalidatePath('/admin/users')
        revalidatePath('/dashboard') // Trigger redirect logic for the user
        return { success: true, data: agency }
    } catch (e: any) {
        if (e.code === 'P2002') return { success: false, error: 'Agency code already exists' }
        return { success: false, error: 'Failed to create agency' }
    }
}

/**
 * Update Agency
 */
export async function updateAgency(id: string, data: { name?: string, status?: string, ownerId?: string }) {
    const admin = await checkSuperAdmin()
    if (!admin) return { success: false, error: 'Unauthorized' }

    try {
        await prisma.agency.update({
            where: { id },
            data: {
                ...data,
                // logic for owner update?
            }
        })

        if (data.ownerId) {
            // Link new owner to agency as member too?
            await prisma.user.update({
                where: { id: data.ownerId },
                data: { agencyId: id }
            })
        }

        revalidatePath('/admin/agencies')
        return { success: true }
    } catch (e) {
        return { success: false, error: 'Update failed' }
    }
}

/**
 * Get Agency Members (For Agency Admin Portal)
 */
export async function getAgencyMembers() {
    try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')
        if (!sessionCookie) return { success: false, error: 'Unauthorized' }
        const session = await decrypt(sessionCookie.value)

        // Check if user belongs to an agency
        // For Agency Admin Portal, we need to know WHICH agency they are admin of.
        // DB Schema: User.ownedAgency (Agency[])

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: { ownedAgency: true, agency: true }
        })

        if (!user) return { success: false, error: 'User not found' }

        // Logic: specific portal for Agency ADMIN
        // If user owns an agency, return members of THAT agency.
        // If user is just a member, maybe they can see team? (ReadOnly)

        const targetAgencyId = user.ownedAgency[0]?.id || user.agencyId

        if (!targetAgencyId) return { success: false, error: 'No agency found' }

        const members = await prisma.user.findMany({
            where: { agencyId: targetAgencyId },
            select: {
                id: true, username: true, nickname: true, email: true, role: true,
                schedules: {
                    where: {
                        startTime: { gte: new Date() }, // Future only
                        endTime: { lte: new Date(new Date().setHours(23, 59, 59)) } // Today
                    }
                }
            }
        })

        return { success: true, data: members, agency: user.ownedAgency[0] || user.agency }

    } catch (e) {
        return { success: false, error: 'Failed' }
    }
}

/**
 * Delete Agency
 */
export async function deleteAgency(id: string) {
    const admin = await checkSuperAdmin()
    if (!admin) return { success: false, error: 'Unauthorized' }

    try {
        // 1. Reset all members
        await prisma.user.updateMany({
            where: { agencyId: id },
            data: { agencyId: null }
        })

        // 2. Release all tasks (Keep assignee, just remove agency link)
        await prisma.task.updateMany({
            where: { assignedAgencyId: id },
            data: { assignedAgencyId: null }
        })

        // 2. Delete Agency
        await prisma.agency.delete({
            where: { id }
        })

        revalidatePath('/admin/agencies')
        revalidatePath('/admin/users')
        revalidatePath('/dashboard') // Critical for redirect logic

        return { success: true }
    } catch (e) {
        return { success: false, error: 'Failed to delete agency' }
    }
}
