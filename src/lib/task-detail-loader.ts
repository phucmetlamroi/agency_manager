import 'server-only'

// [P2-D3] Shared server loader for the task-detail route (full-screen page +
// intercepting @modal slot). Fetches ONE hydrated task and resolves the viewer's
// admin status — replicating the exact auth + sanitize path the board pages use.
//
// ⚠️ jobPriceUSD leak discipline: this is a NEW task-serialization path. It MUST
// strip admin-only financial fields (jobPriceUSD/exchangeRate/profitVND) for
// non-admins via sanitizeTaskListForUser, and it FAILS CLOSED (isAdmin defaults
// false; any error in the admin lookup → non-admin → money stripped).

import { getSession } from '@/lib/auth'
import { getWorkspacePrisma, resolveActiveProfileId } from '@/lib/prisma-workspace'
import { verifyWorkspaceAccess } from '@/lib/security'
import { serializeDecimal } from '@/lib/serialization'
import { sanitizeTaskListForUser } from '@/lib/task-sanitize'
import type { TaskWithUser } from '@/types/admin'

// Same include as the admin board (admin/page.tsx) so TaskDetailModal receives the
// exact shape it expects (assignee + manager names, client hierarchy, tags, rawFootage).
const TASK_INCLUDE = {
    assignee: {
        select: {
            id: true, username: true, displayName: true, role: true, nickname: true,
            monthlyRanks: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { rank: true } },
        },
    },
    assignedBy: { select: { id: true, username: true, displayName: true, nickname: true } },
    // [AUDIT SWEEP-2026-07-30 fix · NEW-nested-client-full-row-to-editors]
    // `client: { include: { parent: true } }` trả NGUYÊN hàng Client vào RSC payload của trình duyệt
    // nhân viên non-admin: `depositBalance`, `tier`, `aiScore`, `frictionIndex`, `paymentRating`,
    // `inputQuality` của khách VÀ khách mẹ. Không cần dò id — mở tab Network đọc RSC flight, hoặc
    // React DevTools xem props, là thấy.
    //
    // Thu hẹp AN TOÀN VỀ KIỂU: `src/types/admin.ts` vốn đã khai báo
    // `client?: { id; name; parent?: { name } | null }` — hợp đồng type ĐÃ hẹp sẵn, runtime chỉ đang
    // trả thừa. Đã grep: không consumer nào đọc trường khác ngoài `name` / `parent.name`.
    // ⚠️ TASK_INCLUDE là hằng CHUNG cho cả admin lẫn non-admin, nên thu hẹp ở đây áp cho cả hai —
    // đúng ý muốn. Nhưng ĐỪNG thu hẹp thêm `assignee`/`assignedBy`: `mc-task-drawer-data.ts` còn đọc
    // `rank` từ đó.
    client: { select: { id: true, name: true, parentId: true, parent: { select: { name: true } } } },
    taskTags: { include: { tagCategory: { select: { id: true, name: true } } } },
    rawFootage: { select: { displayType: true } },
} as const

export type TaskDetailData =
    | { kind: 'ok'; task: TaskWithUser; isAdmin: boolean; currentUserId: string }
    | { kind: 'redirect'; to: string }
    | { kind: 'notFound' }

export async function loadTaskDetail(workspaceId: string, taskId: string): Promise<TaskDetailData> {
    const session = await getSession()
    if (!session?.user?.id) return { kind: 'redirect', to: '/login' }
    const userId = session.user.id

    const profileId = await resolveActiveProfileId(
        userId,
        workspaceId,
        (session.user as any).sessionProfileId,
    )
    if (!profileId) return { kind: 'redirect', to: '/login' }

    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    // ── Finance visibility — canonical PROFILE-SCOPED predicate, FAIL CLOSED ──
    // jobPriceUSD/exchangeRate/profitVND may be shown ONLY to a profile-scoped ADMIN
    // of THIS workspace (verifyProfileAdminAccess semantics: workspace OR profile
    // OWNER/ADMIN). Deliberately does NOT trust global User.role/isTreasurer — those
    // have no per-profile binding and are exactly what leaked finance cross-tenant
    // (security.ts R7/R8). A non-admin editor still VIEWS the task; sanitizeTaskListForUser
    // strips the $ fields. On any error / non-member → isAdmin=false (fail closed).
    let isAdmin = false
    try {
        const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        isAdmin =
            access.workspaceRole === 'OWNER' || access.workspaceRole === 'ADMIN' ||
            access.profileRole === 'OWNER' || access.profileRole === 'ADMIN'
    } catch {
        isAdmin = false
    }

    const rawTask = await (workspacePrisma as any).task.findUnique({
        where: { id: taskId },
        include: TASK_INCLUDE,
    })
    if (!rawTask) return { kind: 'notFound' }

    // Sanitize (strip admin-only $ for non-admins) BEFORE serialize — same order as the pages.
    const [task] = serializeDecimal(sanitizeTaskListForUser([rawTask], isAdmin)) as any[]
    return { kind: 'ok', task: task as TaskWithUser, isAdmin, currentUserId: userId }
}
