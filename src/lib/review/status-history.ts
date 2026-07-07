// [Review module P6.4 / FR-G04] "Lịch sử trạng thái" reader. ReviewStatusHistory is
// a VIEW over the append-only ReviewActivity log (KIEN-TRUC §11.2) — no separate
// table. This surfaces the state-changing events for one asset's stack in order:
// version ready (→ awaiting review), guest approve/request-changes, card status
// change. Rendered in the player's Thông tin tab. Internal-only (guests never see it).

import { prisma } from '@/lib/db'
import { requireReviewAccess } from './access'
import { getFolderScope, assertAssetInScope } from './folder-scope'
import { apiError } from './errors'
import { REVIEW_ACTIVITY } from './activity'

const HISTORY_TYPES: string[] = [
    REVIEW_ACTIVITY.VERSION_READY,
    REVIEW_ACTIVITY.REVIEW_APPROVED,
    REVIEW_ACTIVITY.REVIEW_CHANGES_REQUESTED,
    REVIEW_ACTIVITY.STATUS_CHANGED,
    REVIEW_ACTIVITY.TASK_COMPLETED_FROM_ASSET,
]

export interface StatusHistoryEntry {
    id: string
    type: string
    label: string
    /** actor display: a member name, or "Khách: {name}" for a guest, or "Hệ thống". */
    actor: string
    versionNumber: number | null
    createdAt: string
}

const LABELS: Record<string, string> = {
    [REVIEW_ACTIVITY.VERSION_READY]: 'Sẵn sàng để duyệt',
    [REVIEW_ACTIVITY.REVIEW_APPROVED]: 'Khách đã duyệt',
    [REVIEW_ACTIVITY.REVIEW_CHANGES_REQUESTED]: 'Khách yêu cầu chỉnh sửa',
    [REVIEW_ACTIVITY.STATUS_CHANGED]: 'Đổi trạng thái',
    [REVIEW_ACTIVITY.TASK_COMPLETED_FROM_ASSET]: 'Xác nhận Hoàn tất',
}

export async function getAssetStatusHistory(assetId: string): Promise<{ entries: StatusHistoryEntry[] }> {
    const asset = await prisma.reviewAsset.findFirst({ where: { id: assetId }, select: { id: true, workspaceId: true } })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })
    // [FR-03] editor chỉ xem lịch sử trạng thái asset trong phạm vi được giao.
    await assertAssetInScope(await getFolderScope({ userId: access.userId, workspaceId: asset.workspaceId, isAdmin: access.isAdmin }), asset.id, 'read')

    const rows = await prisma.reviewActivity.findMany({
        where: { assetId, type: { in: HISTORY_TYPES } },
        orderBy: { createdAt: 'asc' },
        take: 200,
    })

    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))]
    const users = actorIds.length
        ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true, nickname: true } })
        : []
    const nameById = new Map(users.map((u) => [u.id, u.nickname || u.username]))

    const entries: StatusHistoryEntry[] = rows.map((r) => {
        const meta = (r.meta as Record<string, unknown> | null) ?? {}
        const vn = typeof meta.versionNumber === 'number' ? meta.versionNumber : null
        let label = LABELS[r.type] ?? r.type
        if (r.type === REVIEW_ACTIVITY.STATUS_CHANGED && meta.new) {
            label = `Đổi trạng thái → ${String(meta.new)}`
        }
        const actor = r.actorUserId
            ? nameById.get(r.actorUserId) ?? 'Nhân viên'
            : r.guestName
              ? `Khách: ${r.guestName}`
              : 'Hệ thống'
        return { id: r.id, type: r.type, label, actor, versionNumber: vn, createdAt: r.createdAt.toISOString() }
    })
    return { entries }
}
