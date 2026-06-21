'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'

export async function toggleTreasurer(userId: string, currentStatus: boolean, workspaceId: string) {
    try {
        // [AUDIT R1 — BLOCKER fix] This action was wide open: anyone could set the
        // global `isTreasurer` (finance/payroll) flag on any userId.
        // [AUDIT R14 — fix] Treasurer is a separation-of-duty role — require OWNER (not
        // just ADMIN, which would let an admin self-grant it) and forbid self-toggling.
        const { userId: actorId } = await verifyWorkspaceAccess(workspaceId, 'OWNER')
        if (userId === actorId) {
            return { error: 'Không thể tự cấp/thu quyền Thủ Quỹ cho chính mình.' }
        }
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
