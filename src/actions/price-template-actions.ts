'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'

const MAX_TEMPLATES = 15

export async function getTemplates(workspaceId: string) {
    try {
        // [AUDIT R12 — HIGH fix] This READ had NO authz and used the global prisma client
        // (no getWorkspacePrisma scope), so ANY caller — incl. a member of another tenant —
        // could pass any workspaceId and read its PriceTemplate rows, leaking priceUSD (the
        // agency's USD price-per-video = revenue/margin) + wageVND cross-tenant. Gate like
        // listPricingRules: require membership, and strip the USD revenue field for non-admins
        // (keep wageVND for the wage dropdown). createTemplate/deleteTemplate already gate ADMIN.
        const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        const isAdmin =
            access.workspaceRole === 'OWNER' || access.workspaceRole === 'ADMIN' ||
            access.profileRole === 'OWNER' || access.profileRole === 'ADMIN'

        const templates = await prisma.priceTemplate.findMany({
            where: { workspaceId },
            orderBy: { sortOrder: 'asc' },
            take: MAX_TEMPLATES,
        })
        const safeTemplates = isAdmin
            ? templates
            : templates.map(t => ({ ...t, priceUSD: null }))
        return { templates: safeTemplates }
    } catch (error) {
        console.error('Get Templates Error:', error)
        return { templates: [] }
    }
}

export async function createTemplate(
    data: { name: string; priceUSD: number | null; wageVND: number | null },
    workspaceId: string
) {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // Check limit
        const count = await prisma.priceTemplate.count({ where: { workspaceId } })
        if (count >= MAX_TEMPLATES) {
            return { error: `Maximum ${MAX_TEMPLATES} templates allowed` }
        }

        const template = await prisma.priceTemplate.create({
            data: {
                name: data.name,
                priceUSD: data.priceUSD,
                wageVND: data.wageVND,
                sortOrder: count,
                workspaceId,
            }
        })

        revalidatePath(`/${workspaceId}/admin`)
        return { success: true, template }
    } catch (error) {
        console.error('Create Template Error:', error)
        return { error: 'Failed to create template' }
    }
}

export async function deleteTemplate(id: string, workspaceId: string) {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // [AUDIT HT-011/012 fix] Scope the delete to the workspace. Deleting by `id` alone let a
        // workspace admin delete ANOTHER tenant's PriceTemplate (cross-tenant IDOR): they pass a
        // foreign template id + their own workspaceId, which passes verifyWorkspaceAccess. deleteMany
        // with the workspaceId predicate makes it atomic + tenant-safe.
        const { count } = await prisma.priceTemplate.deleteMany({
            where: { id, workspaceId }
        })
        if (count === 0) return { error: 'Không tìm thấy mẫu giá trong workspace này.' }

        revalidatePath(`/${workspaceId}/admin`)
        return { success: true }
    } catch (error) {
        console.error('Delete Template Error:', error)
        return { error: 'Failed to delete template' }
    }
}
