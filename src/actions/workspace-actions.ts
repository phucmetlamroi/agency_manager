'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createWorkspaceAction(formData: FormData) {
    const session = await getSession()
    if (!session?.user?.id) {
        return { error: 'Unauthorized' }
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string

    if (!name || name.trim().length === 0) {
        return { error: 'Tên Workspace không được để trống' }
    }

    try {
        await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
                data: {
                    name,
                    description: description || null,
                }
            })

            await tx.workspaceMember.create({
                data: {
                    userId: session.user.id,
                    workspaceId: workspace.id,
                    role: 'OWNER'
                }
            })
        })

        revalidatePath('/workspaces')
        return { success: true }
    } catch (e: any) {
        console.error(e)
        return { error: 'Lỗi khởi tạo Workspace' }
    }
}
