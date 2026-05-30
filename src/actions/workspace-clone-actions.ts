'use server'

/**
 * Clone clients (+ optional pricing rules) from one workspace into another.
 *
 * Why: clients are workspace-scoped and re-created every month, so recurring
 * customers must be retyped each new workspace. This powers the "Sao chép khách
 * hàng" option on the create-workspace modal (and can power a CRM "import"
 * button later). Future: gate behind a Pro plan (seam left below).
 */

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'
import { audit } from '@/lib/audit-log'

export interface CopyClientItem {
    id: number
    name: string
    parentId: number | null
}

/**
 * Flat list of a source workspace's clients for the copy picker. Admin-gated.
 */
export async function getWorkspaceClientsForCopy(
    sourceWorkspaceId: string,
): Promise<{ clients: CopyClientItem[] } | { error: string }> {
    try {
        await verifyWorkspaceAccess(sourceWorkspaceId, 'ADMIN')
        const clients = await prisma.client.findMany({
            where: { workspaceId: sourceWorkspaceId },
            select: { id: true, name: true, parentId: true },
            orderBy: { name: 'asc' },
        })
        return { clients }
    } catch (err: any) {
        if (typeof err?.message === 'string' && err.message.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Bạn không có quyền xem khách hàng của workspace này.' }
        }
        console.error('[getWorkspaceClientsForCopy]', err)
        return { error: 'Không tải được danh sách khách hàng.' }
    }
}

/**
 * Clone the selected clients (preserving parent/child hierarchy) and optionally
 * their pricing rules from `sourceWorkspaceId` into `targetWorkspaceId`.
 *
 * Security: both workspaces must be ADMIN-accessible by the caller; only clients
 * actually belonging to the source workspace are cloned (foreign ids ignored);
 * ancestors of any selected client are auto-included to avoid orphans.
 */
export async function copyClientsToWorkspace(
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    clientIds: number[],
    copyPricing: boolean,
): Promise<{ success: true; count: number } | { error: string }> {
    try {
        if (!sourceWorkspaceId || sourceWorkspaceId === targetWorkspaceId) {
            return { error: 'Workspace nguồn không hợp lệ.' }
        }

        const { user, userId } = await verifyWorkspaceAccess(targetWorkspaceId, 'ADMIN')
        await verifyWorkspaceAccess(sourceWorkspaceId, 'ADMIN')
        const profileId = (user as any)?.sessionProfileId as string | undefined
        if (!profileId) return { error: 'Không tìm thấy Profile.' }

        // [Pro] await requireProFeature(profileId) — seam: bật khi có hệ subscription.

        // Load ALL source clients to resolve ancestors + validate selection.
        const sourceClients = await prisma.client.findMany({
            where: { workspaceId: sourceWorkspaceId },
            select: {
                id: true, name: true, parentId: true,
                tier: true, inputQuality: true, paymentRating: true,
            },
        })
        const byId = new Map(sourceClients.map((c) => [c.id, c]))

        // Validated selection (drop foreign ids) + auto-include ancestors.
        const selected = new Set<number>()
        for (const id of clientIds) {
            if (!byId.has(id)) continue
            let cur: number | null = id
            let guard = 0
            while (cur != null && byId.has(cur) && !selected.has(cur) && guard < 8) {
                selected.add(cur)
                cur = byId.get(cur)!.parentId
                guard++
            }
        }
        if (selected.size === 0) return { error: 'Chưa chọn khách hàng nào để sao chép.' }

        const idMap = new Map<number, number>() // oldId → newId

        await prisma.$transaction(async (tx) => {
            // Phase 1 — create all selected clients with parentId=null
            for (const oldId of selected) {
                const src = byId.get(oldId)!
                const created = await tx.client.create({
                    data: {
                        name: src.name,
                        parentId: null,
                        tier: src.tier,
                        inputQuality: src.inputQuality,
                        paymentRating: src.paymentRating,
                        workspaceId: targetWorkspaceId,
                        profileId,
                    },
                    select: { id: true },
                })
                idMap.set(oldId, created.id)
            }

            // Phase 2 — remap parentId where the parent was also cloned
            for (const oldId of selected) {
                const src = byId.get(oldId)!
                if (src.parentId != null && idMap.has(src.parentId)) {
                    await tx.client.update({
                        where: { id: idMap.get(oldId)! },
                        data: { parentId: idMap.get(src.parentId)! },
                    })
                }
            }

            // Phase 3 — optional pricing rules (per-client of cloned clients + workspace-default)
            if (copyPricing) {
                const rules = await tx.pricingRule.findMany({
                    where: {
                        workspaceId: sourceWorkspaceId,
                        OR: [
                            { clientId: { in: Array.from(selected) } },
                            { clientId: null },
                        ],
                    },
                })
                for (const r of rules) {
                    const newClientId = r.clientId == null ? null : idMap.get(r.clientId) ?? null
                    // skip per-client rules whose client wasn't cloned
                    if (r.clientId != null && newClientId == null) continue
                    await tx.pricingRule.create({
                        data: {
                            name: r.name,
                            clientId: newClientId,
                            workspaceId: targetWorkspaceId,
                            profileId,
                            ruleType: r.ruleType,
                            config: r.config as any,
                            // keep default only for the workspace-default rule
                            isDefault: r.clientId == null ? r.isDefault : false,
                            sortOrder: r.sortOrder,
                        },
                    })
                }
            }
        })

        await audit({
            workspaceId: targetWorkspaceId,
            actorUserId: userId,
            action: 'workspace.clients_cloned',
            targetType: 'Workspace',
            targetId: targetWorkspaceId,
            after: { sourceWorkspaceId, count: idMap.size, copyPricing },
        })

        revalidatePath(`/${targetWorkspaceId}/admin/crm`)
        return { success: true, count: idMap.size }
    } catch (err: any) {
        if (typeof err?.message === 'string' && err.message.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Bạn không có quyền sao chép khách hàng.' }
        }
        console.error('[copyClientsToWorkspace]', err)
        return { error: 'Lỗi khi sao chép khách hàng.' }
    }
}
