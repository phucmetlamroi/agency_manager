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

/**
 * [AUDIT SWEEP-2026-07-30 fix · P6-SWEEP-1] Throw nếu `userId` đang bị PHẠT THẺ ĐỎ (Rank D).
 *
 * Web chặn việc giao task cho nhân sự Rank D ở `src/actions/task-management-actions.ts` (nhánh
 * CASE: ASSIGN TO USER). MCP thì không có chốt nào — `assertWorkspaceMember` chỉ hỏi "có phải member
 * của workspace này không", mà một editor bị thẻ đỏ VẪN là member. Đây là lệch chốt NGHIỆP VỤ giữa
 * hai đường ghi vào cùng database, không phải leo thang quyền.
 *
 * Vị ngữ chép NGUYÊN từ web (bản ghi MonthlyRank mới nhất theo (userId, workspaceId), rank === 'D')
 * để hai đường không bao giờ trả lời khác nhau về cùng một người.
 *
 * ⚠️ ĐÍNH CHÍNH [PHẢN BIỆN 2026-07-30 · R7-1] — chú thích cũ ở đây nói KHÔNG gọi trong `claimTask`
 * vì "web cũng không chặn đường tự-nhận-việc". Tiền đề đó SAI, và vì tin nó mà chốt trên bị đi vòng
 * hoàn toàn: web `claimTask` lấy userId TỪ PHIÊN (`src/actions/claim-actions.ts` — `access.userId`),
 * còn tool MCP `claim_task` nhận `userId` như một THAM SỐ tuỳ ý ("for a specific user"). Cùng tên,
 * khác bản chất — bên web là TỰ NHẬN, bên MCP là GIAO CHO NGƯỜI KHÁC. Nay `marketplace-service.ts`
 * ĐÃ gọi guard này, và đó KHÔNG phải lệch chốt với web: web không có đường nào giao việc cho người
 * khác qua marketplace.
 *
 * Quyết định của chủ dự án (2026-07-30) vẫn nguyên: chỉ đưa MCP về NGANG web. Việc có chặn cả đường
 * TỰ-nhận-việc hay không vẫn là quyết định sản phẩm, phải làm ở cả hai bên cùng lúc.
 */
export async function assertNotRedCarded(wsId: string, userId: string): Promise<void> {
    if (!userId) return
    const latestRank = await prisma.monthlyRank.findFirst({
        where: { userId, workspaceId: wsId },
        orderBy: { createdAt: 'desc' },
        select: { rank: true },
    })
    if (latestRank?.rank === 'D') {
        throw new Error(
            `Không thể giao Task: nhân sự ${userId} đang bị Phạt thẻ đỏ (Rank D).`,
        )
    }
}

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
