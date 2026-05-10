'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { validateTransition, TaskState } from '@/lib/fsm-config'

import { getCurrentUser } from '@/lib/auth-guard'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { audit } from '@/lib/audit-log'

// Note (Sprint A simplification): bỏ parameter `feedbackData` (Feedback model
// đã DROP). Backward-compat: caller cũ (nếu còn) vẫn gọi được, parameter
// silently ignored. Sẽ remove hoàn toàn ở major version sau.
export async function updateTaskStatus(id: string, newStatus: string, workspaceId: string, newNotes?: string, _legacyFeedbackData?: unknown, currentVersion?: number) {
    try {
        // --- LAYER 1 & 2: AUTH & CONTEXT ---
        const user = await getCurrentUser()

        // --- LAYER 3: DATA SCOPE ---
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const task = await workspacePrisma.task.findUnique({
            where: { id },
            include: {
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        role: true,
                        nickname: true,
                        email: true
                    }
                },
                // [Sprint P] Need assignedBy (admin who created task) for email
                // routing — email tới admin khi user start/deliver, KHÔNG gửi user.
                assignedBy: {
                    select: {
                        id: true,
                        username: true,
                        nickname: true,
                        email: true,
                    }
                },
                // [Sprint P] Need client.name cho email body template (GĐ3 + GĐ4).
                client: { select: { name: true } },
            }
        })

        if (!task) return { error: 'Task not found' }

        // RBAC CHECK:
        if (!user.isSuperAdmin) {
            // Can ONLY update tasks assigned to themselves
            if (task.assigneeId !== user.id) {
                return { error: 'Forbidden: Bạn chỉ được cập nhật Task của chính mình.' }
            }
        }

        // --- FSM GUARD (Enterprise Logic) ---
        // Validate if this state transition is legal according to strict rules
        const transitionCheck = validateTransition(task.status, newStatus)
        if (!transitionCheck.isValid) {
            console.error(`[FSM Block] Invalid Transition: ${task.status} -> ${newStatus}`)
            return { error: `Lỗi quy trình: ${transitionCheck.error}` } // Return user-friendly FSM error
        }

        // OPTIMISTIC LOCKING CHECK (Concurrency Control)
        if (typeof currentVersion === 'number' && task.version !== currentVersion) {
            return { error: 'Task has been updated by someone else. Please refresh.' } // UI should handle this
        }

        // Sprint A simplification: SUBMIT flow giờ là Đang thực hiện → Revision
        // (không còn intermediate Review). Khi user nộp → status=Revision +
        // deadline=null (cleared) → cron check-deadline KHÔNG flag Quá hạn oan.
        //
        // 'Tạm ngưng': pause task, deadline cũng cleared.
        // Khi cần resume / extend → admin manually set deadline mới.
        const restrictedStatuses = ['Tạm ngưng', 'Revision']
        const deadlineUpdate = restrictedStatuses.includes(newStatus) ? { deadline: null } : {}

        // --- SMART STOPWATCH LOGIC ---
        // (Removed to save database usage)



        // --- TRANSACTION BLOCK ---
        // Sprint A simplification: Feedback model đã DROP (không còn
        // ManagerReviewChecklist + bảng đánh giá Client/Internal).
        const transactionResult = await workspacePrisma.$transaction(async (tx) => {
            // [REMOVED] Logic: Reward if Completed Early/On-Time (Reputation)
            // [REMOVED] Feedback creation (model dropped)

            // Update Task Status
            const updateData = {
                status: newStatus,
                ...(newNotes ? { notes_vi: newNotes } : {}),
                ...deadlineUpdate,
                version: { increment: 1 }
            }

            let result
            if (typeof currentVersion === 'number') {
                result = await tx.task.updateMany({
                    where: {
                        id,
                        version: currentVersion
                    },
                    data: updateData
                })
            } else {
                result = await tx.task.updateMany({
                    where: { id },
                    data: updateData
                })
            }

            return result
        })

        if (transactionResult.count === 0) {
            // Check if task exists to distinguish found vs version mismatch
            const exists = await workspacePrisma.task.findUnique({ where: { id } })
            if (!exists) return { error: 'Task not found' }
            return { error: 'Task has been modified by another user. Please refresh.' } // Concurrency Error
        }

        // Fetch updated task for Emails & Return
        // [Sprint P] include assignedBy + client for new email routing logic.
        const updatedTaskResult = await workspacePrisma.task.findUnique({
            where: { id },
            include: {
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        role: true,
                        nickname: true,
                        email: true
                    }
                },
                assignedBy: {
                    select: {
                        id: true,
                        username: true,
                        nickname: true,
                        email: true,
                    }
                },
                client: { select: { name: true } },
            }
        })

        if (!updatedTaskResult) return { error: 'Error fetching updated task' }

        // --- [Sprint P] EMAIL + IN-APP NOTIFICATION ROUTING ---
        // Branch theo (newStatus, oldStatus, actor):
        //   GĐ3: user start (Nhận task → Đang thực hiện by assignee) → email + notif tới assignedBy admin
        //   GĐ4: user delivery (Đang thực hiện → Revision by assignee + productLink) → email + notif tới assignedBy admin
        //   Admin resume (Revision → Đang thực hiện): email user (feedback resolution)
        //   Admin reject (X → Revision by admin actor): email user (taskFeedback)
        //   Admin complete (X → Hoàn tất): email user (taskCompleted)
        //
        // Nguyên tắc: hành động của ai → KHÔNG gửi cho chính họ.
        const oldStatus = task.status
        const isAssignee = user.id === task.assigneeId
        const isUserStart = newStatus === 'Đang thực hiện'
            && isAssignee
            && (oldStatus === 'Nhận task' || oldStatus === 'Đã nhận task')
        const isUserDelivery = newStatus === 'Revision'
            && isAssignee
            && oldStatus === 'Đang thực hiện'
            && !!updatedTaskResult.productLink?.trim()
        // [Sprint P audit-fix] Add `!isAssignee` — không gửi taskFeedback email
        // cho user khi chính user là actor (admin reject ≠ user self-action).
        const isAdminResume = newStatus === 'Đang thực hiện' && oldStatus === 'Revision' && !isAssignee
        const isAdminReject = newStatus === 'Revision' && !isUserDelivery && !isAssignee
        const isComplete = newStatus === 'Hoàn tất'

        console.log(`[Email] ${oldStatus} → ${newStatus}, actor=${user.id}, assignee=${task.assigneeId}, isUserStart=${isUserStart}, isUserDelivery=${isUserDelivery}`)

        const userName = updatedTaskResult.assignee?.nickname || updatedTaskResult.assignee?.username || 'User'
        const clientName = updatedTaskResult.client?.name || '—'

        try {
            const { sendEmail } = await import('@/lib/email')
            const { emailTemplates } = await import('@/lib/email-templates')

            // FIRE-AND-FORGET (non-blocking — UI snappy)
            void (async () => {
                try {
                    // ── GĐ3: User Start → email assignedBy admin ──
                    if (isUserStart && updatedTaskResult.assignedBy?.email) {
                        await sendEmail({
                            to: updatedTaskResult.assignedBy.email,
                            subject: `[HustlyTasker] ${userName} đã bắt đầu task`,
                            html: emailTemplates.taskStarted(
                                userName,
                                updatedTaskResult.title,
                                clientName,
                                new Date(),
                            ),
                        })
                        console.log(`[Email] GĐ3 START → admin ${updatedTaskResult.assignedBy.email}`)
                    } else if (isUserStart && !updatedTaskResult.assignedBy?.email) {
                        console.warn(`[Email] GĐ3 SKIPPED: legacy task no assignedBy.email (taskId=${id})`)
                    }

                    // ── GĐ4: User Delivery → email assignedBy admin (taskDelivered) ──
                    if (isUserDelivery && updatedTaskResult.assignedBy?.email) {
                        await sendEmail({
                            to: updatedTaskResult.assignedBy.email,
                            subject: `[HustlyTasker] ${userName} đã nộp video cho task`,
                            html: emailTemplates.taskDelivered(
                                userName,
                                updatedTaskResult.title,
                                clientName,
                                updatedTaskResult.productLink || '',
                            ),
                        })
                        console.log(`[Email] GĐ4 DELIVERY → admin ${updatedTaskResult.assignedBy.email}`)
                    } else if (isUserDelivery && !updatedTaskResult.assignedBy?.email) {
                        console.warn(`[Email] GĐ4 SKIPPED: legacy task no assignedBy.email (taskId=${id})`)
                    }

                    // ── Admin Resume (Revision → Đang thực hiện) → email user ──
                    if (isAdminResume && updatedTaskResult.assignee?.email) {
                        await sendEmail({
                            to: updatedTaskResult.assignee.email,
                            subject: `[Update] Admin đã phản hồi task: ${updatedTaskResult.title}`,
                            html: emailTemplates.taskFeedback(
                                updatedTaskResult.assignee.username || 'User',
                                updatedTaskResult.title,
                                newNotes || 'Admin đã hoàn tất feedback. Bạn có thể tiếp tục công việc.',
                            ),
                        })
                    }

                    // ── Admin Reject → email user (taskFeedback). KHÔNG fire khi isUserDelivery (đã handled above) ──
                    if (isAdminReject && !isUserDelivery && updatedTaskResult.assignee?.email) {
                        await sendEmail({
                            to: updatedTaskResult.assignee.email,
                            subject: `[Action Required] Admin đã gửi Feedback cho task: ${updatedTaskResult.title}`,
                            html: emailTemplates.taskFeedback(
                                updatedTaskResult.assignee.username || 'User',
                                updatedTaskResult.title,
                                newNotes || updatedTaskResult.notes_vi || 'Vui lòng kiểm tra chi tiết trên hệ thống.',
                            ),
                        })
                    }

                    // ── Admin Complete → email user ──
                    if (isComplete && updatedTaskResult.assignee?.email) {
                        await sendEmail({
                            to: updatedTaskResult.assignee.email,
                            subject: `[Success] Chúc mừng! Task "${updatedTaskResult.title}" đã hoàn thành 🎉`,
                            html: emailTemplates.taskCompleted(
                                updatedTaskResult.assignee.username || 'User',
                                updatedTaskResult.title,
                                Number(updatedTaskResult.wageVND || 0),
                            ),
                        })
                    }
                } catch (emailErr) {
                    console.error('[Email] Async block error:', emailErr)
                }
            })()
        } catch (err) {
            console.error('[Email] Failed to load email module:', err)
        }

        // -----------------------
        // [Sprint P] IN-APP NOTIFICATION ROUTING
        // GĐ3 + GĐ4: notify assignedBy admin (NEW — pre-Sprint-P chỉ notify
        // assignee). Existing notifyTaskStatusChanged đã skip self-notify khi
        // actor === assignee → admin reject + admin complete vẫn notify user OK.
        const adminRecipientId = updatedTaskResult.assignedById
        if ((isUserStart || isUserDelivery) && adminRecipientId
            && adminRecipientId !== user.id) {
            void (async () => {
                try {
                    const notifType = isUserStart ? 'TASK_STARTED' : 'TASK_DELIVERED'
                    const notifTitle = isUserStart ? `${userName} đã bắt đầu task` : `${userName} đã nộp video cho task`
                    const notifBody = isUserStart
                        ? `${userName} bắt đầu task "${updatedTaskResult.title}" của khách ${clientName}`
                        : `${userName} đã nộp link cho task "${updatedTaskResult.title}" của khách ${clientName}`

                    const notif = await createNotificationInternal({
                        userId: adminRecipientId,
                        type: notifType as any,
                        title: notifTitle,
                        body: notifBody,
                        taskId: updatedTaskResult.id,
                        actorId: user.id,
                        metadata: { taskTitle: updatedTaskResult.title, clientName },
                    })
                    if (notif) {
                        void broadcastNotificationToUser(adminRecipientId, {
                            id: notif.id,
                            type: notif.type,
                            title: notif.title,
                            body: notif.body,
                            avatarUrl: notif.avatarUrl,
                            conversationId: notif.conversationId,
                            messageId: notif.messageId,
                            taskId: notif.taskId,
                            actorId: notif.actorId,
                            metadata: notif.metadata,
                            createdAt: notif.createdAt.toISOString(),
                            isRead: false,
                        })
                    }
                } catch (notifErr) {
                    console.error('[Notif] Admin notify error:', notifErr)
                }
            })()
        }

        // Existing assignee notify — fires for admin actions (reject/resume/complete)
        // Auto-skip when actor === assignee (line 268 of notifyTaskStatusChanged).
        void notifyTaskStatusChanged(
            updatedTaskResult.id,
            updatedTaskResult.title,
            user.id,
            updatedTaskResult.assigneeId,
            task.status,
            newStatus,
        ).catch(() => {/* swallow */})

        // [Sprint P] Audit log: track 4 lifecycle transitions for forensics
        if (isUserStart) {
            void audit({
                workspaceId,
                actorUserId: user.id,
                action: 'task.started',
                targetType: 'Task',
                targetId: id,
                before: { status: oldStatus },
                after: { status: newStatus },
            })
        } else if (isUserDelivery) {
            void audit({
                workspaceId,
                actorUserId: user.id,
                action: 'task.delivered',
                targetType: 'Task',
                targetId: id,
                before: { status: oldStatus },
                after: { status: newStatus, productLink: updatedTaskResult.productLink },
            })
        } else if (isComplete) {
            void audit({
                workspaceId,
                actorUserId: user.id,
                action: 'task.completed',
                targetType: 'Task',
                targetId: id,
                before: { status: oldStatus },
                after: { status: newStatus },
            })
        }

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/dashboard`)
        revalidatePath(`/${workspaceId}/admin/payroll`)

        return { success: true }
    } catch (e: any) {
        console.error('Update Task Status Error:', e)
        return { error: e.message || 'Failed' }
    }
}

async function notifyTaskStatusChanged(
    taskId: string,
    taskTitle: string,
    actorId: string,
    assigneeId: string | null,
    oldStatus: string,
    newStatus: string,
) {
    if (!assigneeId || assigneeId === actorId) return  // No notification when self-update

    const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { username: true, nickname: true, avatarUrl: true },
    })
    const actorName = actor?.nickname || actor?.username || 'Admin'
    const safeTitle = taskTitle || 'Untitled task'

    try {
        const notif = await createNotificationInternal({
            userId: assigneeId,
            type: 'TASK_STATUS_CHANGED',
            title: 'Task status changed',
            body: `"${safeTitle}" moved from "${oldStatus}" to "${newStatus}" by ${actorName}`,
            avatarUrl: actor?.avatarUrl,
            taskId,
            actorId,
            metadata: { taskTitle: safeTitle, oldStatus, newStatus, actorName },
        })
        void broadcastNotificationToUser(assigneeId, {
            id: notif.id,
            type: notif.type,
            title: notif.title,
            body: notif.body,
            avatarUrl: notif.avatarUrl,
            conversationId: notif.conversationId,
            messageId: notif.messageId,
            taskId: notif.taskId,
            actorId: notif.actorId,
            metadata: notif.metadata,
            createdAt: notif.createdAt.toISOString(),
            isRead: false,
        })
    } catch {/* swallow */}
}
