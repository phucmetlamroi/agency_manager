'use server'

/**
 * [Velox v1.1 — "Kế thừa ghi chú" (renamed from "Kế thừa ghi chú tháng trước")]
 *
 * Server action for note inheritance with sub-client recursion.
 *
 * Query (Velox v1.1 — status filter removed):
 *   1. Tasks thuộc Client X **hoặc** bất kỳ client con nào của X
 *   2. Filter: notes_vi IS NOT NULL AND notes_vi != ""  (NO status filter — any task with notes qualifies)
 *   3. Sort: updatedAt DESC
 *   4. Take first record + return preview metadata (source task title, sub-client name, date)
 *
 * Behavior:
 *   - Walks Client.subsidiaries tree (recursive, depth-limit 5)
 *   - Inclusive — pulls notes from tasks of ANY status (Đang thực hiện / Revision /
 *     Hoàn tất / etc.) so long as notes_vi is non-empty. Rationale: user wants to
 *     reuse notes from in-flight tasks too, not just completed templates.
 *   - Returns preview metadata for "Note kế thừa từ task '[Title]' (Client con: Y, ngày Z)"
 *   - Scoped to all workspaces in the current profile (any sibling workspace)
 *
 * Velox v1.0 → v1.1 change: drop `status: 'Hoàn tất'` filter per user request
 * — "lấy ghi chú của những task giống với của khách hàng trước đó" (any task,
 * not just completed).
 */

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'

/* ──────────────────────────────────────────────────────────────────── */
/*  Return shape — used by Velox preview UI                            */
/* ──────────────────────────────────────────────────────────────────── */

export interface InheritedNotePreview {
    /** notes_vi content of the source task — caller fills into form `notes` */
    note: string
    /** Title of the source task (for "Note kế thừa từ task '[Title]'") */
    sourceTitle: string
    /** Sub-client name of the source task (for "Client con: Y") */
    sourceClientName: string
    /** updatedAt of the source task (for "ngày Z") */
    sourceDate: string
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Helper — recursive sub-client walker                               */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Walk Client.subsidiaries tree starting at rootClientId, return all
 * descendant client ids (including root itself). Depth-limited to prevent
 * infinite loops on bad data.
 */
async function collectClientAndSubsidiaries(
    rootClientId: number,
    maxDepth = 5,
): Promise<number[]> {
    const result: number[] = [rootClientId]
    let currentLevel: number[] = [rootClientId]

    for (let depth = 0; depth < maxDepth; depth++) {
        if (currentLevel.length === 0) break
        const children = await prisma.client.findMany({
            where: { parentId: { in: currentLevel } },
            select: { id: true },
        })
        if (children.length === 0) break
        const childIds = children.map((c) => c.id)
        result.push(...childIds)
        currentLevel = childIds
    }

    return result
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Action — getLastClientNote                                          */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Find the most recent completed task (with non-empty notes_vi) belonging to
 * the given client OR any of its sub-clients. Scoped to the current profile's
 * workspaces.
 *
 * Returns null if no matching task found (caller shows "Không có note để kế thừa").
 *
 * Admin-only (Velox is admin-gated per spec).
 */
export async function getLastClientNote(
    clientId: number,
    workspaceId: string,
): Promise<InheritedNotePreview | null> {
    try {
        const { user } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const profileId = (user as any)?.sessionProfileId
        if (!profileId) return null

        // Walk sub-client tree
        const clientIds = await collectClientAndSubsidiaries(clientId)

        // All workspaces in current profile (scope query to profile, not just current workspace)
        const profileWorkspaces = await prisma.workspace.findMany({
            where: { profileId, status: 'ACTIVE' },
            select: { id: true },
        })
        const workspaceIds = profileWorkspaces.map((w) => w.id)

        const task = await prisma.task.findFirst({
            where: {
                workspaceId: { in: workspaceIds },
                clientId: { in: clientIds },
                // [Velox v1.1] No status filter — pull from ANY task of this client
                // (or sub-clients) with non-empty notes. Inclusive: in-progress /
                // revision / completed all count as valid source.
                isArchived: false,
                NOT: [{ notes_vi: null }, { notes_vi: '' }],
            },
            orderBy: { updatedAt: 'desc' },
            select: {
                title: true,
                notes_vi: true,
                updatedAt: true,
                client: { select: { name: true } },
            },
        })

        if (!task || !task.notes_vi) return null

        return {
            note: task.notes_vi,
            sourceTitle: task.title,
            sourceClientName: task.client?.name ?? 'Unknown',
            sourceDate: task.updatedAt.toISOString().slice(0, 10), // YYYY-MM-DD
        }
    } catch (err) {
        console.error('[getLastClientNote]', err)
        return null
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Action — suggestRoundRobinAssignee                                  */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * [Velox v1.0 — "Gán editor tự động" toggle]
 *
 * Suggest the editor with the lowest current workload (count of non-completed
 * tasks assigned in this workspace). Used by Velox's auto-assign toggle.
 *
 * Round-robin MVP — tie-breaker is the natural sort order of the count list.
 * Returns null if no MEMBER role users exist or if user lacks ADMIN access.
 *
 * Moved from quick-create-actions.ts during Phase 3 cleanup.
 */
export async function suggestRoundRobinAssignee(
    workspaceId: string,
): Promise<{ userId: string; username: string; nickname: string | null; activeCount: number } | null> {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // Get all workspace members with role MEMBER (editors)
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId, role: 'MEMBER' },
            select: {
                userId: true,
                user: { select: { id: true, username: true, nickname: true } },
            },
        })

        if (members.length === 0) return null

        // Count each member's active (non-completed) task load
        const counts = await Promise.all(
            members.map(async (m) => {
                const count = await prisma.task.count({
                    where: {
                        workspaceId,
                        assigneeId: m.userId,
                        status: { notIn: ['Hoàn tất', 'Đã hủy'] },
                    },
                })
                return {
                    userId: m.userId,
                    username: m.user?.username ?? '',
                    nickname: m.user?.nickname ?? null,
                    activeCount: count,
                }
            }),
        )

        // Pick the one with lowest active count (round-robin tie-break = natural order)
        counts.sort((a, b) => a.activeCount - b.activeCount)
        return counts[0]
    } catch (err) {
        console.error('[suggestRoundRobinAssignee]', err)
        return null
    }
}
