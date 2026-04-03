'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'

const MAX_TEMPLATES = 15

export async function getTemplates(workspaceId: string) {
    try {
        const templates = await prisma.priceTemplate.findMany({
            where: { workspaceId },
            orderBy: { sortOrder: 'asc' },
            take: MAX_TEMPLATES,
        })
        return { templates }
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

        await prisma.priceTemplate.delete({
            where: { id }
        })

        revalidatePath(`/${workspaceId}/admin`)
        return { success: true }
    } catch (error) {
        console.error('Delete Template Error:', error)
        return { error: 'Failed to delete template' }
    }
}
