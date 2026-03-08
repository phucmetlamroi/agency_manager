'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { translateTaskNote } from '@/lib/gemini-translator'
import { revalidatePath } from 'next/cache'

/**
 * Retries the translation of a task's Vietnamese notes to English.
 * This is used as a fallback when the initial translation fails or is empty.
 */
export async function retryTaskTranslation(taskId: string, workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)

        // Fetch the task to get its Vietnamese notes
        const task = await workspacePrisma.task.findUnique({
            where: { id: taskId },
            select: { notes_vi: true }
        })

        if (!task || !task.notes_vi) {
            return { error: 'Không tìm thấy ghi chú Tiếng Việt để dịch.' }
        }

        // Call the translation service
        const notes_en = await translateTaskNote(task.notes_vi)

        if (!notes_en) {
            return { error: 'API Dịch thuật tạm thời không khả dụng. Vui lòng thử lại sau.' }
        }

        // Update the task with the new English notes
        await workspacePrisma.task.update({
            where: { id: taskId },
            data: { notes_en }
        })

        // Revalidate relevant paths to update the UI
        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/dashboard`)
        revalidatePath(`/${workspaceId}/tasks/${taskId}`)

        return { success: true, notes_en }
    } catch (error) {
        console.error('Failed to retry translation:', error)
        return { error: 'Đã xảy ra lỗi hệ thống khi thử dịch lại.' }
    }
}
