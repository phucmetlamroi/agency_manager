'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createProfile(data: { name: string, bannerUrl?: string, logoUrl?: string }) {
    const session = await getSession()
    if (session?.user?.username !== 'admin') {
        throw new Error('Unauthorized')
    }

    const { name, bannerUrl, logoUrl } = data

    if (!name || name.trim() === '') {
        throw new Error('Profile name is required')
    }

    const newProfile = await prisma.profile.create({
        data: {
            name: name.trim(),
            bannerUrl: bannerUrl?.trim() || null,
            logoUrl: logoUrl?.trim() || null,
        }
    })

    revalidatePath('/[workspaceId]/admin/users', 'page')
    return { success: true, profile: newProfile }
}

export async function updateProfile(id: string, data: { name: string, bannerUrl?: string, logoUrl?: string }) {
    const session = await getSession()
    if (session?.user?.username !== 'admin') {
        throw new Error('Unauthorized')
    }

    const { name, bannerUrl, logoUrl } = data

    if (!name || name.trim() === '') {
        throw new Error('Profile name is required')
    }

    const updatedProfile = await prisma.profile.update({
        where: { id },
        data: {
            name: name.trim(),
            bannerUrl: bannerUrl?.trim() || null,
            logoUrl: logoUrl?.trim() || null,
        }
    })

    revalidatePath('/[workspaceId]/admin/users', 'page')
    return { success: true, profile: updatedProfile }
}

export async function deleteProfile(id: string) {
    const session = await getSession()
    if (session?.user?.username !== 'admin') {
        throw new Error('Unauthorized')
    }

    // Since we are "Super Admin", we can delete even if there are members.
    // We will nullify the profileId on all related models to avoid foreign key violations.
    await prisma.$transaction([
        prisma.user.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.workspace.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.task.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.client.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.project.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.invoice.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.payroll.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.monthlyBonus.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.payrollLock.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.performanceMetric.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.agency.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.profile.delete({ where: { id } })
    ])

    revalidatePath('/[workspaceId]/admin/users', 'page')
    return { success: true }
}

export async function changeUserProfile(userId: string, newProfileId: string | null, workspaceId: string) {
    const session = await getSession()
    if (session?.user?.username !== 'admin') {
        throw new Error('Unauthorized')
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { profileId: newProfileId }
        })
        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (e) {
        return { error: 'Failed to change user team' }
    }
}
