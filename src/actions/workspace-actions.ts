'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createWorkspaceAction(formData: FormData) {
    const session = await getSession()
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
        return { error: 'Chỉ Admin mới có quyền tạo Workspace mới.' }
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string

    if (!name || name.trim().length === 0) {
        return { error: 'Tên Workspace không được để trống' }
    }

    try {
        let newWorkspaceId = ''
        await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
                data: {
                    name,
                    description: description || null,
                }
            })
            newWorkspaceId = workspace.id

            await tx.workspaceMember.create({
                data: {
                    userId: session.user.id,
                    workspaceId: workspace.id,
                    role: 'OWNER'
                }
            })
        })

        revalidatePath('/workspace')
        return { success: true, workspaceId: newWorkspaceId }
    } catch (e: any) {
        console.error(e)
        return { error: 'Lỗi khởi tạo Workspace' }
    }
}

export async function renameWorkspaceAction(workspaceId: string, newName: string) {
    const session = await getSession()
    if (!session?.user?.id) {
        return { error: 'Unauthorized' }
    }

    if (!newName || newName.trim().length === 0) {
        return { error: 'Tên mới không được để trống' }
    }

    try {
        await prisma.workspace.update({
            where: { id: workspaceId },
            data: { name: newName }
        })
        revalidatePath('/workspace')
        return { success: true }
    } catch (error) {
        console.error(error)
        return { error: 'Lỗi khi đổi tên Workspace' }
    }
}

export async function deleteWorkspaceAction(workspaceId: string) {
    const session = await getSession()
    if (!session?.user?.id) {
        return { error: 'Unauthorized' }
    }

    try {
        // Check if user is the OWNER of the workspace
        const membership = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: session.user.id,
                    workspaceId
                }
            }
        })

        if (!membership || membership.role !== 'OWNER') {
            return { error: 'Bạn không có quyền xóa Workspace này. Chỉ chủ sở hữu mới có quyền xóa.' }
        }

        await prisma.workspace.delete({
            where: { id: workspaceId }
        })

        revalidatePath('/workspace')
        return { success: true }
    } catch (error) {
        console.error(error)
        return { error: 'Lỗi khi xóa Workspace' }
    }
}
