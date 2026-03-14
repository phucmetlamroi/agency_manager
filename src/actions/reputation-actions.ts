'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { revalidatePath } from 'next/cache'

export async function checkOverdueTasks(workspaceId: string) {
    try {
        if (!workspaceId) return { error: 'WorkspaceId required' }
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const now = new Date()

        // Find tasks that are overdue, not completed, and are STILL assigned
        const overdueTasks = await workspacePrisma.task.findMany({
            where: {
                deadline: { lt: now }, // Deadline has passed
                status: { notIn: ['Hoàn tất'] }, // Not done
                assigneeId: { not: null } // Must be assigned
            },
            include: {
                assignee: true
            }
        })

        const notifications = []

        for (const task of overdueTasks) {
            if (!task.assignee) continue

            // Determine if valid for penalty
            const isRecycle = task.isPenalized // If already true, it's a "stuck" task or double-check.

            let newRep = task.assignee.reputation || 100
            let statusMsg = 'Bình thường'
            let notifMessage = ''

            if (!isRecycle) {
                // FRESH PENALTY
                newRep = newRep - 10

                // Check Lock
                let newRole = task.assignee.role
                if (newRep <= 0) {
                    newRole = 'LOCKED'
                    statusMsg = 'Đã xóa (LOCKED)'
                } else if (newRep < 50) {
                    statusMsg = 'Cảnh báo'
                }

                await workspacePrisma.user.update({
                    where: { id: task.assignee.id },
                    data: { reputation: newRep, role: newRole }
                })

                notifMessage = `THU HỒI TASK: "${task.title}" từ @${task.assignee.username} do quá hạn. (Đã trừ 10đ)`
            } else {
                // ALREADY PENALIZED BUT STILL ASSIGNED (Stuck state cleanup)
                // Just recall, no double penalty.
                notifMessage = `THU HỒI LẠI TASK: "${task.title}" từ @${task.assignee.username} (Đã phạt trước đó)`
            }

            // Common Recall Logic
            await workspacePrisma.$transaction([
                workspacePrisma.task.update({
                    where: { id: task.id },
                    data: {
                        isPenalized: true, // Mark as "failed" history
                        assigneeId: null, // Kick user
                        assignedAgencyId: null,
                        status: 'Đang đợi giao',
                        notes_vi: (task.notes_vi || '') + `\n[System] Thu hồi do quá hạn (Deadline: ${task.deadline?.toLocaleString('vi-VN')})`,
                        deadline: null // Reset deadline so it's fresh for next assignee
                    }
                })
            ])

            notifications.push({
                editor: task.assignee.username,
                score: isRecycle ? 'No Change' : `${newRep}/100 (-10)`,
                reason: `Trễ Task [${task.title}] - ĐÃ THU HỒI`,
                status: statusMsg,
                taskId: task.id
            })
        }

        if (notifications.length > 0) {
            revalidatePath(`/${workspaceId}/admin`)
            revalidatePath(`/${workspaceId}/admin/queue`)
            revalidatePath(`/${workspaceId}/dashboard`)
        }

        return { success: true, notifications }

    } catch (error) {
        console.error("Error checking overdue tasks:", error)
        return { error: 'Failed' }
    }
}
