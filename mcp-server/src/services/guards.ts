/**
 * Shared authorization guards for MCP write-tools.
 *
 * [AUDIT HT-036 / HT-041] The MCP service-account is confined to its own profile by
 * validateWorkspaceAccess(), but the individual write-tools did NOT verify that the USER or
 * CLIENT they were handed actually belongs to the target workspace/profile. That let a caller
 * assign/claim a task to a userId from another workspace, or create a task against a clientId
 * from another tenant within the profile. These guards close that gap; call them from every
 * write path that accepts an externally-supplied assigneeId/userId/clientId.
 */
import { prisma } from '../prisma-client.js'
import { getMcpAuthContext } from '../auth-context.js'

/** Throw unless `userId` is a member of workspace `wsId`. [HT-036] */
export async function assertWorkspaceMember(wsId: string, userId: string): Promise<void> {
    if (!userId) throw new Error('userId is required')
    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: wsId, userId },
        select: { id: true },
    })
    if (!member) {
        throw new Error(`User ${userId} is not a member of workspace ${wsId}`)
    }
}

/*
 * [GỠ THẺ ĐỎ 2026-07-31] `assertNotRedCarded` ĐÃ BỊ XOÁ khỏi file này.
 *
 * Nó từng chặn việc giao task cho nhân sự có MonthlyRank mới nhất là 'D', và được gọi ở 5 tool
 * (assign_task, bulk_assign_tasks, create_task, update_task_details, claim_task) để MCP không lệch
 * với web. Chủ dự án quyết định bỏ hẳn luật này ở CẢ HAI phía cùng lúc, nên guard cũng đi theo —
 * để lại một hàm không ai gọi chỉ mời người sau cắm lại một mình một bên.
 *
 * MonthlyRank vẫn được tính và hiển thị bình thường; nó chỉ không còn là hàng rào giao việc.
 * Các guard tenant trong file này (assertWorkspaceMember, assertClientInProfile) KHÔNG liên quan
 * và giữ nguyên.
 */

/** Throw unless client `clientId` belongs to the MCP profile and is active. [HT-041] */
export async function assertClientInProfile(clientId: number): Promise<void> {
    const ctx = getMcpAuthContext()
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { profileId: true, status: true },
    })
    if (!client || client.profileId !== ctx.profileId) {
        throw new Error(`Client ${clientId} does not belong to this profile`)
    }
    if (client.status === 'SOFT_DELETED' || client.status === 'MERGED') {
        throw new Error(`Client ${clientId} is not active`)
    }
}
