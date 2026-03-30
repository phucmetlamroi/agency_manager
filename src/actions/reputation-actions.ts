'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { revalidatePath } from 'next/cache'

export async function checkOverdueTasks(workspaceId: string) {
    try {
        if (!workspaceId) return { error: 'WorkspaceId required' }
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const now = new Date()

        // Tìm các task đã quá hạn, chưa hoàn tất và vẫn đang được giao
        const overdueTasks = await workspacePrisma.task.findMany({
            where: {
                deadline: { lt: now }, // Hết hạn
                status: { notIn: ['Hoàn tất'] }, // Chưa xong
                assigneeId: { not: null } // Đang có người nhận
            },
            include: {
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        role: true,
                        nickname: true
                    }
                }
            }
        })

        const notifications = []

        for (const task of overdueTasks) {
            if (!task.assignee) continue

            // Logic Thu Hồi Task (Recall) - Giữ lại theo yêu cầu người dùng
            await workspacePrisma.$transaction([
                workspacePrisma.task.update({
                    where: { id: task.id },
                    data: {
                        isPenalized: true, // Đánh dấu lịch sử trễ
                        assigneeId: null, // Gỡ người nhận
                        assignedAgencyId: null,
                        status: 'Đang đợi giao',
                        notes_vi: (task.notes_vi || '') + `\n[System] Thu hồi do quá hạn (Deadline: ${task.deadline?.toLocaleString('vi-VN')})`,
                        deadline: null // Reset deadline để giao mới
                    }
                })
            ])

            notifications.push({
                editor: task.assignee.username,
                score: 'N/A',
                reason: `Trễ Task [${task.title}] - ĐÃ THU HỒI`,
                status: 'Thu hồi',
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
