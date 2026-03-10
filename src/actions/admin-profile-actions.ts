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

    // Check if profile is tied to users or workspaces
    const userCount = await prisma.user.count({ where: { profileId: id } })
    if (userCount > 0) {
        throw new Error('Không thể xóa Team này vì đang có User liên kết.')
    }

    const workspaceCount = await prisma.workspace.count({ where: { profileId: id } })
    if (workspaceCount > 0) {
        throw new Error('Không thể xóa Team này vì đang có Workspace liên kết.')
    }

    await prisma.profile.delete({
        where: { id }
    })

    revalidatePath('/[workspaceId]/admin/users', 'page')
    return { success: true }
}
