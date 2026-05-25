'use server'

/**
 * [Velox v1.0 — Spec section 6: Kế thừa ghi chú theo Client]
 *
 * Server action for note inheritance with sub-client recursion.
 *
 * Spec 6.1 query:
 *   1. Tasks thuộc Client X **hoặc** bất kỳ client con nào của X
 *   2. Filter: status = "Hoàn tất" AND notes_vi IS NOT NULL AND notes_vi != ""
 *   3. Sort: updatedAt DESC
 *   4. Take first record + return preview metadata (source task title, sub-client name, date)
 *
 * Differs from existing `getPreviousWorkspaceNotes` (quick-create-actions.ts):
 *   - Walks Client.subsidiaries tree (not just exact clientId match)
 *   - Filters by status='Hoàn tất' (vs. any status)
 *   - Returns preview metadata for "Note kế thừa từ task '[Title]' (Client con: Y, ngày Z)"
 *   - Scoped to current workspace + any sibling workspaces in same profile (not just "previous workspace")
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
                status: 'Hoàn tất',
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
