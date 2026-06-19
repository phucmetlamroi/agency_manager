'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'

export async function toggleTreasurer(userId: string, currentStatus: boolean, workspaceId: string) {
    try {
        // [AUDIT R1 — BLOCKER fix] This action was wide open: anyone could set the
        // global `isTreasurer` (finance/payroll) flag on any userId. Now require the
        // caller to be a workspace ADMIN, and only allow toggling treasurer for a
        // member of THIS workspace.
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const targetMember = await prisma.workspaceMember.findFirst({
            where: { userId, workspaceId },
            select: { id: true },
        })
        if (!targetMember) {
            return { error: 'Người dùng không thuộc workspace này.' }
        }
        await prisma.user.update({
            where: { id: userId },
            data: { isTreasurer: !currentStatus },
        })
        revalidatePath(`/${workspaceId}/admin/finance`)
        return { success: true }
    } catch (error) {
        return { error: 'Failed to update treasurer status' }
    }
}
