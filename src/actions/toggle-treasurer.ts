'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function toggleTreasurer(userId: string, currentStatus: boolean, workspaceId: string) {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: { isTreasurer: !currentStatus }
        })
        revalidatePath(`/${workspaceId}/admin/users`)
        revalidatePath(`/${workspaceId}/admin/finance`)
        return { success: true }
    } catch (error) {
        return { error: 'Failed to update treasurer status' }
    }
}
