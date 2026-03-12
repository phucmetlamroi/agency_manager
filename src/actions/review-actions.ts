'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// Fetch the error dictionary for the UI
export async function getErrorDictionary(workspaceId: string) {
    const session = await getSession()
    if (!session || !session.user) return []
    
    const prisma = getWorkspacePrisma(workspaceId)
    return await prisma.errorDictionary.findMany({ 
        where: { isActive: true }, 
        orderBy: { penalty: 'desc' } 
    })
}

// Transaction: Mark Task Revision + Insert Error Logs
export async function submitManagerReview(taskId: string, workspaceId: string, errors: { errorId: string, count: number }[], notes?: string) {
    const session = await getSession()
    if (!session || !session.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
        return { success: false, error: 'Unauthorized' }
    }

    const prisma = getWorkspacePrisma(workspaceId)
    
    try {
        const task = await prisma.task.findUnique({ where: { id: taskId } })
        if (!task || !task.assigneeId) {
            return { success: false, error: 'Task not found or has no assignee' }
        }

        const profileId = session.user.sessionProfileId || null

        const dict = await prisma.errorDictionary.findMany()

        await prisma.$transaction(async (tx) => {
            // 1. Change task state to Revision
            await tx.task.update({
                where: { id: taskId },
                data: { 
                    status: 'Revision',
                    notes_vi: notes ? `${task.notes_vi || ''}\n\n[MANAGER FEEDBACK]: ${notes}` : task.notes_vi
                }
            })

            // 2. Insert error logs based on count
            const errorLogs = errors.map(err => {
                const penalty = dict.find(d => d.id === err.errorId)?.penalty || 0
                return {
                    taskId: taskId,
                    userId: task.assigneeId!,
                    errorId: err.errorId,
                    frequency: err.count,
                    calculatedScore: err.count * penalty,
                    detectedById: session.user.id,
                    workspaceId: workspaceId,
                    profileId: profileId
                }
            })

            if (errorLogs.length > 0) {
                await tx.errorLog.createMany({
                    data: errorLogs
                })
            }
        })

        revalidatePath(`/${workspaceId}/dashboard`)
        revalidatePath(`/${workspaceId}/admin`)
        return { success: true }
    } catch (e) {
        console.error('[Submit Review Error]', e)
        return { success: false, error: 'Database error while submitting review' }
    }
}
