'use server'

/**
 * [Velox v1.2 — "Kế thừa ghi chú"]
 *
 * Note inheritance matched by client NAME-PATH across the whole profile
 * (NOT by client id).
 *
 * Why: clients are re-created per workspace, so the same logical client "Jacob"
 * has a DIFFERENT id in every month's workspace (vd tháng 4 id 213, tháng 5 id
 * 216). Matching by id could never reach previous months. We instead identify a
 * client by its hierarchical name-path ("Jacob" / "Jacob/Unit") and gather every
 * record sharing that path across all ACTIVE workspaces of the profile.
 *
 * Query:
 *   1. Compute the selected client's name-path (walk parent chain).
 *   2. Collect all client ids in the profile with the SAME path — EXACT, so
 *      "Jacob" ≠ "Jacob/Unit" (sub-client notes stay separate from the parent).
 *   3. Tasks of those ids, across all ACTIVE profile workspaces, notes_vi
 *      non-empty, isArchived=false. NO status filter (any task with a note).
 *   4. Sort updatedAt DESC → take first → preview metadata.
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
/*  Helper — cross-workspace client identity via hierarchical name-path  */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Clients are re-created per workspace, so the SAME logical client ("Jacob")
 * exists as many records with different ids across the profile's workspaces.
 * We therefore identify a client by its hierarchical NAME-PATH instead of its id:
 *   - parent "Jacob"        → "jacob"
 *   - child  "Jacob/Unit"   → "jacob/unit"
 *
 * Matching is EXACT on the path: "Jacob" ≠ "Jacob/Unit" (a sub-client's notes
 * are kept separate from the parent's). Each segment is normalised (trim +
 * lowercase) so casing/spacing differences across months still collapse to one
 * identity.
 */
function buildClientPath(
    clientId: number,
    byId: Map<number, { name: string; parentId: number | null }>,
    maxDepth = 6,
): string {
    const names: string[] = []
    let current: number | null = clientId
    let depth = 0
    while (current != null && depth < maxDepth) {
        const c = byId.get(current)
        if (!c) break
        names.push((c.name ?? '').trim().toLowerCase())
        current = c.parentId
        depth++
    }
    return names.reverse().join('/')
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Action — getLastClientNote                                          */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Inherit the most recent note (non-empty notes_vi) of the SAME client —
 * identified by hierarchical name-path — across ALL ACTIVE workspaces in the
 * current profile. EXACT match: picking "Jacob" pulls only "Jacob" notes, not
 * "Jacob/Unit". Solves the cross-month problem where each workspace has its own
 * "Jacob" record with a different client id.
 *
 * Returns null if no matching task found (caller shows "Không có note để kế thừa").
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

        // All ACTIVE workspaces in the current profile
        const profileWorkspaces = await prisma.workspace.findMany({
            where: { profileId, status: 'ACTIVE' },
            select: { id: true },
        })
        const workspaceIds = profileWorkspaces.map((w) => w.id)

        // Load every client in the profile (workspace-scoped OR profile-scoped) so
        // we can compute name-paths in memory (no N+1). ~hundreds of rows — cheap.
        const clients = await prisma.client.findMany({
            where: { OR: [{ profileId }, { workspaceId: { in: workspaceIds } }], status: { not: 'SOFT_DELETED' } },
            select: { id: true, name: true, parentId: true },
        })
        const byId = new Map<number, { name: string; parentId: number | null }>(
            clients.map((c) => [c.id, { name: c.name, parentId: c.parentId }]),
        )

        // Ensure the selected client is loaded (defensive — it normally lives in
        // the current ACTIVE workspace and is already present in `clients` along
        // with its ancestors).
        if (!byId.has(clientId)) {
            const sel = await prisma.client.findUnique({
                where: { id: clientId },
                select: { id: true, name: true, parentId: true },
            })
            if (!sel) return null
            byId.set(sel.id, { name: sel.name, parentId: sel.parentId })
        }

        const targetPath = buildClientPath(clientId, byId)
        if (!targetPath) return null

        // Every client id in the profile sharing the SAME name-path (i.e. the same
        // logical client across all months/workspaces). EXACT → excludes sub-clients.
        const matchingIds = clients
            .filter((c) => buildClientPath(c.id, byId) === targetPath)
            .map((c) => c.id)
        if (!matchingIds.includes(clientId)) matchingIds.push(clientId)

        const task = await prisma.task.findFirst({
            where: {
                workspaceId: { in: workspaceIds },
                clientId: { in: matchingIds },
                // No status filter — any task of this client with a note qualifies.
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

        // Get all workspace members with role MEMBER (editors).
        // [Bug 2026-06-10] FK violation on Task.assigneeId — root cause: this
        // path returned `m.userId` straight from WorkspaceMember, but the
        // joined `m.user` could be NULL when a User row had been removed by
        // a non-Prisma path (raw SQL, manual SUPABASE delete) without
        // Cascade firing the WorkspaceMember cleanup. The orphan userId then
        // reached createTask → Prisma FK rejected. Defensive filter below.
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId, role: 'MEMBER' },
            select: {
                userId: true,
                user: { select: { id: true, username: true, nickname: true } },
            },
        })

        // [Orphan guard] Drop rows where the joined User no longer exists.
        const validMembers = members.filter((m) => m.user != null)
        if (validMembers.length === 0) return null

        // Count each member's active (non-completed) task load
        const counts = await Promise.all(
            validMembers.map(async (m) => {
                const count = await prisma.task.count({
                    where: {
                        workspaceId,
                        assigneeId: m.userId,
                        status: { notIn: ['Hoàn tất', 'Đã hủy'] },
                    },
                })
                return {
                    userId: m.userId,
                    username: m.user!.username,
                    nickname: m.user!.nickname,
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
